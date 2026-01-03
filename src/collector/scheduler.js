/**
 * Background Stats Collector Scheduler
 * Runs stats collection on enabled nodes at their configured intervals
 */

const db = require('../db');
const collector = require('./index');
const CircuitBreaker = require('../lib/circuit-breaker');
const ProxmoxPoller = require('./proxmox-poller');
const DiscoveryOrchestrator = require('./discovery-orchestrator');
const ChildPoller = require('./child-poller');
const discovery = require('./discovery');

// Proxmox pollers (nodeId -> ProxmoxPoller)
const proxmoxPollers = new Map();

// Discovery sync timer
let discoverySyncTimer = null;
const DISCOVERY_SYNC_INTERVAL = 120000;  // 2 minutes

// Child discovery timer (runs discovery on child nodes to get guest_ip)
let childDiscoveryTimer = null;
const CHILD_DISCOVERY_INTERVAL = 300000;  // 5 minutes

// Track collection state
let isRunning = false;
let isCollecting = false;
let collectionTimer = null;
let cleanupTimer = null;
let initialCollectionTimer = null;
let startTime = null;

// Track last collection time per node
const lastCollectionTime = new Map();

// Collection statistics
const stats = {
  totalCollections: 0,
  successfulCollections: 0,
  failedCollections: 0,
  totalDurationMs: 0,
  lastRunTime: null,
  errorsLastHour: [],
};

// Minimum interval between collections (in ms)
const MIN_INTERVAL = 10000; // 10 seconds

// Collection tick interval (how often we check for nodes to collect)
const TICK_INTERVAL = 5000; // 5 seconds

// Maximum concurrent collections (semaphore limit)
// Prevents overwhelming SSH connections while enabling parallelism
const MAX_CONCURRENT = 5;

/**
 * Collect stats for a single node
 * @param {Object} node - Node object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function collectNode(node) {
  const startMs = Date.now();
  stats.totalCollections++;

  // Circuit Breaker: Skip collection if breaker is open
  if (!CircuitBreaker.canExecute(node.id)) {
    console.log(`[SCHEDULER] Skipping ${node.name} (circuit breaker open)`);
    return { success: false, error: 'Circuit breaker open', skipped: true };
  }

  try {
    await collector.runStats(node, true);
    const durationMs = Date.now() - startMs;
    stats.successfulCollections++;
    stats.totalDurationMs += durationMs;

    // Circuit Breaker: Record success (closes circuit)
    CircuitBreaker.recordSuccess(node.id);

    console.log(`[SCHEDULER] Stats collected for ${node.name} (${durationMs}ms)`);
    return { success: true, durationMs };
  } catch (err) {
    stats.failedCollections++;
    stats.errorsLastHour.push({ time: Date.now(), node: node.name, error: err.message });

    // Circuit Breaker: Record failure (may open circuit)
    CircuitBreaker.recordFailure(node.id);

    console.error(`[SCHEDULER] Stats collection failed for ${node.name}:`, err.message);
    try {
      db.nodes.setOnline(node.id, false, err.message);
    } catch (dbErr) {
      console.error(`[SCHEDULER] Failed to update node status:`, dbErr.message);
    }
    return { success: false, error: err.message };
  }
}

/**
 * Check which nodes need collection and collect them
 */
async function tick() {
  if (!isRunning || isCollecting) return;

  isCollecting = true;
  stats.lastRunTime = new Date().toISOString();

  // Cleanup errors older than 1 hour
  const oneHourAgo = Date.now() - 3600000;
  stats.errorsLastHour = stats.errorsLastHour.filter(e => e.time > oneHourAgo);

  try {
    const now = Date.now();
    var nodes;
    try {
      nodes = db.nodes.getAll();
    } catch (dbErr) {
      console.error('[SCHEDULER] Failed to get nodes:', dbErr.message);
      return;
    }

    // Filter to nodes that are monitoring-enabled and due for collection
    const nodesToCollect = nodes.filter(function(node) {
      if (!node.monitoring_enabled) return false;

      var lastTime = lastCollectionTime.get(node.id) || 0;
      var interval = (node.monitoring_interval || 30) * 1000;
      var effectiveInterval = Math.max(interval, MIN_INTERVAL);

      return now - lastTime >= effectiveInterval;
    });

    // Collect stats for nodes in parallel (with concurrency limit)
    // Process in chunks of MAX_CONCURRENT to avoid overwhelming SSH
    for (var i = 0; i < nodesToCollect.length; i += MAX_CONCURRENT) {
      if (!isRunning) break;

      // Get chunk of nodes to process in parallel
      var chunk = nodesToCollect.slice(i, i + MAX_CONCURRENT);

      // Get nodes with credentials and filter nulls
      var nodesWithCreds = chunk.map(function(n) {
        return db.nodes.getByIdWithCredentials(n.id);
      }).filter(function(n) {
        return n !== null;
      });

      // Collect all nodes in chunk in parallel
      var results = await Promise.all(nodesWithCreds.map(function(node) {
        return collectNode(node).then(function(result) {
          // Set timestamp AFTER collection attempt (regardless of success)
          // This prevents retry spam on failing nodes
          lastCollectionTime.set(node.id, Date.now());
          return result;
        });
      }));
    }
  } finally {
    isCollecting = false;
  }
}

/**
 * Cleanup old history entries
 */
function cleanupHistory() {
  try {
    const retentionHours = parseInt(db.settings.get('stats_retention_hours', '168'), 10);
    const result = db.stats.cleanupHistory(retentionHours);
    if (result.changes > 0) {
      console.log(`[SCHEDULER] Cleaned up ${result.changes} old history entries`);
    }
  } catch (err) {
    console.error('[SCHEDULER] History cleanup failed:', err.message);
  }
}

/**
 * Start the background collector
 */
function start() {
  if (isRunning) {
    console.log('[SCHEDULER] Already running');
    return;
  }

  isRunning = true;
  startTime = Date.now();
  console.log('[SCHEDULER] Starting background collector');

  // Start collection tick
  collectionTimer = setInterval(tick, TICK_INTERVAL);

  // Run cleanup every hour
  cleanupTimer = setInterval(cleanupHistory, 3600000);

  // Initial cleanup
  cleanupHistory();

  // Initial collection (after a short delay to let the server start)
  initialCollectionTimer = setTimeout(tick, 2000);

  // Start ProxmoxPollers for Proxmox hosts (after Discovery has run)
  // Discovery runs at tick() (2s), so wait 10s to ensure is_proxmox_host is set
  setTimeout(function() {
    startProxmoxPollers();
  }, 10000);

  // Start Discovery Orchestrator sync (syncs VMs/LXCs as child nodes)
  startDiscoverySync();

  // Start Child Pollers (Docker data from VMs/LXCs)
  startChildPollers();

  // Start child discovery (to collect guest_ip for VMs/LXCs)
  startChildDiscovery();
}

/**
 * Start ProxmoxPollers for all Proxmox host nodes
 */
function startProxmoxPollers() {
  try {
    var nodes = db.nodes.getAll();
    nodes.forEach(function(node) {
      if (!node.monitoring_enabled) return;

      var discovery = db.discovery.get(node.id);
      if (discovery && discovery.is_proxmox_host === 1) {
        if (!proxmoxPollers.has(node.id)) {
          var poller = new ProxmoxPoller(node.id);
          poller.start();
          proxmoxPollers.set(node.id, poller);
        }
      }
    });
    console.log('[SCHEDULER] Started ' + proxmoxPollers.size + ' ProxmoxPollers');
  } catch (err) {
    console.error('[SCHEDULER] Failed to start ProxmoxPollers:', err.message);
  }
}

/**
 * Start Discovery Orchestrator periodic sync
 * Syncs VMs/LXCs as child nodes in the nodes table
 */
function startDiscoverySync() {
  // Initial sync after ProxmoxPollers have run (delay to let them populate data)
  // ProxmoxPoller runs every 30s, so wait 45s to ensure first poll is complete
  setTimeout(async function() {
    try {
      var result = await DiscoveryOrchestrator.syncAllHosts();
      console.log('[SCHEDULER] Discovery sync complete: created=' + result.created +
                  ', updated=' + result.updated + ', deleted=' + result.deleted);
    } catch (err) {
      console.error('[SCHEDULER] Discovery sync failed:', err.message);
    }
  }, 45000);  // 45 seconds after start (after first ProxmoxPoller run)

  // Periodic sync
  discoverySyncTimer = setInterval(async function() {
    try {
      await DiscoveryOrchestrator.syncAllHosts();
    } catch (err) {
      console.error('[SCHEDULER] Discovery sync failed:', err.message);
    }
  }, DISCOVERY_SYNC_INTERVAL);
}

/**
 * Start Child Pollers for all Proxmox hosts with child nodes
 * Collects Docker data from VMs/LXCs
 */
function startChildPollers() {
  // Delay to let Discovery Orchestrator create child nodes first (runs at 45s)
  setTimeout(function() {
    try {
      ChildPoller.startAllProxmoxHosts();
    } catch (err) {
      console.error('[SCHEDULER] Failed to start ChildPollers:', err.message);
    }
  }, 60000);  // 60 seconds after start (after DiscoveryOrchestrator)
}

/**
 * Run discovery on child nodes to collect guest_ip
 * Only runs on children that are online and missing guest_ip
 */
async function runChildDiscovery() {
  try {
    var nodes = db.nodes.getAll();

    // Find child nodes that need discovery (missing guest_ip, online, have guest_type)
    var childrenNeedingDiscovery = nodes.filter(function(n) {
      return n.guest_type &&          // Is a child node (VM or LXC)
             n.guest_vmid &&          // Has VMID
             n.online === 1 &&        // Is online
             !n.guest_ip &&           // Missing guest_ip
             n.monitoring_enabled;    // Monitoring enabled
    });

    if (childrenNeedingDiscovery.length === 0) {
      return;
    }

    console.log('[SCHEDULER] Running child discovery for ' + childrenNeedingDiscovery.length + ' children');

    // Process one at a time to avoid overwhelming the system
    for (var i = 0; i < childrenNeedingDiscovery.length; i++) {
      var child = childrenNeedingDiscovery[i];

      try {
        // Circuit breaker check
        if (!CircuitBreaker.canExecute(child.id)) {
          continue;
        }

        await discovery.runDiscoveryForChild(child);
        CircuitBreaker.recordSuccess(child.id);
        console.log('[SCHEDULER] Child discovery complete for ' + child.name);
      } catch (err) {
        CircuitBreaker.recordFailure(child.id);
        console.error('[SCHEDULER] Child discovery failed for ' + child.name + ':', err.message);
      }

      // Small delay between discoveries
      await new Promise(function(resolve) { setTimeout(resolve, 1000); });
    }
  } catch (err) {
    console.error('[SCHEDULER] runChildDiscovery failed:', err.message);
  }
}

/**
 * Start child discovery scheduler
 * Runs discovery on child nodes to collect guest_ip
 */
function startChildDiscovery() {
  // Initial run after everything else is set up (ChildPollers start at 60s)
  setTimeout(function() {
    runChildDiscovery();
  }, 75000);  // 75 seconds after start (after ChildPollers)

  // Periodic run
  childDiscoveryTimer = setInterval(function() {
    runChildDiscovery();
  }, CHILD_DISCOVERY_INTERVAL);
}

/**
 * Stop the background collector
 */
function stop() {
  if (!isRunning) return;

  isRunning = false;
  console.log('[SCHEDULER] Stopping background collector');

  if (collectionTimer) {
    clearInterval(collectionTimer);
    collectionTimer = null;
  }

  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  if (initialCollectionTimer) {
    clearTimeout(initialCollectionTimer);
    initialCollectionTimer = null;
  }

  // Stop all ProxmoxPollers
  proxmoxPollers.forEach(function(poller) {
    poller.stop();
  });
  proxmoxPollers.clear();

  // Stop Discovery sync timer
  if (discoverySyncTimer) {
    clearInterval(discoverySyncTimer);
    discoverySyncTimer = null;
  }

  // Stop all Child Pollers
  ChildPoller.stopAll();

  // Stop child discovery timer
  if (childDiscoveryTimer) {
    clearInterval(childDiscoveryTimer);
    childDiscoveryTimer = null;
  }
}

/**
 * Force immediate collection for a specific node
 * @param {number} nodeId - Node ID
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
async function collectNow(nodeId) {
  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  // Circuit Breaker: Check if manual collection should proceed
  // Manual collections respect circuit breaker to prevent user spam on offline nodes
  if (!CircuitBreaker.canExecute(node.id)) {
    console.log(`[SCHEDULER] Manual collection skipped for ${node.name} (circuit breaker open)`);
    return {
      success: false,
      error: 'Circuit breaker open - node appears offline. Try again in 60 seconds.',
      circuitBreakerOpen: true
    };
  }

  try {
    const data = await collector.runStats(node, true);
    lastCollectionTime.set(node.id, Date.now());

    // Circuit Breaker: Record success
    CircuitBreaker.recordSuccess(node.id);

    return { success: true, data };
  } catch (err) {
    // Circuit Breaker: Record failure
    CircuitBreaker.recordFailure(node.id);

    return { success: false, error: err.message };
  }
}

/**
 * Get scheduler status
 */
function getStatus() {
  return {
    running: isRunning,
    nodeCount: lastCollectionTime.size,
    lastCollections: Object.fromEntries(lastCollectionTime),
  };
}

/**
 * Get collection statistics for metrics
 */
function getStats() {
  const avgDurationMs = stats.totalCollections > 0
    ? Math.round(stats.totalDurationMs / stats.totalCollections)
    : 0;
  const successRate = stats.totalCollections > 0
    ? Math.round((stats.successfulCollections / stats.totalCollections) * 1000) / 10
    : 100;

  return {
    success_rate: successRate,
    avg_duration_ms: avgDurationMs,
    errors_last_hour: stats.errorsLastHour.length,
    last_run: stats.lastRunTime,
    total_collections: stats.totalCollections,
    uptime_seconds: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
  };
}

module.exports = {
  start,
  stop,
  collectNow,
  getStatus,
  getStats,
  tick, // Exported for testing
};

/**
 * Background Stats Collector Scheduler
 * Runs stats collection on enabled nodes at their configured intervals
 */

const db = require('../db');
const collector = require('./index');
const CircuitBreaker = require('../lib/circuit-breaker');

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

    // Collect stats for each node (sequentially to avoid overwhelming the Pi)
    for (var i = 0; i < nodesToCollect.length; i++) {
      if (!isRunning) break;

      // Get node with credentials for SSH connection
      var node = db.nodes.getByIdWithCredentials(nodesToCollect[i].id);
      if (!node) continue;
      await collectNode(node);
      // Set timestamp AFTER successful collection
      lastCollectionTime.set(node.id, Date.now());
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

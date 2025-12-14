/**
 * Background Stats Collector Scheduler
 * Runs stats collection on enabled nodes at their configured intervals
 */

const db = require('../db');
const collector = require('./index');

// Track collection state
let isRunning = false;
let isCollecting = false;
let collectionTimer = null;
let cleanupTimer = null;
let initialCollectionTimer = null;

// Track last collection time per node
const lastCollectionTime = new Map();

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
  try {
    await collector.runStats(node, true);
    console.log(`[SCHEDULER] Stats collected for ${node.name}`);
    return { success: true };
  } catch (err) {
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

      var node = nodesToCollect[i];
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
  const node = db.nodes.getById(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  try {
    const data = await collector.runStats(node, true);
    lastCollectionTime.set(node.id, Date.now());
    return { success: true, data };
  } catch (err) {
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

module.exports = {
  start,
  stop,
  collectNow,
  getStatus,
  tick, // Exported for testing
};

/**
 * Stats API Routes
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../../db');
const collector = require('../../collector');
const { asyncHandler, apiResponse } = require('./helpers');
const { getHierarchicalStats, aggregateChildStats } = require('../../db/stats-aggregation');

// =============================================================================
// METADATA HASH SYSTEM (TOON Integration)
// =============================================================================

/**
 * In-Memory Metadata Hash Cache
 * Structure: Map<nodeId, {hash: string, timestamp: number}>
 * TTL: 5 minutes (300000ms)
 */
const metadataHashCache = new Map();
const HASH_CACHE_TTL = 300000; // 5 min

/**
 * Calculate MD5 hash of node metadata
 * Used for TOON metadata change detection
 *
 * @param {number} nodeId - Node ID
 * @returns {string|null} - 8-char hex hash or null if node not found
 */
function calculateMetadataHash(nodeId) {
  const hardware = db.hardware.getByNodeId(nodeId);

  // Fallback: Use node data if no hardware discovered yet
  if (!hardware) {
    const node = db.nodes.getById(nodeId);
    if (!node) {
      return 'unknown-node';
    }

    // Hash basic node info
    const hashInput = JSON.stringify({
      name: node.name,
      host: node.host,
      type: node.node_type
    });

    return hashString(hashInput);
  }

  // Hash hardware specs (these change = metadata update required)
  const hashInput = JSON.stringify({
    cpu_cores: hardware.cpu_cores || 0,
    cpu_model: hardware.cpu_model || '',
    ram_total: hardware.ram_total_bytes || 0,
    disk_total: hardware.disk_total_bytes || 0
  });

  return hashString(hashInput);
}

/**
 * MD5 hash a string and return 8-char hex
 * Collision probability: ~1:2^32 (acceptable for metadata change detection)
 *
 * @param {string} str - String to hash
 * @returns {string} - 8-character hex hash
 */
function hashString(str) {
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
}

/**
 * Get cached metadata hash or calculate new one
 * Implements 5-minute TTL cache to reduce hash calculation overhead
 *
 * @param {number} nodeId - Node ID
 * @returns {string} - Metadata hash
 */
function getCachedHash(nodeId) {
  const cached = metadataHashCache.get(nodeId);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < HASH_CACHE_TTL) {
    return cached.hash;
  }

  // Cache miss or expired - recalculate
  const hash = calculateMetadataHash(nodeId);
  metadataHashCache.set(nodeId, { hash: hash, timestamp: now });

  return hash;
}

/**
 * Clear metadata hash cache for a specific node
 * Called when hardware data is updated
 *
 * @param {number} nodeId - Node ID
 */
function clearMetadataHashCache(nodeId) {
  metadataHashCache.delete(nodeId);
}

/**
 * Clear all metadata hash cache
 * Useful for system-wide cache invalidation
 */
function clearAllMetadataHashCache() {
  metadataHashCache.clear();
}

// Export hash functions for use in other modules
router.calculateMetadataHash = calculateMetadataHash;
router.getCachedHash = getCachedHash;
router.clearMetadataHashCache = clearMetadataHashCache;
router.clearAllMetadataHashCache = clearAllMetadataHashCache;

// =============================================================================
// STATS API ROUTES
// =============================================================================

// Get current stats for all nodes
router.get('/', asyncHandler(async (req, res) => {
  const stats = db.stats.getAllNodesWithStats();
  apiResponse(res, 200, stats);
}));

// Get current stats for a node
router.get('/node/:id', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  const node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const stats = db.stats.getCurrent(nodeId);
  apiResponse(res, 200, stats || null);
}));

// Get stats history for a node
router.get('/node/:id/history', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  const node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const hours = parseInt(req.query.hours, 10) || 24;
  const history = db.stats.getHistory(nodeId, hours);
  apiResponse(res, 200, history);
}));

// Collect stats now for a node
router.post('/node/:id/collect', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    const data = await collector.runStats(node, true);
    apiResponse(res, 200, data);
  } catch (err) {
    db.nodes.setOnline(node.id, false, err.message);
    apiResponse(res, 503, null, { code: 'STATS_ERROR', message: err.message });
  }
}));

// Get hierarchical stats tree with aggregation
router.get('/hierarchy', asyncHandler(async (req, res) => {
  const tree = getHierarchicalStats();
  apiResponse(res, 200, tree);
}));

// Get aggregated stats for a parent node
router.get('/node/:id/aggregate', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Invalid node ID' });
  }

  const aggregate = aggregateChildStats(nodeId);

  if (!aggregate) {
    return apiResponse(res, 404, null, { code: 'NO_CHILDREN', message: 'Node has no children or not found' });
  }

  apiResponse(res, 200, aggregate);
}));

module.exports = router;

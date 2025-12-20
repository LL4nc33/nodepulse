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
  const hardware = db.hardware.getForNode(nodeId);

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
// TOON FORMATTER (Token-Oriented Object Notation)
// =============================================================================

/**
 * Format stats as TOON (Token-Oriented Object Notation)
 * 17 tokens, pipe-delimited, absolute values (NOT deltas)
 *
 * Format: V1|N:5|C:45.2|R:67.8|D:23.4|U:86400|L1:0.8|L5:1.2|L15:1.5|NR:123456789|NT:987654321|T:45|VM:3|CT:2|DC:5|O:1|TS:1734444000
 *
 * @param {Array} nodes - Array from getAllNodesWithStats()
 * @param {Object} options - {includeMetadata: boolean, clientHash: string}
 * @returns {Object} - {nodes: Array<string>, metadata?: Object, metadata_hash: string}
 */
function formatStatsAsTOON(nodes, options = {}) {
  const includeMetadata = options.includeMetadata !== false;
  const clientHash = options.clientHash || null;
  const toonNodes = [];
  const metadata = {};

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];

    // Handle offline nodes with NULL values
    if (!n.online) {
      const tokens = [
        'V1',
        'N:' + n.id,
        'C:-', 'R:-', 'D:-', 'U:-', // NULL values for offline
        'L1:-', 'L5:-', 'L15:-',
        'NR:-', 'NT:-', 'T:-',
        'VM:-', 'CT:-', 'DC:-',
        'O:0',
        'TS:' + (n.last_seen || Math.floor(Date.now() / 1000))
      ];
      toonNodes.push(tokens.join('|'));

      // Include metadata for offline nodes too
      if (includeMetadata) {
        metadata[n.id] = {
          name: n.name,
          host: n.host,
          type: n.node_type,
          cpu_cores: n.cpu_cores || 0,
          ram_total: n.ram_total_bytes || 0,
          disk_total: n.disk_total_bytes || 0,
          parent_id: n.parent_id,
          monitoring_enabled: n.monitoring_enabled,
          monitoring_interval: n.monitoring_interval
        };
      }
      continue;
    }

    // Build TOON string (17 tokens)
    const tokens = [
      'V1',
      'N:' + n.id,
      'C:' + (n.cpu_percent !== null ? n.cpu_percent.toFixed(1) : '0.0'),
      'R:' + (n.ram_percent !== null ? n.ram_percent.toFixed(1) : '0.0'),
      'D:' + (n.disk_percent !== null ? n.disk_percent.toFixed(1) : '0.0'),
      'U:' + (n.uptime_seconds || 0),
      'L1:' + (n.load_1m !== null ? n.load_1m.toFixed(2) : '0.00'),
      'L5:' + (n.load_5m !== null ? n.load_5m.toFixed(2) : '0.00'),
      'L15:' + (n.load_15m !== null ? n.load_15m.toFixed(2) : '0.00'),
      'NR:' + (n.net_rx_bytes || 0),
      'NT:' + (n.net_tx_bytes || 0),
      'T:' + (n.temp_cpu !== null ? Math.round(n.temp_cpu) : '-'),
      'VM:' + (n.vms_running || 0),
      'CT:' + (n.cts_running || 0),
      'DC:' + (n.containers_running || 0),
      'O:1',
      'TS:' + (n.timestamp || Math.floor(Date.now() / 1000))
    ];

    toonNodes.push(tokens.join('|'));

    // Build metadata (only if requested)
    if (includeMetadata) {
      metadata[n.id] = {
        name: n.name,
        host: n.host,
        type: n.node_type,
        cpu_cores: n.cpu_cores || 0,
        ram_total: n.ram_total_bytes || 0,
        disk_total: n.disk_total_bytes || 0,
        parent_id: n.parent_id,
        monitoring_enabled: n.monitoring_enabled,
        monitoring_interval: n.monitoring_interval
      };
    }
  }

  // Calculate metadata hash
  const metadataStr = JSON.stringify(metadata);
  const metadataHash = hashString(metadataStr);

  const result = {
    nodes: toonNodes,
    metadata_hash: metadataHash
  };

  // Only include metadata if:
  // 1. includeMetadata is true AND
  // 2. Client doesn't have same hash (or no client hash provided)
  if (includeMetadata && (!clientHash || clientHash !== metadataHash)) {
    result.metadata = metadata;
  }

  return result;
}

// Export TOON formatter
router.formatStatsAsTOON = formatStatsAsTOON;

// =============================================================================
// STATS API ROUTES
// =============================================================================

// Get current stats for all nodes
router.get('/', asyncHandler(async (req, res) => {
  const stats = db.stats.getAllNodesWithStats();
  const format = req.query.format || 'json';

  // TOON Format Support
  if (format === 'toon') {
    try {
      const clientHash = req.query.metadata_hash || null;
      const toonData = formatStatsAsTOON(stats, {
        includeMetadata: true,
        clientHash: clientHash
      });

      return apiResponse(res, 200, {
        format: 'toon',
        version: 1,
        ...toonData
      });
    } catch (err) {
      console.error('[TOON] Format error, falling back to JSON:', err.message);
      // Fallback to JSON on error
      return apiResponse(res, 200, stats);
    }
  }

  // Default JSON format
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
  const format = req.query.format || 'json';

  // TOON Format Support
  if (format === 'toon' && stats) {
    try {
      // Merge node + stats for formatter
      const nodeWithStats = { ...node, ...stats };
      const hardware = db.hardware.getForNode(nodeId);
      if (hardware) {
        nodeWithStats.cpu_cores = hardware.cpu_cores;
        nodeWithStats.ram_total_bytes = hardware.ram_total_bytes;
        nodeWithStats.disk_total_bytes = hardware.disk_total_bytes;
      }

      const clientHash = req.query.metadata_hash || null;
      const toonData = formatStatsAsTOON([nodeWithStats], {
        includeMetadata: true,
        clientHash: clientHash
      });

      return apiResponse(res, 200, {
        format: 'toon',
        version: 1,
        ...toonData
      });
    } catch (err) {
      console.error('[TOON] Format error, falling back to JSON:', err.message);
      return apiResponse(res, 200, stats || null);
    }
  }

  // Default JSON format
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
  const format = req.query.format || 'json';

  // TOON Format Support (simplified for history)
  if (format === 'toon' && history.length > 0) {
    try {
      // History: Array of TOON strings (subset of tokens for charts)
      const toonHistory = history.map(h => {
        const tokens = [
          'V1',
          'TS:' + h.timestamp,
          'C:' + (h.cpu_percent !== null ? h.cpu_percent.toFixed(1) : '0.0'),
          'R:' + (h.ram_percent !== null ? h.ram_percent.toFixed(1) : '0.0'),
          'D:' + (h.disk_percent !== null ? h.disk_percent.toFixed(1) : '0.0'),
          'L1:' + (h.load_1m !== null ? h.load_1m.toFixed(2) : '0.00'),
          'L5:' + (h.load_5m !== null ? h.load_5m.toFixed(2) : '0.00'),
          'L15:' + (h.load_15m !== null ? h.load_15m.toFixed(2) : '0.00'),
          'T:' + (h.temp_cpu !== null ? Math.round(h.temp_cpu) : '-')
        ];
        return tokens.join('|');
      });

      return apiResponse(res, 200, {
        format: 'toon',
        version: 1,
        node_id: nodeId,
        hours: hours,
        count: toonHistory.length,
        history: toonHistory
      });
    } catch (err) {
      console.error('[TOON] History format error, falling back to JSON:', err.message);
      return apiResponse(res, 200, history);
    }
  }

  // Default JSON format
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

// Get aggregated cluster stats history (all nodes averaged)
router.get('/cluster/history', asyncHandler(async (req, res) => {
  const hours = parseInt(req.query.hours, 10) || 1;
  const bucketMinutes = parseInt(req.query.bucket, 10) || 5;

  const history = db.stats.getClusterHistory(hours, bucketMinutes);
  apiResponse(res, 200, history);
}));

// Get hierarchical stats tree with aggregation
router.get('/hierarchy', asyncHandler(async (req, res) => {
  const tree = getHierarchicalStats();
  const format = req.query.format || 'json';

  // TOON Format Support
  if (format === 'toon') {
    try {
      // Flatten tree for TOON format
      const flattenTree = (nodes, result = []) => {
        nodes.forEach(n => {
          result.push(n);
          if (n.children && n.children.length > 0) {
            flattenTree(n.children, result);
          }
        });
        return result;
      };

      const flatNodes = flattenTree(tree);
      const clientHash = req.query.metadata_hash || null;
      const toonData = formatStatsAsTOON(flatNodes, {
        includeMetadata: true,
        clientHash: clientHash
      });

      // Build tree structure (IDs only for reconstruction)
      const buildTreeStructure = (nodes) => {
        return nodes.map(n => ({
          id: n.id,
          parent_id: n.parent_id || null,
          children_ids: n.children ? n.children.map(c => c.id) : []
        }));
      };

      return apiResponse(res, 200, {
        format: 'toon',
        version: 1,
        ...toonData,
        tree_structure: buildTreeStructure(tree)
      });
    } catch (err) {
      console.error('[TOON] Hierarchy format error, falling back to JSON:', err.message);
      return apiResponse(res, 200, tree);
    }
  }

  // Default JSON format
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

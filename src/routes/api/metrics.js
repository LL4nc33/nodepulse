/**
 * Metrics API Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../../db');
const scheduler = require('../../collector/scheduler');
const fs = require('fs');
const path = require('path');
const pkg = require('../../../package.json');
const { asyncHandler, apiResponse } = require('./helpers');

// Get system metrics
router.get('/', asyncHandler(async (req, res) => {
  // Node counts
  const nodes = db.nodes.getAll();
  const onlineCount = nodes.filter(n => n.online === 1).length;
  const offlineCount = nodes.length - onlineCount;

  // Collection stats from scheduler
  const collectionStats = scheduler.getStats();

  // System info
  const memUsage = process.memoryUsage();

  // DB size
  let dbSizeBytes = 0;
  try {
    const dbPath = path.join(__dirname, '../../../data/nodepulse.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      dbSizeBytes = stats.size;
    }
  } catch (err) {
    // Ignore errors, keep 0
  }

  apiResponse(res, 200, {
    nodes: {
      total: nodes.length,
      online: onlineCount,
      offline: offlineCount,
    },
    collection: {
      success_rate: collectionStats.success_rate,
      avg_duration_ms: collectionStats.avg_duration_ms,
      errors_last_hour: collectionStats.errors_last_hour,
      last_run: collectionStats.last_run,
      total_collections: collectionStats.total_collections,
    },
    system: {
      uptime_seconds: collectionStats.uptime_seconds,
      memory_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      memory_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      db_size_bytes: dbSizeBytes,
      version: pkg.version,
    },
  });
}));

module.exports = router;

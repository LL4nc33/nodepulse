/**
 * Stats API Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../../db');
const collector = require('../../collector');
const { asyncHandler, apiResponse } = require('./helpers');
const { getHierarchicalStats, aggregateChildStats } = require('../../db/stats-aggregation');

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

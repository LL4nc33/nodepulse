/**
 * Agents Overview API Routes
 * Mounted at /api/agents
 *
 * Provides overview of all agents across nodes.
 */

'use strict';

var express = require('express');
var router = express.Router();
var db = require('../../db');
var agent = require('../../agent');
var helpers = require('./helpers');
var asyncHandler = helpers.asyncHandler;
var apiResponse = helpers.apiResponse;

/**
 * GET /api/agents
 * Get overview of all agents
 */
router.get('/', asyncHandler(async function(req, res) {
  var agents = db.agents.getAll();
  var stats = agent.getOverallStats();
  var hubStatus = agent.getHubStatus();

  apiResponse(res, 200, {
    agents: agents,
    stats: stats,
    hub: {
      connected_count: hubStatus.length,
      connections: hubStatus
    }
  });
}));

/**
 * GET /api/agents/connected
 * Get only connected agents
 */
router.get('/connected', asyncHandler(async function(req, res) {
  var connected = db.agents.getConnected();
  var hubStatus = agent.getHubStatus();

  apiResponse(res, 200, {
    agents: connected,
    count: connected.length,
    hub: hubStatus
  });
}));

/**
 * GET /api/agents/stats
 * Get agent statistics
 */
router.get('/stats', asyncHandler(async function(req, res) {
  var stats = agent.getOverallStats();
  apiResponse(res, 200, stats);
}));

module.exports = router;

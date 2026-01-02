/**
 * Agent API Routes
 * Mounted at /api/nodes/:nodeId/agent
 *
 * Manages NodePulse agent installation, status, and configuration.
 */

'use strict';

var express = require('express');
var router = express.Router({ mergeParams: true });
var db = require('../../db');
var agent = require('../../agent');
var helpers = require('./helpers');
var asyncHandler = helpers.asyncHandler;
var apiResponse = helpers.apiResponse;

/**
 * GET /api/nodes/:nodeId/agent
 * Get agent status for a node
 */
router.get('/', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var status = agent.getAgentStatus(nodeId);
  apiResponse(res, 200, status);
}));

/**
 * POST /api/nodes/:nodeId/agent/install
 * Install agent on a node via SSH
 */
router.post('/install', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH installation
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  if (!node.online) {
    return apiResponse(res, 503, null, { code: 'NODE_OFFLINE', message: 'Node ist offline' });
  }

  // Check if already installed
  var currentStatus = agent.getAgentStatus(nodeId);
  if (currentStatus.enabled && currentStatus.installed_at) {
    return apiResponse(res, 409, null, {
      code: 'ALREADY_INSTALLED',
      message: 'Agent bereits installiert. Nutze /update zum Aktualisieren.'
    });
  }

  try {
    console.log('[API] Installing agent on node ' + nodeId);
    var result = await agent.install(node, req.body || {});
    apiResponse(res, 200, result);
  } catch (err) {
    console.error('[API] Agent installation failed:', err.message);
    apiResponse(res, 500, null, { code: 'INSTALL_FAILED', message: err.message });
  }
}));

/**
 * POST /api/nodes/:nodeId/agent/update
 * Update agent binary on a node
 */
router.post('/update', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  if (!node.online) {
    return apiResponse(res, 503, null, { code: 'NODE_OFFLINE', message: 'Node ist offline' });
  }

  // Check if agent is installed
  var currentStatus = agent.getAgentStatus(nodeId);
  if (!currentStatus.enabled || !currentStatus.installed_at) {
    return apiResponse(res, 400, null, {
      code: 'NOT_INSTALLED',
      message: 'Agent nicht installiert. Nutze /install zuerst.'
    });
  }

  try {
    console.log('[API] Updating agent on node ' + nodeId);
    var result = await agent.update(node);
    apiResponse(res, 200, result);
  } catch (err) {
    console.error('[API] Agent update failed:', err.message);
    apiResponse(res, 500, null, { code: 'UPDATE_FAILED', message: err.message });
  }
}));

/**
 * DELETE /api/nodes/:nodeId/agent
 * Uninstall agent from a node
 */
router.delete('/', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Check if agent is installed
  var currentStatus = agent.getAgentStatus(nodeId);
  if (!currentStatus.enabled) {
    return apiResponse(res, 400, null, {
      code: 'NOT_INSTALLED',
      message: 'Agent nicht installiert'
    });
  }

  try {
    console.log('[API] Uninstalling agent from node ' + nodeId);
    var result = await agent.uninstall(node);
    apiResponse(res, 200, result);
  } catch (err) {
    console.error('[API] Agent uninstall failed:', err.message);
    apiResponse(res, 500, null, { code: 'UNINSTALL_FAILED', message: err.message });
  }
}));

/**
 * PATCH /api/nodes/:nodeId/agent/fallback
 * Toggle SSH fallback setting
 */
router.patch('/fallback', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var enabled = req.body.enabled;
  if (typeof enabled !== 'boolean') {
    return apiResponse(res, 400, null, {
      code: 'INVALID_PARAM',
      message: 'enabled muss boolean sein'
    });
  }

  // Check if agent exists
  var agentInfo = db.agents.get(nodeId);
  if (!agentInfo) {
    // Create agent entry if not exists
    db.agents.save(nodeId, {
      agent_enabled: false,
      ssh_fallback_enabled: enabled
    });
  } else {
    db.agents.setFallback(nodeId, enabled);
  }

  var status = agent.getAgentStatus(nodeId);
  apiResponse(res, 200, status);
}));

/**
 * GET /api/nodes/:nodeId/agent/service
 * Get agent service status (via SSH)
 */
router.get('/service', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  if (!node.online) {
    return apiResponse(res, 503, null, { code: 'NODE_OFFLINE', message: 'Node ist offline' });
  }

  try {
    var status = await agent.getServiceStatus(node);
    apiResponse(res, 200, status);
  } catch (err) {
    apiResponse(res, 500, null, { code: 'SERVICE_CHECK_FAILED', message: err.message });
  }
}));

/**
 * POST /api/nodes/:nodeId/agent/command
 * Execute command via agent (if connected)
 */
router.post('/command', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var command = req.body.command;
  var args = req.body.args || {};

  if (!command || typeof command !== 'string') {
    return apiResponse(res, 400, null, {
      code: 'INVALID_PARAM',
      message: 'command ist erforderlich'
    });
  }

  // Check if agent is connected
  if (!agent.isConnected(nodeId)) {
    return apiResponse(res, 503, null, {
      code: 'AGENT_NOT_CONNECTED',
      message: 'Agent nicht verbunden'
    });
  }

  try {
    var result = await agent.executeCommand(nodeId, command, args);
    apiResponse(res, 200, result);
  } catch (err) {
    apiResponse(res, 500, null, { code: 'COMMAND_FAILED', message: err.message });
  }
}));

/**
 * POST /api/nodes/:nodeId/agent/enable-debug
 * Debug route: Enable agent without SSH installation
 * FOR TESTING ONLY - Returns API key for manual agent configuration
 */
router.post('/enable-debug', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Generate API key and enable agent (without SSH installation)
  var apiKey = db.agents.enable(nodeId);
  console.log('[API] Debug: Agent enabled for node ' + nodeId + ' with API key: ' + apiKey.substring(0, 8) + '...');

  apiResponse(res, 200, {
    message: 'Agent aktiviert (Debug-Modus)',
    api_key: apiKey,
    config: {
      server_url: 'ws://127.0.0.1:3000/agent',
      api_key: apiKey,
      node_id: nodeId,
      push_interval: 5,
      log_level: 'debug'
    }
  });
}));

/**
 * GET /api/nodes/:nodeId/agent/detect-arch
 * Detect architecture of remote node (for manual binary selection)
 */
router.get('/detect-arch', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  if (!node.online) {
    return apiResponse(res, 503, null, { code: 'NODE_OFFLINE', message: 'Node ist offline' });
  }

  try {
    var arch = await agent.detectArch(node);
    apiResponse(res, 200, { arch: arch });
  } catch (err) {
    apiResponse(res, 500, null, { code: 'DETECT_FAILED', message: err.message });
  }
}));

module.exports = router;

/**
 * Tasks API Routes
 * Mounted at /api/nodes/:nodeId/tasks
 */
var express = require('express');
var router = express.Router({ mergeParams: true });
var db = require('../../db');
var ssh = require('../../ssh');
var { asyncHandler, apiResponse } = require('./helpers');

// =====================================================
// GET Endpoints
// =====================================================

// Get all tasks for a node (with filters, filtered by pve_node name)
router.get('/', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Use node.name as pve_node filter (shows only tasks that ran on THIS node)
  var pveNode = node.name;

  var options = {
    limit: parseInt(req.query.limit, 10) || 100,
    offset: parseInt(req.query.offset, 10) || 0,
    type: req.query.type || null,
    status: req.query.status || null,
    vmid: req.query.vmid ? parseInt(req.query.vmid, 10) : null,
    pveNode: pveNode
  };

  var tasks = db.tasks.getTasks(nodeId, options);
  var counts = db.tasks.getTaskCounts(nodeId, pveNode);
  var types = db.tasks.getTaskTypes(nodeId, pveNode);

  apiResponse(res, 200, {
    tasks: tasks,
    counts: counts,
    types: types.map(function(t) { return t.task_type; })
  });
}));

// Get running tasks
router.get('/running', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var runningTasks = db.tasks.getRunningTasks(nodeId);
  apiResponse(res, 200, runningTasks);
}));

// Get single task by UPID
router.get('/:upid', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var upid = req.params.upid;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var task = db.tasks.getTaskByUpid(nodeId, upid);
  if (!task) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Task nicht gefunden' });
  }

  apiResponse(res, 200, task);
}));

// Get task log (live from Proxmox)
router.get('/:upid/log', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var upid = req.params.upid;
  var start = parseInt(req.query.start, 10) || 0;
  var limit = parseInt(req.query.limit, 10) || 500;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate UPID format (basic check)
  if (!upid || !upid.startsWith('UPID:')) {
    return apiResponse(res, 400, null, { code: 'INVALID_UPID', message: 'Ungueltige UPID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Check if Proxmox host
  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    // Extract node name from UPID (format: UPID:nodename:PID:...)
    var upidParts = upid.split(':');
    var pveNode = upidParts[1] || node.name;

    // Get task log via pvesh
    var cmd = "pvesh get '/nodes/" + pveNode + "/tasks/" + upid + "/log' --start " + start + " --limit " + limit + " --output-format json";
    var result = await ssh.execute(node, cmd, 30000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'LOG_ERROR',
        message: 'Konnte Log nicht abrufen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    var logData;
    try {
      logData = JSON.parse(result.stdout);
    } catch (e) {
      return apiResponse(res, 500, null, { code: 'PARSE_ERROR', message: 'Ungueltige Log-Antwort' });
    }

    // logData is an array of { n: lineNumber, t: text }
    var lines = logData.map(function(entry) {
      return { line: entry.n, text: entry.t };
    });

    apiResponse(res, 200, {
      upid: upid,
      start: start,
      limit: limit,
      total: lines.length,
      lines: lines
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

// Get task status (live from Proxmox)
router.get('/:upid/status', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var upid = req.params.upid;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  if (!upid || !upid.startsWith('UPID:')) {
    return apiResponse(res, 400, null, { code: 'INVALID_UPID', message: 'Ungueltige UPID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var upidParts = upid.split(':');
    var pveNode = upidParts[1] || node.name;

    var cmd = "pvesh get '/nodes/" + pveNode + "/tasks/" + upid + "/status' --output-format json";
    var result = await ssh.execute(node, cmd, 30000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'STATUS_ERROR',
        message: 'Konnte Status nicht abrufen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    var statusData;
    try {
      statusData = JSON.parse(result.stdout);
    } catch (e) {
      return apiResponse(res, 500, null, { code: 'PARSE_ERROR', message: 'Ungueltige Status-Antwort' });
    }

    apiResponse(res, 200, statusData);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

// =====================================================
// POST Endpoints
// =====================================================

// Refresh task list (run discovery)
router.post('/refresh', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var collector = require('../../collector');
    await collector.runTaskDiscovery(node);

    // Return counts filtered by this node's name
    var pveNode = node.name;
    var counts = db.tasks.getTaskCounts(nodeId, pveNode);
    apiResponse(res, 200, {
      message: 'Task Discovery abgeschlossen',
      counts: counts
    });
  } catch (err) {
    var errMsg = err && err.message ? err.message : String(err) || 'Unbekannter Fehler';
    console.error('[Tasks API] Refresh error:', errMsg);
    apiResponse(res, 503, null, { code: 'TASK_ERROR', message: errMsg });
  }
}));

// =====================================================
// DELETE Endpoints
// =====================================================

// Stop a running task
router.delete('/:upid', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var upid = req.params.upid;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  if (!upid || !upid.startsWith('UPID:')) {
    return apiResponse(res, 400, null, { code: 'INVALID_UPID', message: 'Ungueltige UPID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var upidParts = upid.split(':');
    var pveNode = upidParts[1] || node.name;

    // Stop the task
    var cmd = "pvesh delete '/nodes/" + pveNode + "/tasks/" + upid + "'";
    var result = await ssh.execute(node, cmd, 30000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'STOP_ERROR',
        message: 'Konnte Task nicht stoppen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    // Refresh task list
    var collector = require('../../collector');
    await collector.runTaskDiscovery(node);

    apiResponse(res, 200, {
      upid: upid,
      message: 'Task gestoppt'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

module.exports = router;

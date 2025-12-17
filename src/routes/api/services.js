/**
 * Services API Routes (systemd)
 * Mounted at /api/nodes/:nodeId/services
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../db');
const ssh = require('../../ssh');
const { asyncHandler, apiResponse } = require('./helpers');

// Get systemd services for a node
router.get('/', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Check if node has systemd
  const discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.has_systemd) {
    return apiResponse(res, 400, null, { code: 'NO_SYSTEMD', message: 'Node hat kein systemd' });
  }

  try {
    // Get list of services with status
    const result = await ssh.execute(node, 'systemctl list-units --type=service --no-pager --plain --no-legend', 30000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'COMMAND_FAILED', message: result.stderr || 'Konnte Services nicht abrufen' });
    }

    // Parse the output
    const services = [];
    const lines = (result.stdout || '').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Format: UNIT LOAD ACTIVE SUB DESCRIPTION
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        const unit = parts[0];
        const load = parts[1];
        const active = parts[2];
        const sub = parts[3];
        const description = parts.slice(4).join(' ');

        // Only include actual services (not template instances, etc)
        if (unit.match(/\.service$/)) {
          services.push({
            name: unit.replace('.service', ''),
            unit: unit,
            load: load,
            active: active,
            sub: sub,
            description: description,
          });
        }
      }
    }

    db.nodes.setOnline(nodeId, true);
    apiResponse(res, 200, { services: services });
  } catch (err) {
    db.nodes.setOnline(nodeId, false, err.message);
    apiResponse(res, 500, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

// Control a systemd service (start/stop/restart)
router.post('/:service/:action', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.nodeId, 10);
  const serviceName = req.params.service;
  const action = req.params.action;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate action
  const validActions = ['start', 'stop', 'restart', 'status'];
  if (validActions.indexOf(action) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_ACTION', message: 'Ungueltige Aktion. Erlaubt: start, stop, restart, status' });
  }

  // Validate service name (only alphanumeric, dash, underscore, @ allowed, max 255 chars)
  if (!serviceName.match(/^[a-zA-Z0-9_@-]+$/) || serviceName.length > 255) {
    return apiResponse(res, 400, null, { code: 'INVALID_SERVICE', message: 'Ungueltiger Service-Name (max. 255 Zeichen)' });
  }

  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Check if node has systemd
  const discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.has_systemd) {
    return apiResponse(res, 400, null, { code: 'NO_SYSTEMD', message: 'Node hat kein systemd' });
  }

  try {
    // Execute systemctl command
    let command = 'sudo systemctl ' + action + ' ' + serviceName + '.service';
    if (action === 'status') {
      command = 'systemctl status ' + serviceName + '.service --no-pager';
    }

    const result = await ssh.execute(node, command, 30000);

    // For status, exitCode != 0 is normal for stopped services
    if (action !== 'status' && result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'COMMAND_FAILED',
        message: result.stderr || 'Aktion fehlgeschlagen',
        output: result.stdout || '',
      });
    }

    db.nodes.setOnline(nodeId, true);
    apiResponse(res, 200, {
      service: serviceName,
      action: action,
      exit_code: result.exitCode,
      output: result.stdout || '',
      error: result.stderr || '',
    });
  } catch (err) {
    db.nodes.setOnline(nodeId, false, err.message);
    apiResponse(res, 500, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

module.exports = router;

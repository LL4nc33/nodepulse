/**
 * Docker API Routes
 * Mounted at /api/nodes/:nodeId/docker
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../db');
const collector = require('../../collector');
const { asyncHandler, apiResponse } = require('./helpers');

// Get all Docker data for a node
router.get('/', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var dockerData = db.docker.getAllForNode(nodeId);
  var summary = db.docker.getSummary(nodeId);
  apiResponse(res, 200, {
    containers: dockerData.containers,
    images: dockerData.images,
    volumes: dockerData.volumes,
    networks: dockerData.networks,
    summary: summary,
  });
}));

// Refresh Docker data for a node (collect from remote)
router.post('/', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var data = await collector.runDocker(node);
    apiResponse(res, 200, data);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Get containers for a node
router.get('/containers', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var containers = db.docker.getContainers(nodeId);
  apiResponse(res, 200, containers);
}));

// Container action (start/stop/restart)
router.post('/containers/:containerId/:action', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var containerId = req.params.containerId;
  var action = req.params.action;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate containerId (hex only, 12-64 chars) - prevent command injection
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CONTAINER_ID', message: 'Ungueltige Container-ID' });
  }

  // Validate action
  var validActions = ['start', 'stop', 'restart', 'pause', 'unpause'];
  if (validActions.indexOf(action) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_ACTION', message: 'Ungueltige Aktion. Erlaubt: ' + validActions.join(', ') });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'docker ' + action + ' ' + containerId;
    var result = await collector.runDockerCommand(node, command, 60000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: result.stderr || 'Aktion fehlgeschlagen' });
    }

    // Refresh container list after action
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, { action: action, containerId: containerId, success: true });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Get container logs
router.get('/containers/:containerId/logs', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var containerId = req.params.containerId;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate containerId (hex only, 12-64 chars) - prevent command injection
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CONTAINER_ID', message: 'Ungueltige Container-ID' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var tail = parseInt(req.query.tail, 10) || 100;
  if (tail > 1000) tail = 1000;
  if (tail < 10) tail = 10;

  try {
    var command = 'docker logs --tail ' + tail + ' ' + containerId + ' 2>&1';
    var result = await collector.runDockerCommand(node, command, 30000);

    apiResponse(res, 200, {
      containerId: containerId,
      logs: result.stdout,
      tail: tail,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Get images for a node
router.get('/images', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var images = db.docker.getImages(nodeId);
  apiResponse(res, 200, images);
}));

// Get volumes for a node
router.get('/volumes', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var volumes = db.docker.getVolumes(nodeId);
  apiResponse(res, 200, volumes);
}));

// Get networks for a node
router.get('/networks', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var networks = db.docker.getNetworks(nodeId);
  apiResponse(res, 200, networks);
}));

// =====================================================
// Docker DELETE Operations (mit force Option)
// =====================================================

// Delete a container
router.delete('/containers/:containerId', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var containerId = req.params.containerId;
  var force = req.query.force === 'true';

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate container ID (hex, 12-64 chars)
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CONTAINER_ID', message: 'Ungueltige Container-ID (hex, 12-64 Zeichen)' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = force ? 'docker rm -f ' + containerId : 'docker rm ' + containerId;
    var result = await collector.runDockerCommand(node, command, 30000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Container konnte nicht geloescht werden';
      // Check for specific errors
      if (errMsg.includes('is running')) {
        return apiResponse(res, 409, null, { code: 'CONTAINER_RUNNING', message: 'Container laeuft noch. Nutze force=true oder stoppe den Container zuerst.' });
      }
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: errMsg });
    }

    // Refresh Docker data
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      containerId: containerId,
      deleted: true,
      forced: force,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Delete an image
router.delete('/images/:imageId', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var imageId = req.params.imageId;
  var force = req.query.force === 'true';

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate image ID (hex sha256, 12-64 chars) or name:tag format
  var isValidHex = /^[a-f0-9]{12,64}$/i.test(imageId);
  var isValidNameTag = /^[a-z0-9][a-z0-9._\/-]*(:[\w][\w.-]*)?$/i.test(imageId);
  if (!isValidHex && !isValidNameTag) {
    return apiResponse(res, 400, null, { code: 'INVALID_IMAGE_ID', message: 'Ungueltige Image-ID oder Name:Tag' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = force ? 'docker rmi -f ' + imageId : 'docker rmi ' + imageId;
    var result = await collector.runDockerCommand(node, command, 60000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Image konnte nicht geloescht werden';
      if (errMsg.includes('image is being used') || errMsg.includes('image has dependent')) {
        return apiResponse(res, 409, null, { code: 'IMAGE_IN_USE', message: 'Image wird von Container(n) verwendet. Nutze force=true fuer forciertes Loeschen.' });
      }
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: errMsg });
    }

    // Refresh Docker data
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      imageId: imageId,
      deleted: true,
      forced: force,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Delete a volume
router.delete('/volumes/:volumeName', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var volumeName = req.params.volumeName;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate volume name (alphanumeric, underscore, dash, dots)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(volumeName)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VOLUME_NAME', message: 'Ungueltiger Volume-Name' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    // Note: docker volume rm has no -f flag, volumes in use cannot be force-deleted
    var command = 'docker volume rm ' + volumeName;
    var result = await collector.runDockerCommand(node, command, 30000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Volume konnte nicht geloescht werden';
      if (errMsg.includes('volume is in use')) {
        return apiResponse(res, 409, null, { code: 'VOLUME_IN_USE', message: 'Volume wird von Container(n) verwendet und kann nicht geloescht werden.' });
      }
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: errMsg });
    }

    // Refresh Docker data
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      volumeName: volumeName,
      deleted: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Delete a network
router.delete('/networks/:networkId', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var networkId = req.params.networkId;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate network ID (hex, 12-64 chars) or name format
  var isValidHex = /^[a-f0-9]{12,64}$/i.test(networkId);
  var isValidName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(networkId);
  if (!isValidHex && !isValidName) {
    return apiResponse(res, 400, null, { code: 'INVALID_NETWORK_ID', message: 'Ungueltige Network-ID oder Name' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'docker network rm ' + networkId;
    var result = await collector.runDockerCommand(node, command, 30000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Network konnte nicht geloescht werden';
      if (errMsg.includes('has active endpoints') || errMsg.includes('network is in use')) {
        return apiResponse(res, 409, null, { code: 'NETWORK_IN_USE', message: 'Network wird von Container(n) verwendet und kann nicht geloescht werden.' });
      }
      // Prevent deletion of default networks
      if (errMsg.includes('bridge') || errMsg.includes('host') || errMsg.includes('none')) {
        return apiResponse(res, 403, null, { code: 'NETWORK_PROTECTED', message: 'Standard-Netzwerke (bridge, host, none) koennen nicht geloescht werden.' });
      }
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: errMsg });
    }

    // Refresh Docker data
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      networkId: networkId,
      deleted: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Docker prune commands
router.post('/prune/:type', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var pruneType = req.params.type;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate prune type
  var validTypes = ['system', 'containers', 'images', 'volumes', 'networks'];
  if (validTypes.indexOf(pruneType) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_TYPE', message: 'Ungueltiger Prune-Typ. Erlaubt: ' + validTypes.join(', ') });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command;
    if (pruneType === 'system') {
      command = 'docker system prune -f';
    } else if (pruneType === 'containers') {
      command = 'docker container prune -f';
    } else if (pruneType === 'images') {
      command = 'docker image prune -a -f';
    } else if (pruneType === 'volumes') {
      command = 'docker volume prune -f';
    } else if (pruneType === 'networks') {
      command = 'docker network prune -f';
    }

    var result = await collector.runDockerCommand(node, command, 120000);

    // Refresh Docker data after prune
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      type: pruneType,
      output: result.stdout,
      success: result.exitCode === 0,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

module.exports = router;

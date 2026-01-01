/**
 * Node Validation Middleware
 * Validates node existence and state for API routes
 *
 * Eliminates repetitive validation code:
 * - const nodeId = parseInt(req.params.nodeId, 10);
 * - const node = db.nodes.getById(nodeId);
 * - if (!node) return apiResponse(res, 404, null, 'Node nicht gefunden');
 *
 * Usage:
 * router.get('/', validateNode(), handler);
 * router.get('/', validateNode({ requireOnline: true }), handler);
 * router.get('/', validateNode({ requireCredentials: true }), handler);
 */

'use strict';

var db = require('../db');

/**
 * Create node validation middleware
 * @param {Object} options - Validation options
 * @param {boolean} options.requireOnline - Require node to be online
 * @param {boolean} options.requireCredentials - Load node with SSH credentials
 * @param {boolean} options.requireProxmox - Require node to be Proxmox host
 * @param {boolean} options.requireDocker - Require node to have Docker
 * @returns {Function} Express middleware
 */
function validateNode(options) {
  options = options || {};

  return function(req, res, next) {
    // Parse node ID from URL params
    var nodeId = parseInt(req.params.nodeId, 10);

    if (isNaN(nodeId) || nodeId < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NODE_ID',
          message: 'Ungültige Node-ID'
        }
      });
    }

    // Get node (with or without credentials)
    var node;
    if (options.requireCredentials) {
      node = db.nodes.getByIdWithCredentials(nodeId);
    } else {
      node = db.nodes.getById(nodeId);
    }

    if (!node) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NODE_NOT_FOUND',
          message: 'Node nicht gefunden'
        }
      });
    }

    // Check online status
    if (options.requireOnline && !node.online) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NODE_OFFLINE',
          message: 'Node ist offline'
        }
      });
    }

    // Check Proxmox requirement
    if (options.requireProxmox) {
      var discovery = db.discovery.get(nodeId);
      if (!discovery || !discovery.is_proxmox_host) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NOT_PROXMOX',
            message: 'Kein Proxmox-Host'
          }
        });
      }
      req.nodeDiscovery = discovery;
    }

    // Check Docker requirement
    if (options.requireDocker) {
      var dockerDiscovery = db.discovery.get(nodeId);
      if (!dockerDiscovery || !dockerDiscovery.has_docker) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_DOCKER',
            message: 'Docker nicht verfügbar'
          }
        });
      }
      req.nodeDiscovery = dockerDiscovery;
    }

    // Attach node to request for handler
    req.node = node;
    req.nodeId = nodeId;

    next();
  };
}

/**
 * Shorthand for common validation patterns
 */
validateNode.basic = function() {
  return validateNode({});
};

validateNode.online = function() {
  return validateNode({ requireOnline: true });
};

validateNode.withCredentials = function() {
  return validateNode({ requireCredentials: true });
};

validateNode.onlineWithCredentials = function() {
  return validateNode({ requireOnline: true, requireCredentials: true });
};

validateNode.proxmox = function() {
  return validateNode({ requireOnline: true, requireCredentials: true, requireProxmox: true });
};

validateNode.docker = function() {
  return validateNode({ requireOnline: true, requireCredentials: true, requireDocker: true });
};

module.exports = validateNode;

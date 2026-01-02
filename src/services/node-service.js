/**
 * Node Service Layer
 *
 * Provides high-level operations on nodes, abstracting the data access
 * and collection logic. This layer will be extended to support both
 * SSH-based collection and Agent-based collection in the future.
 *
 * Architecture:
 * - Routes call service methods
 * - Service decides: use Agent (if available) or SSH (fallback)
 * - Service returns standardized responses
 */

'use strict';

var db = require('../db');
var collector = require('../collector');

/**
 * Get all nodes with current stats
 * Optimized for dashboard display
 * @returns {Array} Nodes with stats
 */
function getAllNodesWithStats() {
  return db.stats.getAllNodesWithStats();
}

/**
 * Get node by ID
 * @param {number} nodeId - Node ID
 * @returns {Object|null} Node or null
 */
function getNode(nodeId) {
  return db.nodes.getById(nodeId);
}

/**
 * Get node with credentials
 * @param {number} nodeId - Node ID
 * @returns {Object|null} Node with SSH credentials
 */
function getNodeWithCredentials(nodeId) {
  return db.nodes.getByIdWithCredentials(nodeId);
}

/**
 * Collect stats for a node
 * In future: will check if Agent is available first
 * @param {Object} node - Node object with credentials
 * @param {boolean} saveHistory - Save to history table
 * @returns {Promise<Object>} Stats data
 */
async function collectStats(node, saveHistory) {
  // TODO: Check if Agent is connected and use Agent.getStats() instead
  // if (agentManager.isConnected(node.id)) {
  //   return agentManager.getStats(node.id);
  // }

  // SSH fallback
  return collector.runStats(node, saveHistory);
}

/**
 * Run discovery on a node
 * @param {Object} node - Node object with credentials
 * @returns {Promise<Object>} Discovery data
 */
async function runDiscovery(node) {
  // TODO: Agent-based discovery in future
  return collector.runDiscovery(node);
}

/**
 * Run full discovery (discovery + hardware + auto-tags)
 * @param {Object} node - Node object with credentials
 * @returns {Promise<Object>} Full discovery result
 */
async function runFullDiscovery(node) {
  return collector.runFullDiscovery(node);
}

/**
 * Collect Docker data for a node
 * @param {Object} node - Node object with credentials
 * @returns {Promise<Object>} Docker data
 */
async function collectDocker(node) {
  // TODO: Agent-based Docker collection in future
  return collector.runDocker(node);
}

/**
 * Execute Docker command on a node
 * @param {Object} node - Node object with credentials
 * @param {string} command - Docker command
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Command result
 */
async function executeDockerCommand(node, command, timeout) {
  return collector.runDockerCommand(node, command, timeout);
}

/**
 * Collect Proxmox data for a node
 * @param {Object} node - Node object with credentials
 * @returns {Promise<Object>} Proxmox data
 */
async function collectProxmox(node) {
  return collector.runProxmox(node);
}

/**
 * Execute Proxmox command on a node
 * @param {Object} node - Node object with credentials
 * @param {string} command - Proxmox command
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Command result
 */
async function executeProxmoxCommand(node, command, timeout) {
  return collector.runProxmoxCommand(node, command, timeout);
}

/**
 * Run network diagnostics on a node
 * @param {Object} node - Node object with credentials
 * @returns {Promise<Object>} Network data
 */
async function runNetworkDiagnostics(node) {
  return collector.runNetworkDiagnostics(node);
}

/**
 * Run ping test from a node
 * @param {Object} node - Node object with credentials
 * @param {string} target - Target to ping
 * @param {number} count - Number of pings
 * @returns {Promise<Object>} Ping results
 */
async function runPingTest(node, target, count) {
  return collector.runPingTest(node, target, count);
}

/**
 * Create a new node
 * @param {Object} data - Node data
 * @returns {Object} Created node
 */
function createNode(data) {
  var nodeId = db.nodes.create({
    name: data.name,
    host: data.host,
    ssh_port: data.ssh_port || 22,
    ssh_user: data.ssh_user,
    ssh_key_path: data.ssh_key_path,
    ssh_password: data.ssh_password,
    parent_id: data.parent_id || null,
    monitoring_enabled: data.monitoring_enabled !== false,
    monitoring_interval: data.monitoring_interval || 30
  });

  return db.nodes.getById(nodeId);
}

/**
 * Update a node
 * @param {number} nodeId - Node ID
 * @param {Object} data - Update data
 * @returns {Object} Updated node
 */
function updateNode(nodeId, data) {
  db.nodes.update(nodeId, data);
  return db.nodes.getById(nodeId);
}

/**
 * Delete a node with proper child handling
 * Implements Delete-Strategy per Petra's Architecture Review
 *
 * @param {number} nodeId - Node ID
 * @param {Object} options - Delete options
 * @param {boolean} options.cascade - If true, recursively delete children
 *                                    If false (default), children become root nodes
 * @returns {Object} Delete result with counts
 */
function deleteNode(nodeId, options) {
  options = options || {};
  var result = {
    deleted: 0,
    orphaned: 0,
    errors: []
  };

  // Get node info for logging
  var node = db.nodes.getById(nodeId);
  if (!node) {
    return { deleted: 0, orphaned: 0, errors: ['Node not found'] };
  }

  // Get children before deleting
  var children = db.nodes.getChildren(nodeId);

  // Handle children based on cascade option
  if (options.cascade && children.length > 0) {
    // Recursive delete: delete all children first (depth-first)
    for (var i = 0; i < children.length; i++) {
      try {
        var childResult = deleteNode(children[i].id, { cascade: true });
        result.deleted += childResult.deleted;
        result.errors = result.errors.concat(childResult.errors);
      } catch (err) {
        result.errors.push('Failed to delete child ' + children[i].name + ': ' + err.message);
      }
    }
  } else if (children.length > 0) {
    // Orphan children: promote them to root nodes
    for (var j = 0; j < children.length; j++) {
      try {
        db.nodes.setParent(children[j].id, null);
        // Clear auto_discovered_from since parent is gone
        db.nodes.setAutoDiscoveredFrom(children[j].id, null);
        result.orphaned++;
        console.log('[NodeService] Orphaned child node: ' + children[j].name + ' (was child of ' + node.name + ')');
      } catch (err) {
        result.errors.push('Failed to orphan child ' + children[j].name + ': ' + err.message);
      }
    }
  }

  // Stop monitoring for this node
  try {
    collector.stopTieredMonitoring(nodeId);
  } catch (err) {
    console.error('[NodeService] Failed to stop monitoring for ' + node.name + ':', err.message);
  }

  // Delete related data
  try {
    // Proxmox data (VMs, CTs, storage, snapshots)
    if (db.proxmox && db.proxmox.deleteForNode) {
      db.proxmox.deleteForNode(nodeId);
    }

    // Docker data
    if (db.docker && db.docker.deleteForNode) {
      db.docker.deleteForNode(nodeId);
    }

    // Discovery data
    if (db.discovery && db.discovery.delete) {
      db.discovery.delete(nodeId);
    }

    // Stats history
    if (db.stats && db.stats.deleteForNode) {
      db.stats.deleteForNode(nodeId);
    }
  } catch (err) {
    result.errors.push('Failed to delete related data: ' + err.message);
  }

  // Finally, delete the node itself
  try {
    db.nodes.delete(nodeId);
    result.deleted++;
    console.log('[NodeService] Deleted node: ' + node.name + ' (ID: ' + nodeId + ')');
  } catch (err) {
    result.errors.push('Failed to delete node: ' + err.message);
  }

  return result;
}

/**
 * Delete a node with all children (cascade)
 * Convenience wrapper for deleteNode with cascade: true
 * @param {number} nodeId - Node ID
 * @returns {Object} Delete result
 */
function deleteNodeCascade(nodeId) {
  return deleteNode(nodeId, { cascade: true });
}

/**
 * Set node online status
 * @param {number} nodeId - Node ID
 * @param {boolean} online - Online status
 * @param {string} lastError - Error message if offline
 */
function setNodeOnline(nodeId, online, lastError) {
  db.nodes.setOnline(nodeId, online, lastError);
}

/**
 * Start monitoring for a node
 * @param {number} nodeId - Node ID
 */
function startMonitoring(nodeId) {
  collector.startTieredMonitoring(nodeId);
}

/**
 * Stop monitoring for a node
 * @param {number} nodeId - Node ID
 * @returns {Promise<void>}
 */
async function stopMonitoring(nodeId) {
  return collector.stopTieredMonitoring(nodeId);
}

// =============================================================================
// FUTURE: Agent Integration Points
// =============================================================================
// These methods will be added when Agent support is implemented:
//
// - isAgentConnected(nodeId) - Check if Agent is online
// - getAgentStatus(nodeId) - Get Agent connection status
// - installAgent(nodeId) - Install Agent via SSH
// - uninstallAgent(nodeId) - Remove Agent via SSH
// - updateAgent(nodeId) - Update Agent binary
// - setAgentFallback(nodeId, enabled) - Enable/disable SSH fallback

module.exports = {
  // Read operations
  getAllNodesWithStats: getAllNodesWithStats,
  getNode: getNode,
  getNodeWithCredentials: getNodeWithCredentials,

  // Collection operations
  collectStats: collectStats,
  runDiscovery: runDiscovery,
  runFullDiscovery: runFullDiscovery,
  collectDocker: collectDocker,
  executeDockerCommand: executeDockerCommand,
  collectProxmox: collectProxmox,
  executeProxmoxCommand: executeProxmoxCommand,
  runNetworkDiagnostics: runNetworkDiagnostics,
  runPingTest: runPingTest,

  // CRUD operations
  createNode: createNode,
  updateNode: updateNode,
  deleteNode: deleteNode,
  deleteNodeCascade: deleteNodeCascade,
  setNodeOnline: setNodeOnline,

  // Monitoring
  startMonitoring: startMonitoring,
  stopMonitoring: stopMonitoring
};

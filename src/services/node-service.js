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
 * Delete a node
 * @param {number} nodeId - Node ID
 */
function deleteNode(nodeId) {
  // Stop monitoring if running
  collector.stopTieredMonitoring(nodeId);

  // Delete from database (cascades to related tables)
  db.nodes.delete(nodeId);
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
  setNodeOnline: setNodeOnline,

  // Monitoring
  startMonitoring: startMonitoring,
  stopMonitoring: stopMonitoring
};

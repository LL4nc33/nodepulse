/**
 * Agent Module
 *
 * Main entry point for agent management functionality.
 * Combines WebSocket Hub and SSH Installer.
 */

'use strict';

var websocketHub = require('./websocket-hub');
var installer = require('./installer');
var db = require('../db');

/**
 * Check if agent-based collection should be used for a node
 * @param {number} nodeId - Node ID
 * @returns {boolean} True if agent is available
 */
function shouldUseAgent(nodeId) {
  // Check if agent is enabled and connected
  var agent = db.agents.get(nodeId);
  if (!agent || !agent.agent_enabled) {
    return false;
  }

  return websocketHub.isConnected(nodeId);
}

/**
 * Get stats from agent (or null if not available)
 * @param {number} nodeId - Node ID
 * @returns {Promise<Object|null>} Stats or null
 */
async function getAgentStats(nodeId) {
  if (!shouldUseAgent(nodeId)) {
    return null;
  }

  try {
    return await websocketHub.sendCommand(nodeId, 'get_stats', {});
  } catch (err) {
    console.error('[Agent] Failed to get stats from agent:', err.message);
    return null;
  }
}

/**
 * Execute command via agent
 * @param {number} nodeId - Node ID
 * @param {string} command - Command type
 * @param {Object} args - Command arguments
 * @returns {Promise<Object>} Command result
 */
async function executeCommand(nodeId, command, args) {
  if (!shouldUseAgent(nodeId)) {
    throw new Error('Agent not available');
  }

  return websocketHub.sendCommand(nodeId, command, args);
}

/**
 * Get agent status for a node
 * @param {number} nodeId - Node ID
 * @returns {Object} Agent status
 */
function getAgentStatus(nodeId) {
  var agent = db.agents.get(nodeId);
  var connected = websocketHub.isConnected(nodeId);

  return {
    enabled: agent ? agent.agent_enabled === 1 : false,
    connected: connected,
    version: agent ? agent.agent_version : null,
    arch: agent ? agent.agent_arch : null,
    ssh_fallback: agent ? agent.ssh_fallback_enabled === 1 : true,
    installed_at: agent ? agent.installed_at : null,
    last_connected: agent ? agent.last_connected_at : null,
    last_heartbeat: agent ? agent.last_heartbeat_at : null
  };
}

/**
 * Get overall agent statistics
 * @returns {Object} Agent statistics
 */
function getOverallStats() {
  var dbStats = db.agents.getStats();
  var connectedCount = websocketHub.getConnectedCount();

  return {
    total: dbStats.total || 0,
    enabled: dbStats.enabled || 0,
    connected: connectedCount
  };
}

module.exports = {
  // WebSocket Hub
  init: websocketHub.init,
  shutdown: websocketHub.shutdown,
  isConnected: websocketHub.isConnected,
  sendCommand: websocketHub.sendCommand,
  getHubStatus: websocketHub.getStatus,

  // Installer
  install: installer.install,
  update: installer.update,
  uninstall: installer.uninstall,
  detectArch: installer.detectArch,
  getServiceStatus: installer.getStatus,

  // High-level functions
  shouldUseAgent: shouldUseAgent,
  getAgentStats: getAgentStats,
  executeCommand: executeCommand,
  getAgentStatus: getAgentStatus,
  getOverallStats: getOverallStats
};

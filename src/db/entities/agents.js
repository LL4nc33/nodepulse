/**
 * Agent Database Entity
 * Manages node agent configuration and status
 */

'use strict';

var crypto = require('crypto');

// getDb wird als Parameter übergeben
var getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

var agents = {
  /**
   * Get agent info for a node
   * @param {number} nodeId - Node ID
   * @returns {Object|null} Agent info or null
   */
  get: function(nodeId) {
    var stmt = getDb().prepare('SELECT * FROM node_agents WHERE node_id = ?');
    return stmt.get(nodeId) || null;
  },

  /**
   * Get all agents
   * @returns {Array} All agent records
   */
  getAll: function() {
    var stmt = getDb().prepare(`
      SELECT a.*, n.name as node_name, n.host, n.online as node_online
      FROM node_agents a
      JOIN nodes n ON a.node_id = n.id
      ORDER BY n.name
    `);
    return stmt.all();
  },

  /**
   * Get all connected agents
   * @returns {Array} Connected agent records
   */
  getConnected: function() {
    var stmt = getDb().prepare(`
      SELECT a.*, n.name as node_name, n.host
      FROM node_agents a
      JOIN nodes n ON a.node_id = n.id
      WHERE a.agent_connected = 1
      ORDER BY n.name
    `);
    return stmt.all();
  },

  /**
   * Create or update agent config for a node
   * @param {number} nodeId - Node ID
   * @param {Object} data - Agent data
   * @returns {Object} Result
   */
  save: function(nodeId, data) {
    var stmt = getDb().prepare(`
      INSERT INTO node_agents (
        node_id, agent_enabled, agent_api_key, ssh_fallback_enabled,
        agent_version, agent_arch, install_method, installed_at
      ) VALUES (
        @node_id, @agent_enabled, @agent_api_key, @ssh_fallback_enabled,
        @agent_version, @agent_arch, @install_method, @installed_at
      )
      ON CONFLICT(node_id) DO UPDATE SET
        agent_enabled = excluded.agent_enabled,
        agent_api_key = COALESCE(excluded.agent_api_key, agent_api_key),
        ssh_fallback_enabled = excluded.ssh_fallback_enabled,
        agent_version = COALESCE(excluded.agent_version, agent_version),
        agent_arch = COALESCE(excluded.agent_arch, agent_arch),
        install_method = COALESCE(excluded.install_method, install_method),
        installed_at = COALESCE(excluded.installed_at, installed_at)
    `);

    return stmt.run({
      node_id: nodeId,
      agent_enabled: data.agent_enabled ? 1 : 0,
      agent_api_key: data.agent_api_key || null,
      ssh_fallback_enabled: data.ssh_fallback_enabled !== false ? 1 : 0,
      agent_version: data.agent_version || null,
      agent_arch: data.agent_arch || null,
      install_method: data.install_method || null,
      installed_at: data.installed_at || null
    });
  },

  /**
   * Set agent connection status
   * @param {number} nodeId - Node ID
   * @param {boolean} connected - Connected status
   * @param {string} version - Agent version (optional)
   */
  setConnected: function(nodeId, connected, version) {
    var now = Math.floor(Date.now() / 1000);
    var stmt;

    if (connected) {
      stmt = getDb().prepare(`
        UPDATE node_agents
        SET agent_connected = 1,
            last_connected_at = ?,
            last_heartbeat_at = ?,
            agent_version = COALESCE(?, agent_version)
        WHERE node_id = ?
      `);
      stmt.run(now, now, version || null, nodeId);
    } else {
      stmt = getDb().prepare(`
        UPDATE node_agents
        SET agent_connected = 0,
            last_disconnected_at = ?
        WHERE node_id = ?
      `);
      stmt.run(now, nodeId);
    }
  },

  /**
   * Update heartbeat timestamp
   * @param {number} nodeId - Node ID
   */
  updateHeartbeat: function(nodeId) {
    var now = Math.floor(Date.now() / 1000);
    var stmt = getDb().prepare(`
      UPDATE node_agents
      SET last_heartbeat_at = ?
      WHERE node_id = ?
    `);
    stmt.run(now, nodeId);
  },

  /**
   * Generate a new API key for agent authentication
   * @returns {string} 64-character hex string
   */
  generateApiKey: function() {
    return crypto.randomBytes(32).toString('hex');
  },

  /**
   * Validate API key and get associated node ID
   * @param {string} apiKey - API key to validate
   * @returns {Object|null} Agent record or null
   */
  validateApiKey: function(apiKey) {
    if (!apiKey || apiKey.length !== 64) return null;

    var stmt = getDb().prepare(`
      SELECT a.*, n.name as node_name
      FROM node_agents a
      JOIN nodes n ON a.node_id = n.id
      WHERE a.agent_api_key = ? AND a.agent_enabled = 1
    `);
    return stmt.get(apiKey) || null;
  },

  /**
   * Enable agent for a node
   * @param {number} nodeId - Node ID
   * @returns {string} Generated API key
   */
  enable: function(nodeId) {
    var apiKey = this.generateApiKey();

    var stmt = getDb().prepare(`
      INSERT INTO node_agents (node_id, agent_enabled, agent_api_key, ssh_fallback_enabled)
      VALUES (?, 1, ?, 1)
      ON CONFLICT(node_id) DO UPDATE SET
        agent_enabled = 1,
        agent_api_key = excluded.agent_api_key
    `);
    stmt.run(nodeId, apiKey);

    return apiKey;
  },

  /**
   * Disable agent for a node
   * @param {number} nodeId - Node ID
   */
  disable: function(nodeId) {
    var stmt = getDb().prepare(`
      UPDATE node_agents
      SET agent_enabled = 0, agent_connected = 0
      WHERE node_id = ?
    `);
    stmt.run(nodeId);
  },

  /**
   * Delete agent config for a node
   * @param {number} nodeId - Node ID
   */
  delete: function(nodeId) {
    var stmt = getDb().prepare('DELETE FROM node_agents WHERE node_id = ?');
    stmt.run(nodeId);
  },

  /**
   * Set SSH fallback setting
   * @param {number} nodeId - Node ID
   * @param {boolean} enabled - Enable SSH fallback
   */
  setFallback: function(nodeId, enabled) {
    var stmt = getDb().prepare(`
      UPDATE node_agents
      SET ssh_fallback_enabled = ?
      WHERE node_id = ?
    `);
    stmt.run(enabled ? 1 : 0, nodeId);
  },

  /**
   * Update agent installation info
   * @param {number} nodeId - Node ID
   * @param {Object} info - Installation info
   */
  setInstalled: function(nodeId, info) {
    var now = Math.floor(Date.now() / 1000);
    var stmt = getDb().prepare(`
      UPDATE node_agents
      SET agent_version = ?,
          agent_arch = ?,
          install_method = ?,
          installed_at = ?
      WHERE node_id = ?
    `);
    stmt.run(
      info.version || null,
      info.arch || null,
      info.method || 'ssh',
      now,
      nodeId
    );
  },

  /**
   * Get agent statistics
   * @returns {Object} Stats
   */
  getStats: function() {
    var stmt = getDb().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN agent_enabled = 1 THEN 1 ELSE 0 END) as enabled,
        SUM(CASE WHEN agent_connected = 1 THEN 1 ELSE 0 END) as connected
      FROM node_agents
    `);
    return stmt.get();
  }
};

module.exports = { init: init, agents: agents };

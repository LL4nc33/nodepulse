'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

var capabilities = {
  // Get capabilities for a node
  get: function(nodeId) {
    return getDb().prepare(
      'SELECT * FROM node_capabilities WHERE node_id = ?'
    ).get(nodeId);
  },

  // Get all node capabilities
  getAll: function() {
    return getDb().prepare(
      'SELECT c.*, n.name as node_name FROM node_capabilities c INNER JOIN nodes n ON c.node_id = n.id'
    ).all();
  },

  // Save or update capabilities for a node
  upsert: function(nodeId, capabilitiesJson, timestamp) {
    var stmt = getDb().prepare(`
      INSERT OR REPLACE INTO node_capabilities (node_id, capabilities_json, last_detected_at)
      VALUES (?, ?, ?)
    `);
    return stmt.run(nodeId, capabilitiesJson, timestamp);
  },

  // Delete capabilities for a node
  delete: function(nodeId) {
    return getDb().prepare('DELETE FROM node_capabilities WHERE node_id = ?').run(nodeId);
  },
};

module.exports = { init, capabilities };

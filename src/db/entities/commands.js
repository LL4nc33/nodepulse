'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

const commands = {
  // Command Templates
  getTemplates: function(category) {
    if (category) {
      return getDb().prepare('SELECT * FROM command_templates WHERE category = ? ORDER BY sort_order, name').all(category);
    }
    return getDb().prepare('SELECT * FROM command_templates ORDER BY category, sort_order, name').all();
  },

  getTemplateById: function(id) {
    return getDb().prepare('SELECT * FROM command_templates WHERE id = ?').get(id);
  },

  getTemplatesForNodeType: function(nodeType) {
    var templates = getDb().prepare('SELECT * FROM command_templates ORDER BY category, sort_order, name').all();
    return templates.filter(function(t) {
      var types = t.node_types.split(',').map(function(s) { return s.trim(); });
      return types.indexOf(nodeType) !== -1 || types.indexOf('all') !== -1;
    });
  },

  createTemplate: function(data) {
    var stmt = getDb().prepare(
      'INSERT INTO command_templates (name, description, category, node_types, template, requires_param, dangerous, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    var result = stmt.run(
      data.name,
      data.description || null,
      data.category,
      data.node_types,
      data.template,
      data.requires_param || null,
      data.dangerous || 0,
      data.sort_order || 0
    );
    return result.lastInsertRowid;
  },

  deleteTemplate: function(id) {
    return getDb().prepare('DELETE FROM command_templates WHERE id = ?').run(id);
  },

  // Command History
  createHistory: function(data) {
    var stmt = getDb().prepare(
      'INSERT INTO command_history (command_template_id, full_command, target_type, target_value) VALUES (?, ?, ?, ?)'
    );
    var result = stmt.run(
      data.command_template_id || null,
      data.full_command,
      data.target_type,
      data.target_value || null
    );
    return result.lastInsertRowid;
  },

  getHistory: function(limit) {
    limit = limit || 50;
    return getDb().prepare(
      'SELECT h.*, t.name as template_name, t.category as template_category FROM command_history h LEFT JOIN command_templates t ON h.command_template_id = t.id ORDER BY h.executed_at DESC LIMIT ?'
    ).all(limit);
  },

  getHistoryForNode: function(nodeId, limit) {
    limit = limit || 20;
    return getDb().prepare(
      'SELECT DISTINCT h.*, t.name as template_name, t.category as template_category FROM command_history h LEFT JOIN command_templates t ON h.command_template_id = t.id INNER JOIN command_results r ON h.id = r.history_id WHERE r.node_id = ? ORDER BY h.executed_at DESC LIMIT ?'
    ).all(nodeId, limit);
  },

  // Command Results
  createResult: function(data) {
    var stmt = getDb().prepare(
      'INSERT INTO command_results (history_id, node_id, status, exit_code, output, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    var result = stmt.run(
      data.history_id,
      data.node_id,
      data.status,
      data.exit_code,
      data.output || null,
      data.error || null,
      data.started_at,
      data.finished_at
    );
    return result.lastInsertRowid;
  },

  getResultsForHistory: function(historyId) {
    return getDb().prepare(
      'SELECT r.*, n.name as node_name FROM command_results r INNER JOIN nodes n ON r.node_id = n.id WHERE r.history_id = ? ORDER BY r.started_at'
    ).all(historyId);
  },

  getResultById: function(id) {
    return getDb().prepare(
      'SELECT r.*, n.name as node_name, h.full_command FROM command_results r INNER JOIN nodes n ON r.node_id = n.id INNER JOIN command_history h ON r.history_id = h.id WHERE r.id = ?'
    ).get(id);
  },

  getLatestResultForNode: function(nodeId) {
    return getDb().prepare(
      'SELECT r.*, h.full_command FROM command_results r INNER JOIN command_history h ON r.history_id = h.id WHERE r.node_id = ? ORDER BY r.started_at DESC LIMIT 1'
    ).get(nodeId);
  },

  // Cleanup old history
  cleanupHistory: function(olderThanDays) {
    olderThanDays = olderThanDays || 30;
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    var cutoffStr = cutoff.toISOString();

    // Delete results first (FK constraint)
    getDb().prepare(
      'DELETE FROM command_results WHERE history_id IN (SELECT id FROM command_history WHERE executed_at < ?)'
    ).run(cutoffStr);

    // Then delete history
    return getDb().prepare('DELETE FROM command_history WHERE executed_at < ?').run(cutoffStr);
  },
};

module.exports = { init, commands };

'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

const alerts = {
  /**
   * Create a new alert
   * @param {Object} data - { node_id, alert_type, alert_level, value, threshold, message }
   */
  create(data) {
    const stmt = getDb().prepare(`
      INSERT INTO alerts_history (node_id, alert_type, alert_level, value, threshold, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Math.floor(Date.now() / 1000);
    const result = stmt.run(
      data.node_id,
      data.alert_type,
      data.alert_level,
      data.value,
      data.threshold,
      data.message,
      now
    );
    return result.lastInsertRowid;
  },

  /**
   * Get all alerts (with optional filters)
   * @param {Object} options - { nodeId, active, limit, offset }
   */
  getAll(options = {}) {
    let sql = `
      SELECT a.*, n.name as node_name, n.host as node_host
      FROM alerts_history a
      LEFT JOIN nodes n ON a.node_id = n.id
      WHERE 1=1
    `;
    const params = [];

    if (options.nodeId) {
      sql += ' AND a.node_id = ?';
      params.push(options.nodeId);
    }

    if (options.active === true) {
      sql += ' AND a.resolved_at IS NULL';
    } else if (options.active === false) {
      sql += ' AND a.resolved_at IS NOT NULL';
    }

    if (options.level) {
      sql += ' AND a.alert_level = ?';
      params.push(options.level);
    }

    sql += ' ORDER BY a.created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const stmt = getDb().prepare(sql);
    return stmt.all(...params);
  },

  /**
   * Get active (unresolved) alerts
   */
  getActive() {
    return this.getAll({ active: true });
  },

  /**
   * Get active alert count
   */
  getActiveCount() {
    const stmt = getDb().prepare(`
      SELECT COUNT(*) as count FROM alerts_history WHERE resolved_at IS NULL
    `);
    return stmt.get().count;
  },

  /**
   * Get active alerts count by level
   */
  getActiveCountByLevel(level) {
    if (level) {
      // Return count for specific level
      const stmt = getDb().prepare(`
        SELECT COUNT(*) as count
        FROM alerts_history
        WHERE resolved_at IS NULL AND alert_level = ?
      `);
      return stmt.get(level).count;
    }

    // Return all levels if no specific level requested
    const stmt = getDb().prepare(`
      SELECT alert_level, COUNT(*) as count
      FROM alerts_history
      WHERE resolved_at IS NULL
      GROUP BY alert_level
    `);
    const rows = stmt.all();
    const result = { warning: 0, critical: 0 };
    rows.forEach(row => {
      result[row.alert_level] = row.count;
    });
    return result;
  },

  /**
   * Get a single alert by ID
   */
  getById(id) {
    const stmt = getDb().prepare(`
      SELECT a.*, n.name as node_name, n.host as node_host
      FROM alerts_history a
      LEFT JOIN nodes n ON a.node_id = n.id
      WHERE a.id = ?
    `);
    return stmt.get(id);
  },

  /**
   * Get active alert for a node/type combination (returns full alert object or null)
   */
  hasActiveAlert(nodeId, alertType) {
    const stmt = getDb().prepare(`
      SELECT * FROM alerts_history
      WHERE node_id = ? AND alert_type = ? AND resolved_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(nodeId, alertType) || null;
  },

  /**
   * Resolve an alert (set resolved_at timestamp)
   */
  resolve(id) {
    const stmt = getDb().prepare(`
      UPDATE alerts_history SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL
    `);
    const now = Math.floor(Date.now() / 1000);
    return stmt.run(now, id).changes > 0;
  },

  /**
   * Resolve all active alerts for a node/type (when value goes back to normal)
   */
  resolveByNodeAndType(nodeId, alertType) {
    const stmt = getDb().prepare(`
      UPDATE alerts_history SET resolved_at = ?
      WHERE node_id = ? AND alert_type = ? AND resolved_at IS NULL
    `);
    const now = Math.floor(Date.now() / 1000);
    return stmt.run(now, nodeId, alertType).changes;
  },

  /**
   * Acknowledge an alert
   */
  acknowledge(id) {
    const stmt = getDb().prepare(`
      UPDATE alerts_history SET acknowledged = 1 WHERE id = ?
    `);
    return stmt.run(id).changes > 0;
  },

  /**
   * Delete old alerts (older than retentionDays)
   */
  cleanup(retentionDays = 90) {
    const stmt = getDb().prepare(`
      DELETE FROM alerts_history
      WHERE created_at < ? AND resolved_at IS NOT NULL
    `);
    const cutoff = Math.floor(Date.now() / 1000) - (retentionDays * 24 * 60 * 60);
    return stmt.run(cutoff).changes;
  },

  /**
   * Delete all alerts for a node
   */
  deleteForNode(nodeId) {
    const stmt = getDb().prepare('DELETE FROM alerts_history WHERE node_id = ?');
    return stmt.run(nodeId).changes;
  },
};

module.exports = { init, alerts };

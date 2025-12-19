'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

var tasks = {
  // === Save/Update Tasks ===
  saveTasks: function(nodeId, taskList) {
    if (!taskList || taskList.length === 0) return;

    var upsertStmt = getDb().prepare(`
      INSERT INTO node_tasks (node_id, upid, pve_node, task_type, vmid, user, status, exitstatus, starttime, endtime, pid, pstart)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_id, upid) DO UPDATE SET
        status = excluded.status,
        exitstatus = excluded.exitstatus,
        endtime = excluded.endtime,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (var i = 0; i < taskList.length; i++) {
      var t = taskList[i];
      upsertStmt.run(
        nodeId,
        t.upid || '',
        t.node || null,
        t.type || 'unknown',
        t.id || null,  // vmid
        t.user || null,
        t.status || 'unknown',
        t.exitstatus || null,
        t.starttime || null,
        t.endtime || null,
        t.pid || null,
        t.pstart || null
      );
    }
  },

  // === Get Tasks (filtered by pve_node name, not node_id) ===
  getTasks: function(nodeId, options) {
    options = options || {};
    var limit = options.limit || 100;
    var offset = options.offset || 0;
    var taskType = options.type || null;
    var status = options.status || null;
    var vmid = options.vmid || null;
    var pveNode = options.pveNode || null;

    // Filter by pve_node (cluster-wide tasks filtered to this node)
    var sql = 'SELECT * FROM node_tasks WHERE pve_node = ?';
    var params = [pveNode];

    if (taskType) {
      sql += ' AND task_type = ?';
      params.push(taskType);
    }
    if (status) {
      if (status === 'running') {
        sql += ' AND status = ?';
        params.push('running');
      } else if (status === 'ok') {
        sql += ' AND (status = ? OR exitstatus = ?)';
        params.push('OK', 'OK');
      } else if (status === 'error') {
        sql += ' AND ((status NOT IN (?, ?, ?) AND status IS NOT NULL) OR (exitstatus IS NOT NULL AND exitstatus != ? AND exitstatus != ?))';
        params.push('running', 'OK', '', 'OK', '');
      }
    }
    if (vmid) {
      sql += ' AND vmid = ?';
      params.push(vmid);
    }

    sql += ' ORDER BY starttime DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return getDb().prepare(sql).all.apply(getDb().prepare(sql), params);
  },

  // === Get single task by UPID ===
  getTaskByUpid: function(nodeId, upid) {
    return getDb().prepare('SELECT * FROM node_tasks WHERE node_id = ? AND upid = ?').get(nodeId, upid);
  },

  // === Get running tasks ===
  getRunningTasks: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_tasks WHERE node_id = ? AND status = ? ORDER BY starttime DESC').all(nodeId, 'running');
  },

  // === Get task count by status (filtered by pve_node) ===
  getTaskCounts: function(nodeId, pveNode) {
    var result = getDb().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'OK' OR exitstatus = 'OK' THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN status NOT IN ('running', 'OK', '') AND status IS NOT NULL THEN 1
            WHEN exitstatus IS NOT NULL AND exitstatus != 'OK' AND exitstatus != '' THEN 1
            ELSE 0 END) as error
      FROM node_tasks WHERE pve_node = ?
    `).get(pveNode);
    return result || { total: 0, running: 0, ok: 0, error: 0 };
  },

  // === Get task types for filter (filtered by pve_node) ===
  getTaskTypes: function(nodeId, pveNode) {
    return getDb().prepare('SELECT DISTINCT task_type FROM node_tasks WHERE pve_node = ? ORDER BY task_type').all(pveNode);
  },

  // === Cleanup old tasks (keep last N days) ===
  cleanupOldTasks: function(nodeId, daysToKeep) {
    daysToKeep = daysToKeep || 30;
    var cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 86400);
    getDb().prepare('DELETE FROM node_tasks WHERE node_id = ? AND starttime < ? AND status != ?').run(nodeId, cutoff, 'running');
  },

  // === Delete all tasks for a node ===
  deleteForNode: function(nodeId) {
    getDb().prepare('DELETE FROM node_tasks WHERE node_id = ?').run(nodeId);
  },
};

module.exports = { init, tasks };

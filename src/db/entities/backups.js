'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

var backups = {
  // === Backup Storages ===
  saveBackupStorages: function(nodeId, storages) {
    var deleteStmt = getDb().prepare('DELETE FROM node_backup_storages WHERE node_id = ?');
    deleteStmt.run(nodeId);

    if (!storages || storages.length === 0) return;

    var insertStmt = getDb().prepare(`
      INSERT INTO node_backup_storages (node_id, storage_id, storage_type, path, content_types, total_bytes, used_bytes, available_bytes, enabled, shared)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (var i = 0; i < storages.length; i++) {
      var s = storages[i];
      insertStmt.run(
        nodeId,
        s.storage,
        s.type || null,
        s.path || null,
        s.content || null,
        s.total || 0,
        s.used || 0,
        s.avail || 0,
        s.enabled ? 1 : 0,
        s.shared ? 1 : 0
      );
    }
  },

  getBackupStorages: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_backup_storages WHERE node_id = ? ORDER BY storage_id').all(nodeId);
  },

  // === Backups ===
  saveBackups: function(nodeId, backupList) {
    var deleteStmt = getDb().prepare('DELETE FROM node_backups WHERE node_id = ?');
    deleteStmt.run(nodeId);

    if (!backupList || backupList.length === 0) return;

    var insertStmt = getDb().prepare(`
      INSERT INTO node_backups (node_id, storage_id, vmid, vm_type, vm_name, filename, size_bytes, format, compression, backup_time, notes, protected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (var i = 0; i < backupList.length; i++) {
      var b = backupList[i];
      insertStmt.run(
        nodeId,
        b.storage || null,
        b.vmid || 0,
        b.vmtype || b.type || 'qemu',
        b.name || null,
        b.volid || b.filename || null,
        b.size || 0,
        b.format || null,
        b.compression || null,
        b.ctime ? new Date(b.ctime * 1000).toISOString() : null,
        b.notes || null,
        b.protected ? 1 : 0
      );
    }
  },

  getBackups: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_backups WHERE node_id = ? ORDER BY backup_time DESC').all(nodeId);
  },

  getBackupsByVmid: function(nodeId, vmid) {
    return getDb().prepare('SELECT * FROM node_backups WHERE node_id = ? AND vmid = ? ORDER BY backup_time DESC').all(nodeId, vmid);
  },

  getBackupsByStorage: function(nodeId, storageId) {
    return getDb().prepare('SELECT * FROM node_backups WHERE node_id = ? AND storage_id = ? ORDER BY backup_time DESC').all(nodeId, storageId);
  },

  // === Backup Jobs ===
  saveBackupJobs: function(nodeId, jobs) {
    var deleteStmt = getDb().prepare('DELETE FROM node_backup_jobs WHERE node_id = ?');
    deleteStmt.run(nodeId);

    if (!jobs || jobs.length === 0) return;

    var insertStmt = getDb().prepare(`
      INSERT INTO node_backup_jobs (node_id, job_id, schedule, vmids, storage_id, mode, compress, mailnotification, enabled, last_run, next_run)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      insertStmt.run(
        nodeId,
        j.id || 'job-' + i,
        j.schedule || null,
        j.vmid || j.all ? 'all' : null,
        j.storage || null,
        j.mode || 'snapshot',
        j.compress || 'zstd',
        j.mailnotification || 'failure',
        j.enabled !== false ? 1 : 0,
        j.last_run || null,
        j.next_run || null
      );
    }
  },

  getBackupJobs: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_backup_jobs WHERE node_id = ? ORDER BY job_id').all(nodeId);
  },

  // === Summary ===
  getSummary: function(nodeId) {
    var backupList = this.getBackups(nodeId);
    var storages = this.getBackupStorages(nodeId);
    var jobs = this.getBackupJobs(nodeId);

    var totalSize = 0;
    var vmidSet = {};
    for (var i = 0; i < backupList.length; i++) {
      totalSize += backupList[i].size_bytes || 0;
      vmidSet[backupList[i].vmid] = true;
    }

    return {
      backup_count: backupList.length,
      storage_count: storages.length,
      job_count: jobs.length,
      total_size_bytes: totalSize,
      unique_vmids: Object.keys(vmidSet).length
    };
  },

  // === Delete all backup data for a node ===
  deleteForNode: function(nodeId) {
    getDb().prepare('DELETE FROM node_backups WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM node_backup_storages WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM node_backup_jobs WHERE node_id = ?').run(nodeId);
  },
};

module.exports = { init, backups };

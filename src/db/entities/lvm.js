'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

// Parse LVM byte values (e.g., "1024207093760B" -> 1024207093760)
function parseLvmBytes(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  var str = String(value).trim();
  // Remove trailing 'B' if present
  if (str.endsWith('B')) {
    str = str.slice(0, -1);
  }
  var num = parseInt(str, 10);
  return isNaN(num) ? 0 : num;
}

var lvm = {
  // === Physical Volumes ===
  savePVs: function(nodeId, pvs) {
    var deleteStmt = getDb().prepare('DELETE FROM node_lvm_pvs WHERE node_id = ?');
    deleteStmt.run(nodeId);

    if (!pvs || pvs.length === 0) return;

    var insertStmt = getDb().prepare(`
      INSERT INTO node_lvm_pvs (node_id, pv_name, vg_name, pv_size_bytes, pv_free_bytes, pv_used_bytes, pv_uuid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (var i = 0; i < pvs.length; i++) {
      var pv = pvs[i];
      var pvSize = parseLvmBytes(pv.pv_size);
      var pvFree = parseLvmBytes(pv.pv_free);
      insertStmt.run(
        nodeId,
        pv.pv_name,
        pv.vg_name || null,
        pvSize,
        pvFree,
        pvSize - pvFree,
        pv.pv_uuid || null
      );
    }
  },

  getPVs: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_lvm_pvs WHERE node_id = ? ORDER BY pv_name').all(nodeId);
  },

  // === Volume Groups ===
  saveVGs: function(nodeId, vgs) {
    // Nicht löschen - nur upsert um registered_storage_id zu erhalten
    var upsertStmt = getDb().prepare(`
      INSERT INTO node_lvm_vgs (node_id, vg_name, vg_size_bytes, vg_free_bytes, vg_used_bytes, pv_count, lv_count, vg_uuid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_id, vg_name) DO UPDATE SET
        vg_size_bytes = excluded.vg_size_bytes,
        vg_free_bytes = excluded.vg_free_bytes,
        vg_used_bytes = excluded.vg_used_bytes,
        pv_count = excluded.pv_count,
        lv_count = excluded.lv_count,
        vg_uuid = excluded.vg_uuid,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (var i = 0; i < vgs.length; i++) {
      var vg = vgs[i];
      var vgSize = parseLvmBytes(vg.vg_size);
      var vgFree = parseLvmBytes(vg.vg_free);
      upsertStmt.run(
        nodeId,
        vg.vg_name,
        vgSize,
        vgFree,
        vgSize - vgFree,
        parseInt(vg.pv_count, 10) || 0,
        parseInt(vg.lv_count, 10) || 0,
        vg.vg_uuid || null
      );
    }
  },

  getVGs: function(nodeId) {
    // Hole VGs mit Info über registrierte Thin Pools darin
    return getDb().prepare(`
      SELECT v.*,
        (SELECT GROUP_CONCAT(l.registered_storage_id)
         FROM node_lvm_lvs l
         WHERE l.node_id = v.node_id AND l.vg_name = v.vg_name
           AND l.is_thin_pool = 1 AND l.registered_storage_id IS NOT NULL
        ) as contains_registered_pools
      FROM node_lvm_vgs v
      WHERE v.node_id = ?
      ORDER BY v.vg_name
    `).all(nodeId);
  },

  getVGByName: function(nodeId, vgName) {
    return getDb().prepare('SELECT * FROM node_lvm_vgs WHERE node_id = ? AND vg_name = ?').get(nodeId, vgName);
  },

  setVGRegistration: function(nodeId, vgName, storageId, storageType) {
    getDb().prepare(`
      UPDATE node_lvm_vgs SET registered_storage_id = ?, registered_storage_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE node_id = ? AND vg_name = ?
    `).run(storageId, storageType, nodeId, vgName);
  },

  // === Logical Volumes ===
  saveLVs: function(nodeId, lvs) {
    // Upsert um registered_storage_id zu erhalten
    var upsertStmt = getDb().prepare(`
      INSERT INTO node_lvm_lvs (node_id, lv_name, vg_name, lv_size_bytes, lv_path, lv_attr, is_thin_pool, thin_pool_name, data_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_id, vg_name, lv_name) DO UPDATE SET
        lv_size_bytes = excluded.lv_size_bytes,
        lv_path = excluded.lv_path,
        lv_attr = excluded.lv_attr,
        is_thin_pool = excluded.is_thin_pool,
        thin_pool_name = excluded.thin_pool_name,
        data_percent = excluded.data_percent,
        updated_at = CURRENT_TIMESTAMP
    `);

    // Track which LVs we've seen to delete removed ones
    var seenLvs = [];

    for (var i = 0; i < (lvs || []).length; i++) {
      var lv = lvs[i];
      // Thin Pool Detection: lv_attr beginnt mit 't' UND hat kein pool_lv (Thin Volumes haben pool_lv gesetzt)
      var isThinPool = lv.lv_attr && lv.lv_attr.charAt(0).toLowerCase() === 't' && !lv.pool_lv ? 1 : 0;
      var lvSize = parseLvmBytes(lv.lv_size);

      upsertStmt.run(
        nodeId,
        lv.lv_name,
        lv.vg_name,
        lvSize,
        lv.lv_path || '/dev/' + lv.vg_name + '/' + lv.lv_name,
        lv.lv_attr || '',
        isThinPool,
        lv.pool_lv || null,
        lv.data_percent ? parseFloat(lv.data_percent) : null
      );
      seenLvs.push(lv.vg_name + '/' + lv.lv_name);
    }

    // Delete LVs that no longer exist
    if (seenLvs.length > 0) {
      var existing = getDb().prepare('SELECT vg_name, lv_name FROM node_lvm_lvs WHERE node_id = ?').all(nodeId);
      var deleteStmt = getDb().prepare('DELETE FROM node_lvm_lvs WHERE node_id = ? AND vg_name = ? AND lv_name = ?');
      for (var j = 0; j < existing.length; j++) {
        var key = existing[j].vg_name + '/' + existing[j].lv_name;
        if (seenLvs.indexOf(key) === -1) {
          deleteStmt.run(nodeId, existing[j].vg_name, existing[j].lv_name);
        }
      }
    } else {
      // Keine LVs mehr - alle löschen
      getDb().prepare('DELETE FROM node_lvm_lvs WHERE node_id = ?').run(nodeId);
    }
  },

  getLVs: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_lvm_lvs WHERE node_id = ? ORDER BY vg_name, lv_name').all(nodeId);
  },

  getThinPools: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_lvm_lvs WHERE node_id = ? AND is_thin_pool = 1 ORDER BY vg_name, lv_name').all(nodeId);
  },

  setLVRegistration: function(nodeId, vgName, lvName, storageId, storageType) {
    getDb().prepare(`
      UPDATE node_lvm_lvs SET registered_storage_id = ?, registered_storage_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE node_id = ? AND vg_name = ? AND lv_name = ?
    `).run(storageId, storageType, nodeId, vgName, lvName);
  },

  // === Available Disks ===
  saveAvailableDisks: function(nodeId, disks) {
    var deleteStmt = getDb().prepare('DELETE FROM node_available_disks WHERE node_id = ?');
    deleteStmt.run(nodeId);

    if (!disks || disks.length === 0) return;

    var insertStmt = getDb().prepare(`
      INSERT INTO node_available_disks (node_id, device_path, size_bytes, model, serial, rotational, has_partitions, in_use)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (var i = 0; i < disks.length; i++) {
      var disk = disks[i];
      insertStmt.run(
        nodeId,
        disk.device_path,
        disk.size_bytes || 0,
        disk.model || null,
        disk.serial || null,
        disk.rotational ? 1 : 0,
        disk.has_partitions ? 1 : 0,
        disk.in_use ? 1 : 0
      );
    }
  },

  getAvailableDisks: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_available_disks WHERE node_id = ? AND in_use = 0 ORDER BY device_path').all(nodeId);
  },

  getAllDisks: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_available_disks WHERE node_id = ? ORDER BY device_path').all(nodeId);
  },

  // === Summary ===
  getSummary: function(nodeId) {
    var vgs = this.getVGs(nodeId);
    var thinPools = this.getThinPools(nodeId);
    var availableDisks = this.getAvailableDisks(nodeId);

    var totalVgSize = 0;
    var totalVgFree = 0;
    var registeredCount = 0;

    for (var i = 0; i < vgs.length; i++) {
      var vg = vgs[i];
      totalVgSize += vg.vg_size_bytes || 0;
      totalVgFree += vg.vg_free_bytes || 0;
      if (vg.registered_storage_id) registeredCount++;
    }

    return {
      vg_count: vgs.length,
      thin_pool_count: thinPools.length,
      available_disk_count: availableDisks.length,
      total_vg_size_bytes: totalVgSize,
      total_vg_free_bytes: totalVgFree,
      registered_count: registeredCount
    };
  },

  // === Delete all LVM data for a node ===
  deleteForNode: function(nodeId) {
    getDb().prepare('DELETE FROM node_lvm_pvs WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM node_lvm_vgs WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM node_lvm_lvs WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM node_available_disks WHERE node_id = ?').run(nodeId);
  },
};

module.exports = { init, lvm };

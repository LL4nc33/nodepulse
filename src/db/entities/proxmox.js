'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

const proxmox = {
  /**
   * Get all Proxmox data for a node
   */
  getAllForNode(nodeId) {
    return {
      vms: this.getVMs(nodeId),
      cts: this.getCTs(nodeId),
      storage: this.getStorage(nodeId),
      snapshots: this.getSnapshots(nodeId),
    };
  },

  /**
   * Get VMs for a node
   */
  getVMs(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM proxmox_vms WHERE node_id = ? ORDER BY vmid
    `);
    return stmt.all(nodeId);
  },

  /**
   * Get a single VM
   */
  getVM(nodeId, vmid) {
    const stmt = getDb().prepare(`
      SELECT * FROM proxmox_vms WHERE node_id = ? AND vmid = ?
    `);
    return stmt.get(nodeId, vmid);
  },

  /**
   * Save VMs for a node (replaces all existing)
   */
  saveVMs(nodeId, vms) {
    const deleteStmt = getDb().prepare('DELETE FROM proxmox_vms WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO proxmox_vms (node_id, vmid, name, status, cpu_cores, memory_bytes, disk_bytes, template)
      VALUES (@node_id, @vmid, @name, @status, @cpu_cores, @memory_bytes, @disk_bytes, @template)
    `);

    const transaction = getDb().transaction(function(vms) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < vms.length; i++) {
        var vm = vms[i];
        insertStmt.run({
          node_id: nodeId,
          vmid: vm.vmid,
          name: vm.name || null,
          status: vm.status || 'unknown',
          cpu_cores: vm.cpu_cores || 1,
          memory_bytes: vm.memory_bytes || 0,
          disk_bytes: vm.disk_bytes || 0,
          template: vm.template ? 1 : 0,
        });
      }
    });

    transaction(vms);
  },

  /**
   * Get CTs for a node
   */
  getCTs(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM proxmox_cts WHERE node_id = ? ORDER BY ctid
    `);
    return stmt.all(nodeId);
  },

  /**
   * Get a single CT
   */
  getCT(nodeId, ctid) {
    const stmt = getDb().prepare(`
      SELECT * FROM proxmox_cts WHERE node_id = ? AND ctid = ?
    `);
    return stmt.get(nodeId, ctid);
  },

  /**
   * Save CTs for a node (replaces all existing)
   */
  saveCTs(nodeId, cts) {
    const deleteStmt = getDb().prepare('DELETE FROM proxmox_cts WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO proxmox_cts (node_id, ctid, name, status, cpu_cores, memory_bytes, disk_bytes, template)
      VALUES (@node_id, @ctid, @name, @status, @cpu_cores, @memory_bytes, @disk_bytes, @template)
    `);

    const transaction = getDb().transaction(function(cts) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < cts.length; i++) {
        var ct = cts[i];
        insertStmt.run({
          node_id: nodeId,
          ctid: ct.ctid,
          name: ct.name || null,
          status: ct.status || 'unknown',
          cpu_cores: ct.cpu_cores || 1,
          memory_bytes: ct.memory_bytes || 0,
          disk_bytes: ct.disk_bytes || 0,
          template: ct.template ? 1 : 0,
        });
      }
    });

    transaction(cts);
  },

  /**
   * Get storage for a node
   */
  getStorage(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM proxmox_storage WHERE node_id = ? ORDER BY storage_name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Save storage for a node (replaces all existing)
   */
  saveStorage(nodeId, storage) {
    const deleteStmt = getDb().prepare('DELETE FROM proxmox_storage WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO proxmox_storage (node_id, storage_name, storage_type, total_bytes, used_bytes, available_bytes)
      VALUES (@node_id, @storage_name, @storage_type, @total_bytes, @used_bytes, @available_bytes)
    `);

    const transaction = getDb().transaction(function(storage) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < storage.length; i++) {
        var s = storage[i];
        insertStmt.run({
          node_id: nodeId,
          storage_name: s.name,
          storage_type: s.type || 'unknown',
          total_bytes: s.total_bytes || 0,
          used_bytes: s.used_bytes || 0,
          available_bytes: s.available_bytes || 0,
        });
      }
    });

    transaction(storage);
  },

  /**
   * Get snapshots for a node
   */
  getSnapshots(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM proxmox_snapshots WHERE node_id = ? ORDER BY vmid, snap_name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Get snapshots for a specific VM/CT
   */
  getSnapshotsForVM(nodeId, vmid, vmType) {
    const stmt = getDb().prepare(`
      SELECT * FROM proxmox_snapshots WHERE node_id = ? AND vmid = ? AND vm_type = ? ORDER BY snap_name
    `);
    return stmt.all(nodeId, vmid, vmType);
  },

  /**
   * Save snapshots for a node (replaces all existing)
   */
  saveSnapshots(nodeId, snapshots) {
    const deleteStmt = getDb().prepare('DELETE FROM proxmox_snapshots WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO proxmox_snapshots (node_id, vmid, vm_type, snap_name, description)
      VALUES (@node_id, @vmid, @vm_type, @snap_name, @description)
    `);

    const transaction = getDb().transaction(function(snapshots) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < snapshots.length; i++) {
        var snap = snapshots[i];
        insertStmt.run({
          node_id: nodeId,
          vmid: snap.vmid,
          vm_type: snap.vm_type || 'vm',
          snap_name: snap.snap_name,
          description: snap.description || null,
        });
      }
    });

    transaction(snapshots);
  },

  /**
   * Save all Proxmox data for a node
   */
  saveAll(nodeId, data) {
    if (data.vms) {
      this.saveVMs(nodeId, data.vms);
    }
    if (data.cts) {
      this.saveCTs(nodeId, data.cts);
    }
    if (data.storage) {
      this.saveStorage(nodeId, data.storage);
    }
    if (data.snapshots) {
      this.saveSnapshots(nodeId, data.snapshots);
    }
  },

  /**
   * Delete all Proxmox data for a node
   */
  deleteForNode(nodeId) {
    getDb().prepare('DELETE FROM proxmox_vms WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM proxmox_cts WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM proxmox_storage WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM proxmox_snapshots WHERE node_id = ?').run(nodeId);
  },

  /**
   * Get summary counts for a node
   */
  getSummary(nodeId) {
    const vms = getDb().prepare('SELECT COUNT(*) as count FROM proxmox_vms WHERE node_id = ?').get(nodeId);
    const vmsRunning = getDb().prepare("SELECT COUNT(*) as count FROM proxmox_vms WHERE node_id = ? AND status = 'running'").get(nodeId);
    const cts = getDb().prepare('SELECT COUNT(*) as count FROM proxmox_cts WHERE node_id = ?').get(nodeId);
    const ctsRunning = getDb().prepare("SELECT COUNT(*) as count FROM proxmox_cts WHERE node_id = ? AND status = 'running'").get(nodeId);
    const storage = getDb().prepare('SELECT COUNT(*) as count FROM proxmox_storage WHERE node_id = ?').get(nodeId);
    const snapshots = getDb().prepare('SELECT COUNT(*) as count FROM proxmox_snapshots WHERE node_id = ?').get(nodeId);

    return {
      vms_total: vms.count,
      vms_running: vmsRunning.count,
      cts_total: cts.count,
      cts_running: ctsRunning.count,
      storage_count: storage.count,
      snapshots_count: snapshots.count,
    };
  },

  /**
   * Update VM/CT status only (lightweight, for polling)
   * Does not replace all data, only updates status field
   */
  updateStatus(nodeId, data) {
    const database = getDb();

    if (data.vms && data.vms.length > 0) {
      const updateVM = database.prepare(
        'UPDATE proxmox_vms SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND vmid = ?'
      );
      for (let i = 0; i < data.vms.length; i++) {
        updateVM.run(data.vms[i].status, nodeId, data.vms[i].vmid);
      }
    }

    if (data.cts && data.cts.length > 0) {
      const updateCT = database.prepare(
        'UPDATE proxmox_cts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND ctid = ?'
      );
      for (let j = 0; j < data.cts.length; j++) {
        updateCT.run(data.cts[j].status, nodeId, data.cts[j].ctid);
      }
    }
  },

  /**
   * Sync VMs/CTs from poller - adds new, removes deleted, updates existing
   * This is more thorough than updateStatus() - it keeps the list in sync
   */
  syncFromPoller(nodeId, data) {
    const database = getDb();

    // Sync VMs
    if (data.vms) {
      const currentVMs = this.getVMs(nodeId);
      const currentVMIDs = currentVMs.map(function(vm) { return vm.vmid; });
      const newVMIDs = data.vms.map(function(vm) { return vm.vmid; });

      // Delete VMs that no longer exist
      const toDelete = currentVMIDs.filter(function(id) {
        return newVMIDs.indexOf(id) === -1;
      });
      if (toDelete.length > 0) {
        const deleteStmt = database.prepare(
          'DELETE FROM proxmox_vms WHERE node_id = ? AND vmid = ?'
        );
        for (let i = 0; i < toDelete.length; i++) {
          deleteStmt.run(nodeId, toDelete[i]);
        }
      }

      // Upsert VMs (INSERT OR REPLACE)
      const upsertStmt = database.prepare(`
        INSERT INTO proxmox_vms (node_id, vmid, name, status, cpu_cores, memory_bytes, disk_bytes, template)
        VALUES (@node_id, @vmid, @name, @status, @cpu_cores, @memory_bytes, @disk_bytes, @template)
        ON CONFLICT(node_id, vmid) DO UPDATE SET
          name = COALESCE(@name, name),
          status = @status,
          updated_at = CURRENT_TIMESTAMP
      `);
      for (let j = 0; j < data.vms.length; j++) {
        const vm = data.vms[j];
        upsertStmt.run({
          node_id: nodeId,
          vmid: vm.vmid,
          name: vm.name || null,
          status: vm.status || 'unknown',
          cpu_cores: 1,
          memory_bytes: 0,
          disk_bytes: 0,
          template: 0
        });
      }
    }

    // Sync CTs
    if (data.cts) {
      const currentCTs = this.getCTs(nodeId);
      const currentCTIDs = currentCTs.map(function(ct) { return ct.ctid; });
      const newCTIDs = data.cts.map(function(ct) { return ct.ctid; });

      // Delete CTs that no longer exist
      const toDeleteCT = currentCTIDs.filter(function(id) {
        return newCTIDs.indexOf(id) === -1;
      });
      if (toDeleteCT.length > 0) {
        const deleteStmtCT = database.prepare(
          'DELETE FROM proxmox_cts WHERE node_id = ? AND ctid = ?'
        );
        for (let k = 0; k < toDeleteCT.length; k++) {
          deleteStmtCT.run(nodeId, toDeleteCT[k]);
        }
      }

      // Upsert CTs (INSERT OR REPLACE)
      const upsertStmtCT = database.prepare(`
        INSERT INTO proxmox_cts (node_id, ctid, name, status, cpu_cores, memory_bytes, disk_bytes, template)
        VALUES (@node_id, @ctid, @name, @status, @cpu_cores, @memory_bytes, @disk_bytes, @template)
        ON CONFLICT(node_id, ctid) DO UPDATE SET
          name = COALESCE(@name, name),
          status = @status,
          updated_at = CURRENT_TIMESTAMP
      `);
      for (let l = 0; l < data.cts.length; l++) {
        const ct = data.cts[l];
        upsertStmtCT.run({
          node_id: nodeId,
          ctid: ct.ctid,
          name: ct.name || null,
          status: ct.status || 'unknown',
          cpu_cores: 1,
          memory_bytes: 0,
          disk_bytes: 0,
          template: 0
        });
      }
    }
  },
};

module.exports = { init, proxmox };

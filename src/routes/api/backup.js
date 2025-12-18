/**
 * Backup API Routes
 * Mounted at /api/nodes/:nodeId/backup
 */
var express = require('express');
var router = express.Router({ mergeParams: true });
var db = require('../../db');
var { asyncHandler, apiResponse } = require('./helpers');

// =====================================================
// GET Endpoints (Read-Only)
// =====================================================

// Alle Backup-Daten fuer einen Node
router.get('/', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  apiResponse(res, 200, {
    storages: db.backups.getBackupStorages(nodeId),
    backups: db.backups.getBackups(nodeId),
    jobs: db.backups.getBackupJobs(nodeId),
    summary: db.backups.getSummary(nodeId)
  });
}));

// Nur Backup Storages
router.get('/storages', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  apiResponse(res, 200, db.backups.getBackupStorages(nodeId));
}));

// Nur Backups
router.get('/list', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var vmid = req.query.vmid ? parseInt(req.query.vmid, 10) : null;
  var storage = req.query.storage || null;

  var backupList;
  if (vmid) {
    backupList = db.backups.getBackupsByVmid(nodeId, vmid);
  } else if (storage) {
    backupList = db.backups.getBackupsByStorage(nodeId, storage);
  } else {
    backupList = db.backups.getBackups(nodeId);
  }

  apiResponse(res, 200, backupList);
}));

// Nur Backup Jobs
router.get('/jobs', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  apiResponse(res, 200, db.backups.getBackupJobs(nodeId));
}));

// Backup Discovery ausfuehren (Refresh)
router.post('/refresh', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Pruefen ob Proxmox Host
  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var collector = require('../../collector');
    await collector.runBackupDiscovery(node);
    apiResponse(res, 200, {
      message: 'Backup Discovery abgeschlossen',
      summary: db.backups.getSummary(nodeId)
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'BACKUP_ERROR', message: err.message });
  }
}));

// =====================================================
// POST Endpoints (Create Backup)
// =====================================================

// Backup erstellen (vzdump)
router.post('/create', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var vmid = parseInt(req.body.vmid, 10);
  var storage = req.body.storage;
  var mode = req.body.mode || 'snapshot';
  var compress = req.body.compress || 'zstd';
  var notes = req.body.notes || '';

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  if (isNaN(vmid) || vmid < 100) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige VMID' });
  }

  // Validierung: Mode
  var validModes = ['snapshot', 'suspend', 'stop'];
  if (validModes.indexOf(mode) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_MODE', message: 'Mode muss snapshot, suspend oder stop sein' });
  }

  // Validierung: Compress
  var validCompress = ['zstd', 'gzip', 'lzo', '0'];
  if (validCompress.indexOf(compress) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_COMPRESS', message: 'Ungueltige Kompression' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var collector = require('../../collector');
    var hostname = node.name;

    // vzdump Command bauen
    var cmd = 'vzdump ' + vmid + ' --mode ' + mode + ' --compress ' + compress;
    if (storage) {
      cmd += ' --storage ' + storage;
    }
    if (notes) {
      // Notes escapen
      var escapedNotes = notes.replace(/'/g, "'\\''");
      cmd += " --notes-template '" + escapedNotes + "'";
    }

    // Backup ausfuehren (kann lange dauern)
    var result = await collector.runCommand(node, cmd, 600000); // 10 Minuten Timeout

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'BACKUP_FAILED',
        message: 'Backup fehlgeschlagen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    // Discovery aktualisieren um neues Backup zu sehen
    await collector.runBackupDiscovery(node);

    apiResponse(res, 201, {
      vmid: vmid,
      storage: storage,
      mode: mode,
      message: 'Backup erfolgreich erstellt'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'BACKUP_ERROR', message: err.message });
  }
}));

// =====================================================
// DELETE Endpoints
// =====================================================

// Backup loeschen
router.delete('/:volid', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var volid = req.params.volid;
  var confirmVolid = req.body.confirm_volid;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // volid Format: storage:backup/vzdump-type-vmid-date.vma.zst
  if (!volid || !volid.includes(':')) {
    return apiResponse(res, 400, null, { code: 'INVALID_VOLID', message: 'Ungueltige Volume ID' });
  }

  // Sicherheits-Bestaetigung
  if (confirmVolid !== volid) {
    return apiResponse(res, 400, null, {
      code: 'CONFIRMATION_REQUIRED',
      message: 'Bestaetigung erforderlich: confirm_volid muss der Volume ID entsprechen'
    });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var collector = require('../../collector');
    var storage = volid.split(':')[0];
    var hostname = node.name;

    // pvesh delete /nodes/{node}/storage/{storage}/content/{volid}
    var cmd = "pvesh delete '/nodes/" + hostname + "/storage/" + storage + "/content/" + volid + "'";
    var result = await collector.runCommand(node, cmd, 60000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'DELETE_FAILED',
        message: 'Loeschen fehlgeschlagen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    // Discovery aktualisieren
    await collector.runBackupDiscovery(node);

    apiResponse(res, 200, {
      volid: volid,
      message: 'Backup erfolgreich geloescht'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'BACKUP_ERROR', message: err.message });
  }
}));

// =====================================================
// Restore Endpoint
// =====================================================

// VM/CT aus Backup wiederherstellen
router.post('/restore', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var volid = req.body.volid;
  var targetVmid = parseInt(req.body.target_vmid, 10);
  var targetStorage = req.body.target_storage;
  var startAfterRestore = req.body.start === true;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  if (!volid || !volid.includes(':')) {
    return apiResponse(res, 400, null, { code: 'INVALID_VOLID', message: 'Ungueltige Volume ID' });
  }

  if (isNaN(targetVmid) || targetVmid < 100) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige Ziel-VMID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var collector = require('../../collector');
    var hostname = node.name;

    // Typ aus volid ermitteln (vzdump-qemu oder vzdump-lxc)
    var isLxc = volid.includes('vzdump-lxc');
    var restoreCmd;

    if (isLxc) {
      // pct restore <vmid> <backup> [OPTIONS]
      restoreCmd = 'pct restore ' + targetVmid + ' ' + volid;
      if (targetStorage) {
        restoreCmd += ' --storage ' + targetStorage;
      }
    } else {
      // qmrestore <backup> <vmid> [OPTIONS]
      restoreCmd = 'qmrestore ' + volid + ' ' + targetVmid;
      if (targetStorage) {
        restoreCmd += ' --storage ' + targetStorage;
      }
    }

    // Restore ausfuehren (kann lange dauern)
    var result = await collector.runCommand(node, restoreCmd, 1800000); // 30 Minuten Timeout

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'RESTORE_FAILED',
        message: 'Restore fehlgeschlagen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    // Optional: VM/CT starten
    if (startAfterRestore) {
      var startCmd = isLxc ? 'pct start ' + targetVmid : 'qm start ' + targetVmid;
      await collector.runCommand(node, startCmd, 60000);
    }

    apiResponse(res, 201, {
      volid: volid,
      target_vmid: targetVmid,
      type: isLxc ? 'lxc' : 'qemu',
      message: 'Restore erfolgreich' + (startAfterRestore ? ' und gestartet' : '')
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'RESTORE_ERROR', message: err.message });
  }
}));

module.exports = router;

/**
 * Storage API Routes (LVM Management)
 * Mounted at /api/nodes/:nodeId/storage
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../db');
const { asyncHandler, apiResponse } = require('./helpers');

// =====================================================
// Input Validation
// =====================================================

// VG/Pool Namen: Muss mit Buchstabe beginnen, nur a-z, 0-9, _, -
var VG_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/;

// Device Pfade: Nur erlaubte Geraete
var DEVICE_PATH_REGEX = /^\/dev\/(sd[a-z]+|nvme\d+n\d+(p\d+)?|vd[a-z]+)$/;

// Storage IDs fuer Proxmox
var STORAGE_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;

function validateVgName(name) {
  if (!name || typeof name !== 'string') return false;
  return VG_NAME_REGEX.test(name);
}

function validateDevicePath(path) {
  if (!path || typeof path !== 'string') return false;
  return DEVICE_PATH_REGEX.test(path);
}

function validateStorageId(id) {
  if (!id || typeof id !== 'string') return false;
  return STORAGE_ID_REGEX.test(id);
}

// Shell-Escape fuer sichere Befehlsausfuehrung
function shellEscape(str) {
  if (!str) return "''";
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

// =====================================================
// GET Endpoints (Read-Only)
// =====================================================

// Alle LVM Daten fuer einen Node
router.get('/lvm', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  apiResponse(res, 200, {
    pvs: db.lvm.getPVs(nodeId),
    vgs: db.lvm.getVGs(nodeId),
    lvs: db.lvm.getLVs(nodeId),
    thin_pools: db.lvm.getThinPools(nodeId),
    available_disks: db.lvm.getAvailableDisks(nodeId),
    summary: db.lvm.getSummary(nodeId)
  });
}));

// Nur Volume Groups
router.get('/lvm/vgs', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  apiResponse(res, 200, db.lvm.getVGs(nodeId));
}));

// Nur Thin Pools
router.get('/lvm/thinpools', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  apiResponse(res, 200, db.lvm.getThinPools(nodeId));
}));

// Verfuegbare (nicht-registrierte) VGs/Pools
router.get('/lvm/available', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var vgs = db.lvm.getVGs(nodeId).filter(function(vg) {
    return !vg.registered_storage_id;
  });

  var thinPools = db.lvm.getThinPools(nodeId).filter(function(pool) {
    return !pool.registered_storage_id;
  });

  apiResponse(res, 200, {
    vgs: vgs,
    thin_pools: thinPools
  });
}));

// LVM Discovery ausfuehren (Refresh)
router.post('/lvm/refresh', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    // Lazy-require collector to avoid circular dependency
    var collector = require('../../collector');
    await collector.runLvmDiscovery(node);
    apiResponse(res, 200, {
      message: 'LVM Discovery abgeschlossen',
      summary: db.lvm.getSummary(nodeId)
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'LVM_ERROR', message: err.message });
  }
}));

// =====================================================
// POST Endpoints (Create Operations)
// =====================================================

// VG erstellen
router.post('/lvm/vg', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var vgName = req.body.vg_name;
  var devices = req.body.devices; // Array von Device-Pfaden

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validierung: VG Name
  if (!validateVgName(vgName)) {
    return apiResponse(res, 400, null, {
      code: 'INVALID_VG_NAME',
      message: 'VG Name muss mit Buchstabe beginnen und darf nur a-z, 0-9, _, - enthalten (max 63 Zeichen)'
    });
  }

  // Validierung: Devices
  if (!devices || !Array.isArray(devices) || devices.length === 0) {
    return apiResponse(res, 400, null, { code: 'MISSING_DEVICES', message: 'Mindestens ein Device erforderlich' });
  }

  if (devices.length > 16) {
    return apiResponse(res, 400, null, { code: 'TOO_MANY_DEVICES', message: 'Maximal 16 Devices erlaubt' });
  }

  for (var i = 0; i < devices.length; i++) {
    if (!validateDevicePath(devices[i])) {
      return apiResponse(res, 400, null, {
        code: 'INVALID_DEVICE',
        message: 'Ungueltiger Device-Pfad: ' + devices[i]
      });
    }
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var collector = require('../../collector');

    // 1. Physical Volumes erstellen
    for (var j = 0; j < devices.length; j++) {
      var pvCmd = 'pvcreate -y ' + devices[j];
      var pvResult = await collector.runCommand(node, pvCmd, 60000);
      if (pvResult.exitCode !== 0) {
        return apiResponse(res, 500, null, {
          code: 'PV_CREATE_FAILED',
          message: 'PV erstellen fehlgeschlagen fuer ' + devices[j] + ': ' + (pvResult.stderr || 'Unbekannter Fehler')
        });
      }
    }

    // 2. Volume Group erstellen
    var vgCmd = 'vgcreate ' + shellEscape(vgName) + ' ' + devices.join(' ');
    var vgResult = await collector.runCommand(node, vgCmd, 60000);

    if (vgResult.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'VG_CREATE_FAILED',
        message: 'VG erstellen fehlgeschlagen: ' + (vgResult.stderr || 'Unbekannter Fehler')
      });
    }

    // 3. LVM Discovery aktualisieren
    await collector.runLvmDiscovery(node);

    apiResponse(res, 201, {
      vg_name: vgName,
      devices: devices,
      message: 'Volume Group erfolgreich erstellt'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'LVM_ERROR', message: err.message });
  }
}));

// Thin Pool erstellen
router.post('/lvm/thinpool', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var vgName = req.body.vg_name;
  var poolName = req.body.pool_name;
  var sizePercent = parseInt(req.body.size_percent, 10) || 90; // Default: 90% der VG

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validierung: VG Name
  if (!validateVgName(vgName)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VG_NAME', message: 'Ungueltiger VG Name' });
  }

  // Validierung: Pool Name
  if (!validateVgName(poolName)) {
    return apiResponse(res, 400, null, {
      code: 'INVALID_POOL_NAME',
      message: 'Pool Name muss mit Buchstabe beginnen und darf nur a-z, 0-9, _, - enthalten'
    });
  }

  // Validierung: Size Percent
  if (isNaN(sizePercent) || sizePercent < 10 || sizePercent > 100) {
    return apiResponse(res, 400, null, { code: 'INVALID_SIZE', message: 'Size muss zwischen 10 und 100 Prozent liegen' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Pruefen ob VG existiert
  var vg = db.lvm.getVGByName(nodeId, vgName);
  if (!vg) {
    return apiResponse(res, 404, null, { code: 'VG_NOT_FOUND', message: 'Volume Group nicht gefunden' });
  }

  try {
    var collector = require('../../collector');

    // Thin Pool erstellen
    var cmd = 'lvcreate -l ' + sizePercent + '%FREE -T ' + shellEscape(vgName) + '/' + shellEscape(poolName);
    var result = await collector.runCommand(node, cmd, 120000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Unbekannter Fehler';
      if (errMsg.indexOf('already exists') > -1) {
        return apiResponse(res, 409, null, { code: 'POOL_EXISTS', message: 'Thin Pool existiert bereits' });
      }
      return apiResponse(res, 500, null, { code: 'POOL_CREATE_FAILED', message: errMsg });
    }

    // LVM Discovery aktualisieren
    await collector.runLvmDiscovery(node);

    apiResponse(res, 201, {
      vg_name: vgName,
      pool_name: poolName,
      size_percent: sizePercent,
      message: 'Thin Pool erfolgreich erstellt'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'LVM_ERROR', message: err.message });
  }
}));

// In Proxmox registrieren
router.post('/lvm/register', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var storageType = req.body.type; // 'lvm' oder 'lvmthin'
  var storageId = req.body.storage_id;
  var vgName = req.body.vg_name;
  var poolName = req.body.pool_name; // Nur fuer lvmthin
  var content = req.body.content || 'images,rootdir';

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validierung: Storage Type
  if (storageType !== 'lvm' && storageType !== 'lvmthin') {
    return apiResponse(res, 400, null, { code: 'INVALID_TYPE', message: 'Type muss "lvm" oder "lvmthin" sein' });
  }

  // Validierung: Storage ID
  if (!validateStorageId(storageId)) {
    return apiResponse(res, 400, null, {
      code: 'INVALID_STORAGE_ID',
      message: 'Storage ID muss mit Buchstabe beginnen und darf nur a-z, 0-9, _, - enthalten (max 32 Zeichen)'
    });
  }

  // Validierung: VG Name
  if (!validateVgName(vgName)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VG_NAME', message: 'Ungueltiger VG Name' });
  }

  // Validierung: Pool Name (nur fuer lvmthin)
  if (storageType === 'lvmthin') {
    if (!validateVgName(poolName)) {
      return apiResponse(res, 400, null, { code: 'INVALID_POOL_NAME', message: 'Pool Name erforderlich fuer lvmthin' });
    }
  }

  // Validierung: Content
  var validContents = ['images', 'rootdir', 'backup', 'iso', 'vztmpl', 'snippets'];
  var contentParts = content.split(',');
  for (var i = 0; i < contentParts.length; i++) {
    if (validContents.indexOf(contentParts[i].trim()) === -1) {
      return apiResponse(res, 400, null, { code: 'INVALID_CONTENT', message: 'Ungueltiger Content-Typ: ' + contentParts[i] });
    }
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Pruefen ob Proxmox vorhanden
  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var collector = require('../../collector');
    var cmd;
    if (storageType === 'lvm') {
      cmd = 'pvesm add lvm ' + shellEscape(storageId) + ' --vgname ' + shellEscape(vgName) + ' --content ' + content;
    } else {
      cmd = 'pvesm add lvmthin ' + shellEscape(storageId) + ' --vgname ' + shellEscape(vgName) + ' --thinpool ' + shellEscape(poolName) + ' --content ' + content;
    }

    var result = await collector.runCommand(node, cmd, 60000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Unbekannter Fehler';
      if (errMsg.indexOf('already exists') > -1) {
        return apiResponse(res, 409, null, { code: 'STORAGE_EXISTS', message: 'Storage ID existiert bereits' });
      }
      return apiResponse(res, 500, null, { code: 'REGISTER_FAILED', message: errMsg });
    }

    // DB aktualisieren
    if (storageType === 'lvm') {
      db.lvm.setVGRegistration(nodeId, vgName, storageId, 'lvm');
    } else {
      db.lvm.setLVRegistration(nodeId, vgName, poolName, storageId, 'lvmthin');
    }

    // LVM Discovery aktualisieren
    await collector.runLvmDiscovery(node);

    apiResponse(res, 201, {
      storage_id: storageId,
      type: storageType,
      vg_name: vgName,
      pool_name: poolName || null,
      message: 'Storage erfolgreich in Proxmox registriert'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'LVM_ERROR', message: err.message });
  }
}));

// =====================================================
// DELETE Endpoints
// =====================================================

// VG loeschen (GEFAEHRLICH!)
router.delete('/lvm/vg/:vgName', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var vgName = req.params.vgName;
  var confirmName = req.body.confirm_name;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validierung: VG Name
  if (!validateVgName(vgName)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VG_NAME', message: 'Ungueltiger VG Name' });
  }

  // Sicherheits-Bestaetigung
  if (confirmName !== vgName) {
    return apiResponse(res, 400, null, {
      code: 'CONFIRMATION_REQUIRED',
      message: 'Bestaetigung erforderlich: confirm_name muss dem VG Namen entsprechen'
    });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Pruefen ob VG in Proxmox registriert ist
  var vg = db.lvm.getVGByName(nodeId, vgName);
  if (vg && vg.registered_storage_id) {
    return apiResponse(res, 400, null, {
      code: 'STORAGE_REGISTERED',
      message: 'VG ist in Proxmox registriert. Erst Storage entfernen: ' + vg.registered_storage_id
    });
  }

  try {
    var collector = require('../../collector');

    // 1. Alle LVs in der VG loeschen
    var lvRemoveCmd = 'lvremove -y ' + shellEscape(vgName);
    await collector.runCommand(node, lvRemoveCmd, 120000);

    // 2. VG loeschen
    var vgRemoveCmd = 'vgremove -y ' + shellEscape(vgName);
    var result = await collector.runCommand(node, vgRemoveCmd, 60000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'VG_REMOVE_FAILED',
        message: 'VG loeschen fehlgeschlagen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    // LVM Discovery aktualisieren
    await collector.runLvmDiscovery(node);

    apiResponse(res, 200, {
      vg_name: vgName,
      message: 'Volume Group erfolgreich geloescht'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'LVM_ERROR', message: err.message });
  }
}));

// Thin Pool loeschen (GEFAEHRLICH!)
router.delete('/lvm/thinpool/:vgName/:poolName', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var vgName = req.params.vgName;
  var poolName = req.params.poolName;
  var confirmName = req.body.confirm_name;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validierung
  if (!validateVgName(vgName) || !validateVgName(poolName)) {
    return apiResponse(res, 400, null, { code: 'INVALID_NAME', message: 'Ungueltiger VG oder Pool Name' });
  }

  // Sicherheits-Bestaetigung
  if (confirmName !== poolName) {
    return apiResponse(res, 400, null, {
      code: 'CONFIRMATION_REQUIRED',
      message: 'Bestaetigung erforderlich: confirm_name muss dem Pool Namen entsprechen'
    });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var collector = require('../../collector');
    var cmd = 'lvremove -y ' + shellEscape(vgName) + '/' + shellEscape(poolName);
    var result = await collector.runCommand(node, cmd, 120000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'POOL_REMOVE_FAILED',
        message: 'Thin Pool loeschen fehlgeschlagen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    // LVM Discovery aktualisieren
    await collector.runLvmDiscovery(node);

    apiResponse(res, 200, {
      vg_name: vgName,
      pool_name: poolName,
      message: 'Thin Pool erfolgreich geloescht'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'LVM_ERROR', message: err.message });
  }
}));

// Proxmox Storage entfernen
router.delete('/lvm/unregister/:storageId', asyncHandler(async function(req, res) {
  var nodeId = parseInt(req.params.nodeId, 10);
  var storageId = req.params.storageId;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  if (!validateStorageId(storageId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_STORAGE_ID', message: 'Ungueltige Storage ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var collector = require('../../collector');
    var cmd = 'pvesm remove ' + shellEscape(storageId);
    var result = await collector.runCommand(node, cmd, 60000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'UNREGISTER_FAILED',
        message: 'Storage entfernen fehlgeschlagen: ' + (result.stderr || 'Unbekannter Fehler')
      });
    }

    // LVM Discovery aktualisieren
    await collector.runLvmDiscovery(node);

    apiResponse(res, 200, {
      storage_id: storageId,
      message: 'Storage erfolgreich aus Proxmox entfernt'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'LVM_ERROR', message: err.message });
  }
}));

module.exports = router;

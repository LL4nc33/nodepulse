/**
 * Proxmox API Routes
 * Mounted at /api/nodes/:nodeId/proxmox
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../db');
const collector = require('../../collector');
const { asyncHandler, apiResponse } = require('./helpers');
const { validateResizeParams } = require('../../lib/validators');
const { parseVMParams, parseCTParams, parseIntParam } = require('../../lib/params');

// Validation helper for VM/CT names
function isValidVmName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 63) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

// Escape shell argument (single quotes)
function shellEscape(str) {
  if (!str) return "''";
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

// =====================================================
// Basic Proxmox Data
// =====================================================

// Get all Proxmox data for a node
router.get('/', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var proxmoxData = db.proxmox.getAllForNode(nodeId);
  var summary = db.proxmox.getSummary(nodeId);
  apiResponse(res, 200, {
    vms: proxmoxData.vms,
    cts: proxmoxData.cts,
    storage: proxmoxData.storage,
    snapshots: proxmoxData.snapshots,
    summary: summary,
  });
}));

// Refresh Proxmox data for a node (collect from remote)
router.post('/', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var data = await collector.runProxmox(node);
    apiResponse(res, 200, data);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Get VMs for a node
router.get('/vms', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var vms = db.proxmox.getVMs(nodeId);
  apiResponse(res, 200, vms);
}));

// Get CTs for a node
router.get('/cts', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var cts = db.proxmox.getCTs(nodeId);
  apiResponse(res, 200, cts);
}));

// Get storage for a node
router.get('/storage', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var storage = db.proxmox.getStorage(nodeId);
  apiResponse(res, 200, storage);
}));

// Get snapshots for a node
router.get('/snapshots', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var snapshots = db.proxmox.getSnapshots(nodeId);
  apiResponse(res, 200, snapshots);
}));

// =====================================================
// VM/CT Actions (start/stop/shutdown)
// =====================================================

// VM action (start/stop/shutdown)
router.post('/vms/:vmid/:action', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var action = req.params.action;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate vmid as string first (defense in depth)
  if (!/^\d+$/.test(req.params.vmid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'VMID muss numerisch sein' });
  }
  var vmid = parseInt(req.params.vmid, 10);

  // Validate vmid range (100-999999)
  if (isNaN(vmid) || vmid < 100 || vmid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige VMID (muss 100-999999 sein)' });
  }

  // Validate action
  var validActions = ['start', 'stop', 'shutdown', 'reboot', 'reset', 'suspend', 'resume'];
  if (validActions.indexOf(action) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_ACTION', message: 'Ungueltige Aktion. Erlaubt: ' + validActions.join(', ') });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'qm ' + action + ' ' + vmid;
    var result = await collector.runProxmoxCommand(node, command, 180000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Aktion fehlgeschlagen' });
    }

    // Refresh Proxmox data after action
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, { action: action, vmid: vmid, type: 'vm', success: true });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// CT action (start/stop/shutdown)
router.post('/cts/:ctid/:action', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var action = req.params.action;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate ctid as string first (defense in depth)
  if (!/^\d+$/.test(req.params.ctid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'CTID muss numerisch sein' });
  }
  var ctid = parseInt(req.params.ctid, 10);

  // Validate ctid range (100-999999)
  if (isNaN(ctid) || ctid < 100 || ctid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'Ungueltige CTID (muss 100-999999 sein)' });
  }

  // Validate action
  var validActions = ['start', 'stop', 'shutdown', 'reboot', 'suspend', 'resume'];
  if (validActions.indexOf(action) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_ACTION', message: 'Ungueltige Aktion. Erlaubt: ' + validActions.join(', ') });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'pct ' + action + ' ' + ctid;
    var result = await collector.runProxmoxCommand(node, command, 180000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Aktion fehlgeschlagen' });
    }

    // Refresh Proxmox data after action
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, { action: action, ctid: ctid, type: 'ct', success: true });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// =====================================================
// Proxmox Config & Resize (CPU/RAM/Disk)
// =====================================================

// Update VM config (CPU, RAM)
router.patch('/vms/:vmid/config', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var cores = req.body.cores;
  var memory = req.body.memory;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate vmid
  if (!/^\d+$/.test(req.params.vmid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'VMID muss numerisch sein' });
  }
  var vmid = parseInt(req.params.vmid, 10);
  if (vmid < 100 || vmid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige VMID (muss 100-999999 sein)' });
  }

  // Validate at least one config parameter is provided
  if (cores === undefined && memory === undefined) {
    return apiResponse(res, 400, null, { code: 'MISSING_PARAMS', message: 'Mindestens cores oder memory muss angegeben werden' });
  }

  // Validate cores (1-128)
  if (cores !== undefined) {
    cores = parseInt(cores, 10);
    if (isNaN(cores) || cores < 1 || cores > 128) {
      return apiResponse(res, 400, null, { code: 'INVALID_CORES', message: 'cores muss zwischen 1 und 128 liegen' });
    }
  }

  // Validate memory (512-1048576 MB)
  if (memory !== undefined) {
    memory = parseInt(memory, 10);
    if (isNaN(memory) || memory < 512 || memory > 1048576) {
      return apiResponse(res, 400, null, { code: 'INVALID_MEMORY', message: 'memory muss zwischen 512 und 1048576 MB liegen' });
    }
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    // Build qm set command
    var command = 'qm set ' + vmid;
    if (cores !== undefined) {
      command += ' -cores ' + cores;
    }
    if (memory !== undefined) {
      command += ' -memory ' + memory;
    }

    var result = await collector.runProxmoxCommand(node, command, 60000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Config-Aenderung fehlgeschlagen' });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      vmid: vmid,
      type: 'vm',
      cores: cores,
      memory: memory,
      success: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Update CT config (CPU, RAM)
router.patch('/cts/:ctid/config', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var cores = req.body.cores;
  var memory = req.body.memory;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate ctid
  if (!/^\d+$/.test(req.params.ctid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'CTID muss numerisch sein' });
  }
  var ctid = parseInt(req.params.ctid, 10);
  if (ctid < 100 || ctid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'Ungueltige CTID (muss 100-999999 sein)' });
  }

  // Validate at least one config parameter is provided
  if (cores === undefined && memory === undefined) {
    return apiResponse(res, 400, null, { code: 'MISSING_PARAMS', message: 'Mindestens cores oder memory muss angegeben werden' });
  }

  // Validate cores (1-128)
  if (cores !== undefined) {
    cores = parseInt(cores, 10);
    if (isNaN(cores) || cores < 1 || cores > 128) {
      return apiResponse(res, 400, null, { code: 'INVALID_CORES', message: 'cores muss zwischen 1 und 128 liegen' });
    }
  }

  // Validate memory (64-1048576 MB) - CTs can have less memory
  if (memory !== undefined) {
    memory = parseInt(memory, 10);
    if (isNaN(memory) || memory < 64 || memory > 1048576) {
      return apiResponse(res, 400, null, { code: 'INVALID_MEMORY', message: 'memory muss zwischen 64 und 1048576 MB liegen' });
    }
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    // Build pct set command
    var command = 'pct set ' + ctid;
    if (cores !== undefined) {
      command += ' -cores ' + cores;
    }
    if (memory !== undefined) {
      command += ' -memory ' + memory;
    }

    var result = await collector.runProxmoxCommand(node, command, 60000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Config-Aenderung fehlgeschlagen' });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      ctid: ctid,
      type: 'ct',
      cores: cores,
      memory: memory,
      success: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Resize VM disk (only enlarging supported!)
router.post('/vms/:vmid/resize', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var disk = req.body.disk;
  var size = req.body.size;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate vmid
  if (!/^\d+$/.test(req.params.vmid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'VMID muss numerisch sein' });
  }
  var vmid = parseInt(req.params.vmid, 10);
  if (vmid < 100 || vmid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige VMID (muss 100-999999 sein)' });
  }

  // Validate disk parameter (scsi0, virtio0, ide0, etc.)
  if (!disk || !/^(scsi|virtio|ide|sata)\d+$/.test(disk)) {
    return apiResponse(res, 400, null, { code: 'INVALID_DISK', message: 'disk muss ein gueltiger Disk-Name sein (z.B. scsi0, virtio0)' });
  }

  // Validate size parameter (only +XG or +XM format allowed for safety)
  if (!size || !/^\+\d+[GM]$/i.test(size)) {
    return apiResponse(res, 400, null, { code: 'INVALID_SIZE', message: 'size muss im Format +XG oder +XM sein (nur Vergroesserung erlaubt!)' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'qm resize ' + vmid + ' ' + disk + ' ' + size;
    var result = await collector.runProxmoxCommand(node, command, 120000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Disk-Resize fehlgeschlagen' });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      vmid: vmid,
      type: 'vm',
      disk: disk,
      size: size,
      success: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Resize CT disk (rootfs only, only enlarging supported!)
router.post('/cts/:ctid/resize', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var disk = req.body.disk || 'rootfs';
  var size = req.body.size;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate ctid
  if (!/^\d+$/.test(req.params.ctid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'CTID muss numerisch sein' });
  }
  var ctid = parseInt(req.params.ctid, 10);
  if (ctid < 100 || ctid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'Ungueltige CTID (muss 100-999999 sein)' });
  }

  // Validate disk parameter (rootfs or mpX)
  if (!/^(rootfs|mp\d+)$/.test(disk)) {
    return apiResponse(res, 400, null, { code: 'INVALID_DISK', message: 'disk muss rootfs oder mpX sein' });
  }

  // Validate size parameter (only +XG or +XM format allowed for safety)
  if (!size || !/^\+\d+[GM]$/i.test(size)) {
    return apiResponse(res, 400, null, { code: 'INVALID_SIZE', message: 'size muss im Format +XG oder +XM sein (nur Vergroesserung erlaubt!)' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'pct resize ' + ctid + ' ' + disk + ' ' + size;
    var result = await collector.runProxmoxCommand(node, command, 120000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Disk-Resize fehlgeschlagen' });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      ctid: ctid,
      type: 'ct',
      disk: disk,
      size: size,
      success: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// =====================================================
// Proxmox Clone & Template
// =====================================================

// Clone VM
router.post('/vms/:vmid/clone', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var newid = req.body.newid;
  var name = req.body.name;
  var full = req.body.full !== false; // Default to full clone

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate source vmid
  if (!/^\d+$/.test(req.params.vmid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'VMID muss numerisch sein' });
  }
  var vmid = parseInt(req.params.vmid, 10);
  if (vmid < 100 || vmid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige VMID (muss 100-999999 sein)' });
  }

  // Validate newid (required)
  if (!newid) {
    return apiResponse(res, 400, null, { code: 'MISSING_NEWID', message: 'newid (neue VMID) ist erforderlich' });
  }
  newid = parseInt(newid, 10);
  if (isNaN(newid) || newid < 100 || newid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_NEWID', message: 'newid muss zwischen 100 und 999999 liegen' });
  }

  // Validate name (optional, but if provided must be valid)
  if (name && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    return apiResponse(res, 400, null, { code: 'INVALID_NAME', message: 'Name darf nur Buchstaben, Zahlen, ., - und _ enthalten' });
  }
  if (name && name.length > 63) {
    return apiResponse(res, 400, null, { code: 'INVALID_NAME', message: 'Name darf maximal 63 Zeichen lang sein' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'qm clone ' + vmid + ' ' + newid;
    if (name) {
      command += ' --name ' + name;
    }
    if (full) {
      command += ' --full';
    }

    var result = await collector.runProxmoxCommand(node, command, 600000); // 10 min timeout for clone

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Clone fehlgeschlagen' });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      source_vmid: vmid,
      new_vmid: newid,
      name: name || null,
      full_clone: full,
      type: 'vm',
      success: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Clone CT
router.post('/cts/:ctid/clone', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var newid = req.body.newid;
  var hostname = req.body.hostname;
  var full = req.body.full !== false; // Default to full clone

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate source ctid
  if (!/^\d+$/.test(req.params.ctid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'CTID muss numerisch sein' });
  }
  var ctid = parseInt(req.params.ctid, 10);
  if (ctid < 100 || ctid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'Ungueltige CTID (muss 100-999999 sein)' });
  }

  // Validate newid (required)
  if (!newid) {
    return apiResponse(res, 400, null, { code: 'MISSING_NEWID', message: 'newid (neue CTID) ist erforderlich' });
  }
  newid = parseInt(newid, 10);
  if (isNaN(newid) || newid < 100 || newid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_NEWID', message: 'newid muss zwischen 100 und 999999 liegen' });
  }

  // Validate hostname (optional, but if provided must be valid)
  if (hostname && !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(hostname)) {
    return apiResponse(res, 400, null, { code: 'INVALID_HOSTNAME', message: 'Hostname darf nur Buchstaben, Zahlen und - enthalten' });
  }
  if (hostname && hostname.length > 63) {
    return apiResponse(res, 400, null, { code: 'INVALID_HOSTNAME', message: 'Hostname darf maximal 63 Zeichen lang sein' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'pct clone ' + ctid + ' ' + newid;
    if (hostname) {
      command += ' --hostname ' + hostname;
    }
    if (full) {
      command += ' --full';
    }

    var result = await collector.runProxmoxCommand(node, command, 600000); // 10 min timeout for clone

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Clone fehlgeschlagen' });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      source_ctid: ctid,
      new_ctid: newid,
      hostname: hostname || null,
      full_clone: full,
      type: 'ct',
      success: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Convert VM to Template
router.post('/vms/:vmid/template', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate vmid
  if (!/^\d+$/.test(req.params.vmid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'VMID muss numerisch sein' });
  }
  var vmid = parseInt(req.params.vmid, 10);
  if (vmid < 100 || vmid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige VMID (muss 100-999999 sein)' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'qm template ' + vmid;
    var result = await collector.runProxmoxCommand(node, command, 120000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Template-Konvertierung fehlgeschlagen' });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      vmid: vmid,
      type: 'vm',
      template: true,
      success: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Convert CT to Template
router.post('/cts/:ctid/template', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate ctid
  if (!/^\d+$/.test(req.params.ctid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'CTID muss numerisch sein' });
  }
  var ctid = parseInt(req.params.ctid, 10);
  if (ctid < 100 || ctid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'Ungueltige CTID (muss 100-999999 sein)' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'pct template ' + ctid;
    var result = await collector.runProxmoxCommand(node, command, 120000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Template-Konvertierung fehlgeschlagen' });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      ctid: ctid,
      type: 'ct',
      template: true,
      success: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// =====================================================
// Snapshots
// =====================================================

// Create snapshot
router.post('/snapshots', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var vmType = req.body.vm_type;
  var snapName = req.body.snap_name;
  var description = req.body.description || '';

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate vm_type
  if (vmType !== 'vm' && vmType !== 'ct') {
    return apiResponse(res, 400, null, { code: 'INVALID_VM_TYPE', message: 'vm_type muss "vm" oder "ct" sein' });
  }

  // Validate vmid as string first (defense in depth)
  var vmidStr = String(req.body.vmid || '');
  if (!/^\d+$/.test(vmidStr)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'VMID/CTID muss numerisch sein' });
  }
  var vmid = parseInt(vmidStr, 10);

  // Validate vmid range (100-999999)
  if (isNaN(vmid) || vmid < 100 || vmid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige VMID/CTID (muss 100-999999 sein)' });
  }

  // Validate snap_name (alphanumeric, dash, underscore only, must start with letter)
  if (!snapName || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(snapName)) {
    return apiResponse(res, 400, null, { code: 'INVALID_SNAP_NAME', message: 'Snapshot-Name muss mit Buchstabe beginnen und darf nur Buchstaben, Zahlen, - und _ enthalten' });
  }

  if (snapName.length > 40) {
    return apiResponse(res, 400, null, { code: 'INVALID_SNAP_NAME', message: 'Snapshot-Name darf maximal 40 Zeichen lang sein' });
  }

  // Validate description (strict: only alphanumeric, space, dash, underscore, period, comma)
  if (description && description.length > 255) {
    return apiResponse(res, 400, null, { code: 'INVALID_DESCRIPTION', message: 'Beschreibung darf maximal 255 Zeichen lang sein' });
  }
  if (description && !/^[a-zA-Z0-9\s\-_.,\u00C0-\u017F]*$/.test(description)) {
    return apiResponse(res, 400, null, { code: 'INVALID_DESCRIPTION', message: 'Beschreibung darf nur Buchstaben, Zahlen, Leerzeichen, - _ . , enthalten' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command;
    if (vmType === 'vm') {
      command = 'qm snapshot ' + vmid + ' ' + snapName;
      if (description) {
        // Escape description for shell
        var safeDesc = description.replace(/'/g, "'\\''");
        command += " --description '" + safeDesc + "'";
      }
    } else {
      command = 'pct snapshot ' + vmid + ' ' + snapName;
      if (description) {
        var safeDesc = description.replace(/'/g, "'\\''");
        command += " --description '" + safeDesc + "'";
      }
    }

    var result = await collector.runProxmoxCommand(node, command, 300000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Snapshot erstellen fehlgeschlagen' });
    }

    // Refresh Proxmox data after snapshot
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 201, { vmid: vmid, vm_type: vmType, snap_name: snapName, success: true });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Delete snapshot
router.delete('/snapshots/:vmType/:vmid/:snapName', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);
  var vmType = req.params.vmType;
  var snapName = req.params.snapName;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate vm_type
  if (vmType !== 'vm' && vmType !== 'ct') {
    return apiResponse(res, 400, null, { code: 'INVALID_VM_TYPE', message: 'vmType muss "vm" oder "ct" sein' });
  }

  // Validate vmid as string first (defense in depth)
  if (!/^\d+$/.test(req.params.vmid)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'VMID/CTID muss numerisch sein' });
  }
  var vmid = parseInt(req.params.vmid, 10);

  // Validate vmid range (100-999999)
  if (isNaN(vmid) || vmid < 100 || vmid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'Ungueltige VMID/CTID (muss 100-999999 sein)' });
  }

  // Validate snap_name (alphanumeric, dash, underscore only, must start with letter)
  if (!snapName || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(snapName)) {
    return apiResponse(res, 400, null, { code: 'INVALID_SNAP_NAME', message: 'Ungueltiger Snapshot-Name' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command;
    if (vmType === 'vm') {
      command = 'qm delsnapshot ' + vmid + ' ' + snapName;
    } else {
      command = 'pct delsnapshot ' + vmid + ' ' + snapName;
    }

    var result = await collector.runProxmoxCommand(node, command, 300000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Snapshot loeschen fehlgeschlagen' });
    }

    // Refresh Proxmox data after delete
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, { vmid: vmid, vm_type: vmType, snap_name: snapName, deleted: true });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// =====================================================
// Proxmox VM/CT Creation Helper Endpoints
// =====================================================

// Get all Proxmox resources for VM/CT creation (ISOs, Templates, Storage, Bridges, NextID)
router.get('/resources', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Verify it's a Proxmox host
  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var data = await collector.runProxmoxResources(node);
    apiResponse(res, 200, data);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Get available ISOs
router.get('/isos', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var data = await collector.runProxmoxResources(node);
    apiResponse(res, 200, { isos: data.isos || [] });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Get available CT templates
router.get('/templates', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var data = await collector.runProxmoxResources(node);
    apiResponse(res, 200, { templates: data.templates || [] });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Get available storage with content types
router.get('/storage/available', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var data = await collector.runProxmoxResources(node);
    apiResponse(res, 200, { storage: data.storage || [] });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Get available network bridges
router.get('/bridges', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var data = await collector.runProxmoxResources(node);
    apiResponse(res, 200, { bridges: data.bridges || [] });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Get next available VMID
router.get('/nextid', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  try {
    var data = await collector.runProxmoxResources(node);
    apiResponse(res, 200, { nextid: data.nextid || 100 });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// =====================================================
// Proxmox VM/CT Creation Endpoints
// =====================================================

// Create new VM
router.post('/vms/create', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  // Extract and validate parameters (zentrale Parser)
  var vmid = parseIntParam(req.body.vmid, 0);
  var name = req.body.name;
  var iso = req.body.iso;
  var storage = req.body.storage;
  var vmParams = parseVMParams(req.body);
  var cores = vmParams.cores;
  var sockets = vmParams.sockets;
  var memory = vmParams.memory;
  var diskSize = vmParams.diskSize;
  var ostype = vmParams.ostype;
  var bios = vmParams.bios;
  var netBridge = vmParams.netBridge;
  var netModel = vmParams.netModel;
  var startOnBoot = vmParams.startOnBoot;
  var description = vmParams.description;

  // === VALIDATION ===

  // VMID: 100-999999
  if (isNaN(vmid) || vmid < 100 || vmid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_VMID', message: 'VMID muss zwischen 100 und 999999 liegen' });
  }

  // Name: alphanumeric, -, _, ., max 63 chars, must start with alphanumeric
  if (!isValidVmName(name)) {
    return apiResponse(res, 400, null, { code: 'INVALID_NAME', message: 'Name muss mit Buchstabe/Zahl beginnen und darf nur a-z, 0-9, -, _, . enthalten (max 63 Zeichen)' });
  }

  // ISO: required, must be volid format (storage:iso/filename.iso)
  // Security: Only allow alphanumeric, dots, hyphens, underscores in filename (no path traversal)
  if (!iso || typeof iso !== 'string' || !/^[a-zA-Z0-9_-]+:iso\/[a-zA-Z0-9._-]+\.iso$/i.test(iso)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ISO', message: 'ISO muss im Format storage:iso/filename.iso sein' });
  }

  // Storage: required
  if (!storage || typeof storage !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(storage)) {
    return apiResponse(res, 400, null, { code: 'INVALID_STORAGE', message: 'Ungueltiger Storage-Name' });
  }

  // Cores: 1-128
  if (isNaN(cores) || cores < 1 || cores > 128) {
    return apiResponse(res, 400, null, { code: 'INVALID_CORES', message: 'Cores muss zwischen 1 und 128 liegen' });
  }

  // Sockets: 1-8
  if (isNaN(sockets) || sockets < 1 || sockets > 8) {
    return apiResponse(res, 400, null, { code: 'INVALID_SOCKETS', message: 'Sockets muss zwischen 1 und 8 liegen' });
  }

  // Memory: 512-1048576 MB
  if (isNaN(memory) || memory < 512 || memory > 1048576) {
    return apiResponse(res, 400, null, { code: 'INVALID_MEMORY', message: 'Memory muss zwischen 512 MB und 1 TB liegen' });
  }

  // Disk size: 1-10000 GB
  if (isNaN(diskSize) || diskSize < 1 || diskSize > 10000) {
    return apiResponse(res, 400, null, { code: 'INVALID_DISK_SIZE', message: 'Disk-Groesse muss zwischen 1 und 10000 GB liegen' });
  }

  // OS Type
  var validOsTypes = ['l26', 'l24', 'win11', 'win10', 'win8', 'win7', 'wvista', 'wxp', 'w2k8', 'w2k3', 'w2k', 'solaris', 'other'];
  if (!validOsTypes.includes(ostype)) {
    return apiResponse(res, 400, null, { code: 'INVALID_OSTYPE', message: 'Ungueltiger OS-Typ. Erlaubt: ' + validOsTypes.join(', ') });
  }

  // BIOS
  if (bios !== 'seabios' && bios !== 'ovmf') {
    return apiResponse(res, 400, null, { code: 'INVALID_BIOS', message: 'BIOS muss seabios oder ovmf sein' });
  }

  // Network bridge
  if (!/^[a-zA-Z0-9_-]+$/.test(netBridge)) {
    return apiResponse(res, 400, null, { code: 'INVALID_NET_BRIDGE', message: 'Ungueltiger Network-Bridge Name' });
  }

  // Network model
  var validNetModels = ['virtio', 'e1000', 'rtl8139', 'vmxnet3'];
  if (!validNetModels.includes(netModel)) {
    return apiResponse(res, 400, null, { code: 'INVALID_NET_MODEL', message: 'Ungueltiges Netzwerk-Modell. Erlaubt: ' + validNetModels.join(', ') });
  }

  // Description (max 255 chars, safe characters only)
  if (description && description.length > 255) {
    return apiResponse(res, 400, null, { code: 'INVALID_DESCRIPTION', message: 'Beschreibung darf maximal 255 Zeichen lang sein' });
  }
  if (description && !/^[a-zA-Z0-9\s\-_.,\u00C0-\u017F]*$/.test(description)) {
    return apiResponse(res, 400, null, { code: 'INVALID_DESCRIPTION', message: 'Beschreibung enthaelt ungueltige Zeichen' });
  }

  try {
    // Build the qm create command
    var command = 'qm create ' + vmid;
    command += ' --name ' + shellEscape(name);
    command += ' --cores ' + cores;
    command += ' --sockets ' + sockets;
    command += ' --memory ' + memory;
    command += ' --ostype ' + ostype;
    command += ' --bios ' + bios;
    command += ' --scsihw virtio-scsi-single';
    command += ' --scsi0 ' + storage + ':' + diskSize + ',iothread=1';
    command += ' --ide2 ' + iso + ',media=cdrom';
    command += ' --boot order=scsi0\\;ide2';
    command += ' --net0 ' + netModel + ',bridge=' + netBridge;
    command += ' --onboot ' + (startOnBoot ? '1' : '0');

    if (description) {
      command += ' --description ' + shellEscape(description);
    }

    var result = await collector.runProxmoxCommand(node, command, 120000);

    if (result.exitCode !== 0) {
      // Map common Proxmox errors to user-friendly messages
      var errMsg = result.stderr || 'VM-Erstellung fehlgeschlagen';
      if (errMsg.indexOf('already exists') > -1) {
        return apiResponse(res, 409, null, { code: 'VMID_EXISTS', message: 'VM mit dieser VMID existiert bereits' });
      }
      if (errMsg.indexOf('storage') > -1 && errMsg.indexOf('does not exist') > -1) {
        return apiResponse(res, 400, null, { code: 'STORAGE_NOT_FOUND', message: 'Storage existiert nicht' });
      }
      if (errMsg.indexOf('not enough space') > -1) {
        return apiResponse(res, 400, null, { code: 'NO_SPACE', message: 'Nicht genuegend Speicherplatz auf Storage' });
      }
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: errMsg });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 201, {
      vmid: vmid,
      name: name,
      type: 'vm',
      created: true,
      message: 'VM erfolgreich erstellt'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

// Create new CT (Container)
router.post('/cts/create', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.nodeId, 10);

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  // Extract and validate parameters (zentrale Parser)
  var ctid = parseIntParam(req.body.ctid, 0);
  var hostname = req.body.hostname;
  var template = req.body.template;
  var storage = req.body.storage;
  var password = req.body.password;
  var sshPublicKeys = req.body.ssh_public_keys || '';
  var ctParams = parseCTParams(req.body);
  var cores = ctParams.cores;
  var memory = ctParams.memory;
  var diskSize = ctParams.diskSize;
  var swap = ctParams.swap;
  var netBridge = ctParams.netBridge;
  var ipConfig = ctParams.ipConfig;
  var gateway = ctParams.gateway;
  var unprivileged = ctParams.unprivileged;
  var nesting = ctParams.nesting;
  var startOnBoot = ctParams.startOnBoot;
  var description = ctParams.description;

  // === VALIDATION ===

  // CTID: 100-999999
  if (isNaN(ctid) || ctid < 100 || ctid > 999999) {
    return apiResponse(res, 400, null, { code: 'INVALID_CTID', message: 'CTID muss zwischen 100 und 999999 liegen' });
  }

  // Hostname: alphanumeric, -, max 63 chars, must start with alphanumeric
  if (!isValidVmName(hostname)) {
    return apiResponse(res, 400, null, { code: 'INVALID_HOSTNAME', message: 'Hostname muss mit Buchstabe/Zahl beginnen und darf nur a-z, 0-9, -, _ enthalten (max 63 Zeichen)' });
  }

  // Template: required, must be volid format (storage:vztmpl/filename)
  // Security: Only allow alphanumeric, dots, hyphens, underscores in filename (no path traversal)
  if (!template || typeof template !== 'string' || !/^[a-zA-Z0-9_-]+:vztmpl\/[a-zA-Z0-9._-]+$/.test(template)) {
    return apiResponse(res, 400, null, { code: 'INVALID_TEMPLATE', message: 'Template muss im Format storage:vztmpl/filename sein' });
  }

  // Storage: required
  if (!storage || typeof storage !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(storage)) {
    return apiResponse(res, 400, null, { code: 'INVALID_STORAGE', message: 'Ungueltiger Storage-Name' });
  }

  // Password or SSH key required
  if (!password && !sshPublicKeys) {
    return apiResponse(res, 400, null, { code: 'MISSING_AUTH', message: 'Passwort oder SSH Public Key erforderlich' });
  }

  // Password validation (if provided)
  if (password) {
    if (password.length < 5) {
      return apiResponse(res, 400, null, { code: 'INVALID_PASSWORD', message: 'Passwort muss mindestens 5 Zeichen lang sein' });
    }
    if (password.length > 64) {
      return apiResponse(res, 400, null, { code: 'INVALID_PASSWORD', message: 'Passwort darf maximal 64 Zeichen lang sein' });
    }
  }

  // Cores: 1-128
  if (isNaN(cores) || cores < 1 || cores > 128) {
    return apiResponse(res, 400, null, { code: 'INVALID_CORES', message: 'Cores muss zwischen 1 und 128 liegen' });
  }

  // Memory: 64-1048576 MB (CTs can have less memory than VMs)
  if (isNaN(memory) || memory < 64 || memory > 1048576) {
    return apiResponse(res, 400, null, { code: 'INVALID_MEMORY', message: 'Memory muss zwischen 64 MB und 1 TB liegen' });
  }

  // Disk size: 1-10000 GB
  if (isNaN(diskSize) || diskSize < 1 || diskSize > 10000) {
    return apiResponse(res, 400, null, { code: 'INVALID_DISK_SIZE', message: 'Disk-Groesse muss zwischen 1 und 10000 GB liegen' });
  }

  // Swap: 0-131072 MB
  if (isNaN(swap) || swap < 0 || swap > 131072) {
    return apiResponse(res, 400, null, { code: 'INVALID_SWAP', message: 'Swap muss zwischen 0 und 128 GB liegen' });
  }

  // Network bridge
  if (!/^[a-zA-Z0-9_-]+$/.test(netBridge)) {
    return apiResponse(res, 400, null, { code: 'INVALID_NET_BRIDGE', message: 'Ungueltiger Network-Bridge Name' });
  }

  // IP config: dhcp or valid CIDR
  var ipPart = 'dhcp';
  if (ipConfig !== 'dhcp') {
    // Validate CIDR format
    if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(ipConfig)) {
      return apiResponse(res, 400, null, { code: 'INVALID_IP_CONFIG', message: 'IP muss dhcp oder im CIDR-Format sein (z.B. 192.168.1.100/24)' });
    }
    ipPart = 'ip=' + ipConfig;

    // Gateway required for static IP
    if (gateway) {
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(gateway)) {
        return apiResponse(res, 400, null, { code: 'INVALID_GATEWAY', message: 'Ungueltige Gateway-IP' });
      }
      ipPart += ',gw=' + gateway;
    }
  }

  // Description (max 255 chars, safe characters only)
  if (description && description.length > 255) {
    return apiResponse(res, 400, null, { code: 'INVALID_DESCRIPTION', message: 'Beschreibung darf maximal 255 Zeichen lang sein' });
  }
  if (description && !/^[a-zA-Z0-9\s\-_.,\u00C0-\u017F]*$/.test(description)) {
    return apiResponse(res, 400, null, { code: 'INVALID_DESCRIPTION', message: 'Beschreibung enthaelt ungueltige Zeichen' });
  }

  try {
    // Build the pct create command
    var command = 'pct create ' + ctid + ' ' + template;
    command += ' --hostname ' + shellEscape(hostname);
    command += ' --rootfs ' + storage + ':' + diskSize;
    command += ' --cores ' + cores;
    command += ' --memory ' + memory;
    command += ' --swap ' + swap;

    if (password) {
      command += ' --password ' + shellEscape(password);
    }

    if (sshPublicKeys) {
      command += ' --ssh-public-keys ' + shellEscape(sshPublicKeys);
    }

    command += ' --net0 name=eth0,bridge=' + netBridge + ',' + ipPart;
    command += ' --unprivileged ' + (unprivileged ? '1' : '0');

    if (nesting) {
      command += ' --features nesting=1';
    }

    command += ' --onboot ' + (startOnBoot ? '1' : '0');

    if (description) {
      command += ' --description ' + shellEscape(description);
    }

    var result = await collector.runProxmoxCommand(node, command, 180000);

    if (result.exitCode !== 0) {
      // Map common Proxmox errors to user-friendly messages
      var errMsg = result.stderr || 'CT-Erstellung fehlgeschlagen';
      if (errMsg.indexOf('already exists') > -1) {
        return apiResponse(res, 409, null, { code: 'CTID_EXISTS', message: 'CT mit dieser CTID existiert bereits' });
      }
      if (errMsg.indexOf('storage') > -1 && errMsg.indexOf('does not exist') > -1) {
        return apiResponse(res, 400, null, { code: 'STORAGE_NOT_FOUND', message: 'Storage existiert nicht' });
      }
      if (errMsg.indexOf('not enough space') > -1) {
        return apiResponse(res, 400, null, { code: 'NO_SPACE', message: 'Nicht genuegend Speicherplatz auf Storage' });
      }
      if (errMsg.indexOf('template') > -1 && errMsg.indexOf('not found') > -1) {
        return apiResponse(res, 400, null, { code: 'TEMPLATE_NOT_FOUND', message: 'Template nicht gefunden' });
      }
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: errMsg });
    }

    // Refresh Proxmox data
    try {
      await collector.runProxmox(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 201, {
      ctid: ctid,
      hostname: hostname,
      type: 'ct',
      created: true,
      message: 'CT erfolgreich erstellt'
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PROXMOX_ERROR', message: err.message });
  }
}));

module.exports = router;

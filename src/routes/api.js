const express = require('express');
const router = express.Router();
const db = require('../db');
const ssh = require('../ssh');
const collector = require('../collector');

// =====================================================
// Helper: Wrap async route handlers
// =====================================================
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// =====================================================
// Helper: Standard API response
// =====================================================
const apiResponse = (res, statusCode, data, error = null) => {
  if (error) {
    return res.status(statusCode).json({
      success: false,
      error: typeof error === 'string' ? { code: 'ERROR', message: error } : error,
    });
  }
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

// =====================================================
// Validation helpers
// =====================================================
const validateNodeInput = (data) => {
  const errors = [];

  if (!data.name || !data.name.trim()) {
    errors.push('name ist erforderlich');
  } else if (data.name.length > 255) {
    errors.push('name darf maximal 255 Zeichen lang sein');
  }

  if (!data.host || !data.host.trim()) {
    errors.push('host ist erforderlich');
  } else if (data.host.length > 255) {
    errors.push('host darf maximal 255 Zeichen lang sein');
  }

  if (!data.ssh_user || !data.ssh_user.trim()) {
    errors.push('ssh_user ist erforderlich');
  } else if (data.ssh_user.length > 64) {
    errors.push('ssh_user darf maximal 64 Zeichen lang sein');
  }

  if (data.ssh_port !== undefined) {
    const port = parseInt(data.ssh_port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('ssh_port muss zwischen 1 und 65535 liegen');
    }
  }

  return errors;
};

// Valid settings keys (whitelist)
const VALID_SETTINGS_KEYS = [
  'auto_discovery_enabled',
  'rediscovery_on_connect',
  'monitoring_default_interval',
  'stats_retention_hours',
  'alert_cpu_warning',
  'alert_cpu_critical',
  'alert_ram_warning',
  'alert_ram_critical',
  'alert_disk_warning',
  'alert_disk_critical',
  'alert_temp_warning',
  'alert_temp_critical',
];

// =====================================================
// Metrics API
// =====================================================

const scheduler = require('../collector/scheduler');
const fs = require('fs');
const path = require('path');
const pkg = require('../../package.json');

// Get system metrics
router.get('/metrics', asyncHandler(async (req, res) => {
  // Node counts
  const nodes = db.nodes.getAll();
  const onlineCount = nodes.filter(n => n.online === 1).length;
  const offlineCount = nodes.length - onlineCount;

  // Collection stats from scheduler
  const collectionStats = scheduler.getStats();

  // System info
  const memUsage = process.memoryUsage();

  // DB size
  let dbSizeBytes = 0;
  try {
    const dbPath = path.join(__dirname, '../../data/nodepulse.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      dbSizeBytes = stats.size;
    }
  } catch (err) {
    // Ignore errors, keep 0
  }

  apiResponse(res, 200, {
    nodes: {
      total: nodes.length,
      online: onlineCount,
      offline: offlineCount,
    },
    collection: {
      success_rate: collectionStats.success_rate,
      avg_duration_ms: collectionStats.avg_duration_ms,
      errors_last_hour: collectionStats.errors_last_hour,
      last_run: collectionStats.last_run,
      total_collections: collectionStats.total_collections,
    },
    system: {
      uptime_seconds: collectionStats.uptime_seconds,
      memory_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      memory_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      db_size_bytes: dbSizeBytes,
      version: pkg.version,
    },
  });
}));

// =====================================================
// Nodes API
// =====================================================

// Get all nodes
// Query params:
//   ?hierarchy=true - include parent/child info and child_count
//   ?tree=true - return full hierarchy tree structure
//   ?roots=true - only return root nodes (no parent)
router.get('/nodes', asyncHandler(async (req, res) => {
  const { hierarchy, tree, roots } = req.query;

  if (tree === 'true') {
    // Return full hierarchy tree
    const treeData = db.nodes.getHierarchyTree();
    return apiResponse(res, 200, treeData);
  }

  if (roots === 'true') {
    // Return only root nodes
    const rootNodes = db.nodes.getRootNodes();
    return apiResponse(res, 200, rootNodes);
  }

  if (hierarchy === 'true') {
    // Return all nodes with hierarchy info
    const nodes = db.nodes.getAllWithHierarchy();
    return apiResponse(res, 200, nodes);
  }

  // Default: return all nodes without hierarchy
  const nodes = db.nodes.getAll();
  apiResponse(res, 200, nodes);
}));

// Get single node
router.get('/nodes/:id', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }
  apiResponse(res, 200, node);
}));

// Create node
router.post('/nodes', asyncHandler(async (req, res) => {
  const { name, host, ssh_port, ssh_user, ssh_key_path, notes } = req.body;

  // Validation
  const errors = validateNodeInput({ name, host, ssh_user, ssh_port });
  if (errors.length > 0) {
    return apiResponse(res, 400, null, { code: 'VALIDATION_ERROR', message: errors.join(', ') });
  }

  // Check duplicate
  const existing = db.nodes.getByName(name.trim());
  if (existing) {
    return apiResponse(res, 409, null, { code: 'DUPLICATE', message: 'Node mit diesem Namen existiert bereits' });
  }

  try {
    const id = db.nodes.create({
      name: name.trim(),
      host: host.trim(),
      ssh_port: parseInt(ssh_port, 10) || 22,
      ssh_user: ssh_user.trim(),
      ssh_key_path: ssh_key_path ? ssh_key_path.trim() : null,
      notes: notes ? notes.trim() : null,
    });

    const node = db.nodes.getById(id);
    apiResponse(res, 201, node);
  } catch (err) {
    apiResponse(res, 500, null, { code: 'DB_ERROR', message: err.message });
  }
}));

// Update node
router.put('/nodes/:id', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const { name, host, ssh_port, ssh_user, ssh_key_path, notes, monitoring_enabled, monitoring_interval } = req.body;

  // Build update data with existing values as fallback
  const updateData = {
    name: name !== undefined ? name : node.name,
    host: host !== undefined ? host : node.host,
    ssh_port: ssh_port !== undefined ? parseInt(ssh_port, 10) : node.ssh_port,
    ssh_user: ssh_user !== undefined ? ssh_user : node.ssh_user,
    ssh_key_path: ssh_key_path !== undefined ? ssh_key_path : node.ssh_key_path,
    notes: notes !== undefined ? notes : node.notes,
    monitoring_enabled: monitoring_enabled !== undefined ? (monitoring_enabled ? 1 : 0) : node.monitoring_enabled,
    monitoring_interval: monitoring_interval !== undefined ? parseInt(monitoring_interval, 10) : node.monitoring_interval,
  };

  // Validation
  const errors = validateNodeInput(updateData);
  if (errors.length > 0) {
    return apiResponse(res, 400, null, { code: 'VALIDATION_ERROR', message: errors.join(', ') });
  }

  // Check duplicate name (except current node)
  if (updateData.name !== node.name) {
    const existing = db.nodes.getByName(updateData.name.trim());
    if (existing && existing.id !== node.id) {
      return apiResponse(res, 409, null, { code: 'DUPLICATE', message: 'Node mit diesem Namen existiert bereits' });
    }
  }

  try {
    db.nodes.update(node.id, {
      name: updateData.name.trim(),
      host: updateData.host.trim(),
      ssh_port: updateData.ssh_port,
      ssh_user: updateData.ssh_user.trim(),
      ssh_key_path: updateData.ssh_key_path ? updateData.ssh_key_path.trim() : null,
      notes: updateData.notes ? updateData.notes.trim() : null,
      monitoring_enabled: updateData.monitoring_enabled,
      monitoring_interval: updateData.monitoring_interval,
    });

    const updated = db.nodes.getById(node.id);
    apiResponse(res, 200, updated);
  } catch (err) {
    apiResponse(res, 500, null, { code: 'DB_ERROR', message: err.message });
  }
}));

// Delete node
router.delete('/nodes/:id', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  db.nodes.delete(node.id);
  apiResponse(res, 200, { deleted: true, id: node.id });
}));

// =====================================================
// Node Hierarchy API
// =====================================================

// Get node with children
router.get('/nodes/:id/children', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const children = db.nodes.getChildren(node.id);
  apiResponse(res, 200, children);
}));

// Set parent for a node
router.patch('/nodes/:id/parent', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const { parent_id } = req.body;

  // Validate parent_id
  if (parent_id !== null && parent_id !== undefined) {
    const parentId = parseInt(parent_id, 10);

    // Check if parent exists
    const parent = db.nodes.getById(parentId);
    if (!parent) {
      return apiResponse(res, 400, null, { code: 'INVALID_PARENT', message: 'Parent-Node nicht gefunden' });
    }

    // Prevent self-reference
    if (parentId === node.id) {
      return apiResponse(res, 400, null, { code: 'INVALID_PARENT', message: 'Node kann nicht sein eigener Parent sein' });
    }

    // Prevent circular references (check if parent is a child of this node)
    const isCircular = (nodeId, targetId) => {
      const children = db.nodes.getChildren(nodeId);
      for (const child of children) {
        if (child.id === targetId) return true;
        if (isCircular(child.id, targetId)) return true;
      }
      return false;
    };

    if (isCircular(node.id, parentId)) {
      return apiResponse(res, 400, null, { code: 'CIRCULAR_REF', message: 'Zirkuläre Referenz nicht erlaubt' });
    }

    db.nodes.setParent(node.id, parentId);
  } else {
    // Remove parent (set to null)
    db.nodes.setParent(node.id, null);
  }

  const updated = db.nodes.getById(node.id);
  apiResponse(res, 200, updated);
}));

// Import Proxmox VMs/CTs as child nodes
router.post('/nodes/:id/import-children', asyncHandler(async (req, res) => {
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Check if this is a Proxmox host
  const discovery = db.discovery.getForNode(node.id);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, { code: 'NOT_PROXMOX', message: 'Node ist kein Proxmox-Host' });
  }

  // Get Proxmox VMs and CTs
  const proxmoxData = db.proxmox.getAllForNode(node.id);
  const imported = [];
  const skipped = [];

  // Import VMs
  for (const vm of proxmoxData.vms || []) {
    // Skip templates
    if (vm.template === 1) {
      skipped.push({ type: 'vm', id: vm.vmid, name: vm.name, reason: 'Template' });
      continue;
    }

    // Check if already exists as node
    const vmNodeName = `${node.name}-vm-${vm.vmid}`;
    const existing = db.nodes.getByName(vmNodeName);

    if (existing) {
      skipped.push({ type: 'vm', id: vm.vmid, name: vm.name, reason: 'Existiert bereits' });
      continue;
    }

    // For Proxmox VMs, we'd need the VM's IP - use placeholder for now
    // In real implementation, you'd get the IP from qm guest exec or cloud-init
    imported.push({
      type: 'vm',
      vmid: vm.vmid,
      name: vm.name,
      suggested_node_name: vmNodeName,
      status: vm.status,
      needs_ip: true,
    });
  }

  // Import CTs
  for (const ct of proxmoxData.cts || []) {
    // Skip templates
    if (ct.template === 1) {
      skipped.push({ type: 'ct', id: ct.ctid, name: ct.name, reason: 'Template' });
      continue;
    }

    const ctNodeName = `${node.name}-ct-${ct.ctid}`;
    const existing = db.nodes.getByName(ctNodeName);

    if (existing) {
      skipped.push({ type: 'ct', id: ct.ctid, name: ct.name, reason: 'Existiert bereits' });
      continue;
    }

    imported.push({
      type: 'ct',
      ctid: ct.ctid,
      name: ct.name,
      suggested_node_name: ctNodeName,
      status: ct.status,
      needs_ip: true,
    });
  }

  apiResponse(res, 200, {
    parent_node: { id: node.id, name: node.name },
    available_for_import: imported,
    skipped: skipped,
    message: `${imported.length} VMs/CTs können importiert werden. ${skipped.length} übersprungen.`,
  });
}));

// Create child node from Proxmox VM/CT
router.post('/nodes/:id/create-child', asyncHandler(async (req, res) => {
  const parentNode = db.nodes.getByIdWithCredentials(req.params.id);
  if (!parentNode) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Parent-Node nicht gefunden' });
  }

  const { type, vmid, name, host, ssh_user, ssh_port, ssh_key_path, ssh_password } = req.body;

  // Validation
  if (!type || !['vm', 'ct'].includes(type)) {
    return apiResponse(res, 400, null, { code: 'VALIDATION_ERROR', message: 'type muss "vm" oder "ct" sein' });
  }

  if (!vmid) {
    return apiResponse(res, 400, null, { code: 'VALIDATION_ERROR', message: 'vmid ist erforderlich' });
  }

  if (!name || !name.trim()) {
    return apiResponse(res, 400, null, { code: 'VALIDATION_ERROR', message: 'name ist erforderlich' });
  }

  if (!host || !host.trim()) {
    return apiResponse(res, 400, null, { code: 'VALIDATION_ERROR', message: 'host (IP-Adresse) ist erforderlich' });
  }

  if (!ssh_user || !ssh_user.trim()) {
    return apiResponse(res, 400, null, { code: 'VALIDATION_ERROR', message: 'ssh_user ist erforderlich' });
  }

  // Check duplicate name
  const existing = db.nodes.getByName(name.trim());
  if (existing) {
    return apiResponse(res, 409, null, { code: 'DUPLICATE', message: 'Node mit diesem Namen existiert bereits' });
  }

  try {
    // Create the child node
    const nodeType = type === 'vm' ? 'proxmox-vm' : 'proxmox-ct';
    const id = db.nodes.create({
      name: name.trim(),
      host: host.trim(),
      ssh_port: parseInt(ssh_port, 10) || 22,
      ssh_user: ssh_user.trim(),
      ssh_password: ssh_password || null,
      ssh_key_path: ssh_key_path ? ssh_key_path.trim() : null,
      notes: `Auto-imported from ${parentNode.name} (${type.toUpperCase()} ${vmid})`,
    });

    // Set parent relationship and auto_discovered_from
    db.nodes.setParent(id, parentNode.id);
    db.nodes.setAutoDiscoveredFrom(id, parentNode.id);

    // Set node type
    const dbInstance = db.getDb();
    dbInstance.prepare('UPDATE nodes SET node_type = ?, node_type_locked = 1 WHERE id = ?').run(nodeType, id);

    const childNode = db.nodes.getById(id);
    apiResponse(res, 201, childNode);
  } catch (err) {
    apiResponse(res, 500, null, { code: 'DB_ERROR', message: err.message });
  }
}));

// Test SSH connection
router.post('/nodes/:id/test', asyncHandler(async (req, res) => {
  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    const result = await ssh.testConnection(node);
    db.nodes.setOnline(node.id, true);
    apiResponse(res, 200, {
      connected: true,
      hostname: result.hostname,
    });
  } catch (err) {
    db.nodes.setOnline(node.id, false, err.message);
    // Return 503 for connection failures (service unavailable)
    apiResponse(res, 503, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

// Run discovery on a node
router.post('/nodes/:id/discover', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    const result = await collector.runFullDiscovery(node);

    // Return 207 Multi-Status if hardware collection failed but discovery succeeded
    const statusCode = result.hardwareError ? 207 : 200;

    apiResponse(res, statusCode, {
      discovery: result.discovery,
      hardware: result.hardware,
      hardwareError: result.hardwareError || null,
      nodeType: result.nodeType,
    });
  } catch (err) {
    db.nodes.setOnline(node.id, false, err.message);
    apiResponse(res, 503, null, { code: 'DISCOVERY_ERROR', message: err.message });
  }
}));

// Get discovery data for a node
router.get('/nodes/:id/discovery', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const discovery = db.discovery.getForNode(node.id);
  apiResponse(res, 200, discovery || null);
}));

// Get hardware data for a node
router.get('/nodes/:id/hardware', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const hardware = db.hardware.getForNode(node.id);
  apiResponse(res, 200, hardware || null);
}));

// Refresh hardware data for a node
router.post('/nodes/:id/hardware', asyncHandler(async (req, res) => {
  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    const hardware = await collector.runHardware(node);
    apiResponse(res, 200, hardware);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'HARDWARE_ERROR', message: err.message });
  }
}));

// =====================================================
// System Info API (comprehensive system data)
// =====================================================

// Get comprehensive system info for a node
router.get('/nodes/:id/system-info', asyncHandler(async (req, res) => {
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    const systemInfo = await collector.runSystemInfo(node);
    apiResponse(res, 200, systemInfo);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'SYSTEM_INFO_ERROR', message: err.message });
  }
}));

// =====================================================
// Tags API
// =====================================================

// Get all tags
router.get('/tags', asyncHandler(async (req, res) => {
  const tags = db.tags.getAll();
  apiResponse(res, 200, tags);
}));

// Get tags for node
router.get('/nodes/:id/tags', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const tags = db.tags.getForNode(node.id);
  apiResponse(res, 200, tags);
}));

// =====================================================
// Stats API
// =====================================================

// Get current stats for all nodes
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = db.stats.getAllNodesWithStats();
  apiResponse(res, 200, stats);
}));

// Get current stats for a node
router.get('/nodes/:id/stats', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  const node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const stats = db.stats.getCurrent(nodeId);
  apiResponse(res, 200, stats || null);
}));

// Get stats history for a node
router.get('/nodes/:id/stats/history', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  const node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const hours = parseInt(req.query.hours, 10) || 24;
  const history = db.stats.getHistory(nodeId, hours);
  apiResponse(res, 200, history);
}));

// Collect stats now for a node
router.post('/nodes/:id/stats', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    const data = await collector.runStats(node, true);
    apiResponse(res, 200, data);
  } catch (err) {
    db.nodes.setOnline(node.id, false, err.message);
    apiResponse(res, 503, null, { code: 'STATS_ERROR', message: err.message });
  }
}));

// =====================================================
// Docker API
// =====================================================

// Get all Docker data for a node
router.get('/nodes/:id/docker', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var dockerData = db.docker.getAllForNode(nodeId);
  var summary = db.docker.getSummary(nodeId);
  apiResponse(res, 200, {
    containers: dockerData.containers,
    images: dockerData.images,
    volumes: dockerData.volumes,
    networks: dockerData.networks,
    summary: summary,
  });
}));

// Refresh Docker data for a node (collect from remote)
router.post('/nodes/:id/docker', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var data = await collector.runDocker(node);
    apiResponse(res, 200, data);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Get containers for a node
router.get('/nodes/:id/docker/containers', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var containers = db.docker.getContainers(nodeId);
  apiResponse(res, 200, containers);
}));

// Container action (start/stop/restart)
router.post('/nodes/:id/docker/containers/:containerId/:action', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var containerId = req.params.containerId;
  var action = req.params.action;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate containerId (hex only, 12-64 chars) - prevent command injection
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CONTAINER_ID', message: 'Ungueltige Container-ID' });
  }

  // Validate action
  var validActions = ['start', 'stop', 'restart', 'pause', 'unpause'];
  if (validActions.indexOf(action) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_ACTION', message: 'Ungueltige Aktion. Erlaubt: ' + validActions.join(', ') });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'docker ' + action + ' ' + containerId;
    var result = await collector.runDockerCommand(node, command, 60000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: result.stderr || 'Aktion fehlgeschlagen' });
    }

    // Refresh container list after action
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, { action: action, containerId: containerId, success: true });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Get container logs
router.get('/nodes/:id/docker/containers/:containerId/logs', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var containerId = req.params.containerId;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate containerId (hex only, 12-64 chars) - prevent command injection
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CONTAINER_ID', message: 'Ungueltige Container-ID' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var tail = parseInt(req.query.tail, 10) || 100;
  if (tail > 1000) tail = 1000;
  if (tail < 10) tail = 10;

  try {
    var command = 'docker logs --tail ' + tail + ' ' + containerId + ' 2>&1';
    var result = await collector.runDockerCommand(node, command, 30000);

    apiResponse(res, 200, {
      containerId: containerId,
      logs: result.stdout,
      tail: tail,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Get images for a node
router.get('/nodes/:id/docker/images', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var images = db.docker.getImages(nodeId);
  apiResponse(res, 200, images);
}));

// Get volumes for a node
router.get('/nodes/:id/docker/volumes', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var volumes = db.docker.getVolumes(nodeId);
  apiResponse(res, 200, volumes);
}));

// Get networks for a node
router.get('/nodes/:id/docker/networks', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var networks = db.docker.getNetworks(nodeId);
  apiResponse(res, 200, networks);
}));

// =====================================================
// Docker DELETE Operations (mit force Option)
// =====================================================

// Delete a container
router.delete('/nodes/:id/docker/containers/:containerId', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var containerId = req.params.containerId;
  var force = req.query.force === 'true';

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate container ID (hex, 12-64 chars)
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_CONTAINER_ID', message: 'Ungueltige Container-ID (hex, 12-64 Zeichen)' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = force ? 'docker rm -f ' + containerId : 'docker rm ' + containerId;
    var result = await collector.runDockerCommand(node, command, 30000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Container konnte nicht geloescht werden';
      // Check for specific errors
      if (errMsg.includes('is running')) {
        return apiResponse(res, 409, null, { code: 'CONTAINER_RUNNING', message: 'Container laeuft noch. Nutze force=true oder stoppe den Container zuerst.' });
      }
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: errMsg });
    }

    // Refresh Docker data
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      containerId: containerId,
      deleted: true,
      forced: force,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Delete an image
router.delete('/nodes/:id/docker/images/:imageId', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var imageId = req.params.imageId;
  var force = req.query.force === 'true';

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate image ID (hex sha256, 12-64 chars) or name:tag format
  var isValidHex = /^[a-f0-9]{12,64}$/i.test(imageId);
  var isValidNameTag = /^[a-z0-9][a-z0-9._\/-]*(:[\w][\w.-]*)?$/i.test(imageId);
  if (!isValidHex && !isValidNameTag) {
    return apiResponse(res, 400, null, { code: 'INVALID_IMAGE_ID', message: 'Ungueltige Image-ID oder Name:Tag' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = force ? 'docker rmi -f ' + imageId : 'docker rmi ' + imageId;
    var result = await collector.runDockerCommand(node, command, 60000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Image konnte nicht geloescht werden';
      if (errMsg.includes('image is being used') || errMsg.includes('image has dependent')) {
        return apiResponse(res, 409, null, { code: 'IMAGE_IN_USE', message: 'Image wird von Container(n) verwendet. Nutze force=true fuer forciertes Loeschen.' });
      }
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: errMsg });
    }

    // Refresh Docker data
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      imageId: imageId,
      deleted: true,
      forced: force,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Delete a volume
router.delete('/nodes/:id/docker/volumes/:volumeName', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var volumeName = req.params.volumeName;
  var force = req.query.force === 'true';

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate volume name (alphanumeric, underscore, dash, dots)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(volumeName)) {
    return apiResponse(res, 400, null, { code: 'INVALID_VOLUME_NAME', message: 'Ungueltiger Volume-Name' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    // Note: docker volume rm has no -f flag, volumes in use cannot be force-deleted
    var command = 'docker volume rm ' + volumeName;
    var result = await collector.runDockerCommand(node, command, 30000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Volume konnte nicht geloescht werden';
      if (errMsg.includes('volume is in use')) {
        return apiResponse(res, 409, null, { code: 'VOLUME_IN_USE', message: 'Volume wird von Container(n) verwendet und kann nicht geloescht werden.' });
      }
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: errMsg });
    }

    // Refresh Docker data
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      volumeName: volumeName,
      deleted: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Delete a network
router.delete('/nodes/:id/docker/networks/:networkId', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var networkId = req.params.networkId;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate network ID (hex, 12-64 chars) or name format
  var isValidHex = /^[a-f0-9]{12,64}$/i.test(networkId);
  var isValidName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(networkId);
  if (!isValidHex && !isValidName) {
    return apiResponse(res, 400, null, { code: 'INVALID_NETWORK_ID', message: 'Ungueltige Network-ID oder Name' });
  }

  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command = 'docker network rm ' + networkId;
    var result = await collector.runDockerCommand(node, command, 30000);

    if (result.exitCode !== 0) {
      var errMsg = result.stderr || 'Network konnte nicht geloescht werden';
      if (errMsg.includes('has active endpoints') || errMsg.includes('network is in use')) {
        return apiResponse(res, 409, null, { code: 'NETWORK_IN_USE', message: 'Network wird von Container(n) verwendet und kann nicht geloescht werden.' });
      }
      // Prevent deletion of default networks
      if (errMsg.includes('bridge') || errMsg.includes('host') || errMsg.includes('none')) {
        return apiResponse(res, 403, null, { code: 'NETWORK_PROTECTED', message: 'Standard-Netzwerke (bridge, host, none) koennen nicht geloescht werden.' });
      }
      return apiResponse(res, 500, null, { code: 'DOCKER_ERROR', message: errMsg });
    }

    // Refresh Docker data
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      networkId: networkId,
      deleted: true,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// Docker prune commands
router.post('/nodes/:id/docker/prune/:type', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var pruneType = req.params.type;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate prune type
  var validTypes = ['system', 'containers', 'images', 'volumes', 'networks'];
  if (validTypes.indexOf(pruneType) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_TYPE', message: 'Ungueltiger Prune-Typ. Erlaubt: ' + validTypes.join(', ') });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    var command;
    if (pruneType === 'system') {
      command = 'docker system prune -f';
    } else if (pruneType === 'containers') {
      command = 'docker container prune -f';
    } else if (pruneType === 'images') {
      command = 'docker image prune -a -f';
    } else if (pruneType === 'volumes') {
      command = 'docker volume prune -f';
    } else if (pruneType === 'networks') {
      command = 'docker network prune -f';
    }

    var result = await collector.runDockerCommand(node, command, 120000);

    // Refresh Docker data after prune
    try {
      await collector.runDocker(node);
    } catch (refreshErr) {
      // Ignore refresh errors
    }

    apiResponse(res, 200, {
      type: pruneType,
      output: result.stdout,
      success: result.exitCode === 0,
    });
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DOCKER_ERROR', message: err.message });
  }
}));

// =====================================================
// Proxmox API
// =====================================================

// Get all Proxmox data for a node
router.get('/nodes/:id/proxmox', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.post('/nodes/:id/proxmox', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.get('/nodes/:id/proxmox/vms', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.get('/nodes/:id/proxmox/cts', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.get('/nodes/:id/proxmox/storage', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.get('/nodes/:id/proxmox/snapshots', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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

// VM action (start/stop/shutdown)
router.post('/nodes/:id/proxmox/vms/:vmid/:action', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.post('/nodes/:id/proxmox/cts/:ctid/:action', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.patch('/nodes/:id/proxmox/vms/:vmid/config', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.patch('/nodes/:id/proxmox/cts/:ctid/config', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.post('/nodes/:id/proxmox/vms/:vmid/resize', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.post('/nodes/:id/proxmox/cts/:ctid/resize', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.post('/nodes/:id/proxmox/vms/:vmid/clone', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.post('/nodes/:id/proxmox/cts/:ctid/clone', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.post('/nodes/:id/proxmox/vms/:vmid/template', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);

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
router.post('/nodes/:id/proxmox/cts/:ctid/template', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);

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

// Create snapshot
router.post('/nodes/:id/proxmox/snapshots', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
router.delete('/nodes/:id/proxmox/snapshots/:vmType/:vmid/:snapName', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
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
      return apiResponse(res, 500, null, { code: 'PROXMOX_ERROR', message: result.stderr || 'Snapshot löschen fehlgeschlagen' });
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
// Settings API
// =====================================================

// Get all settings
router.get('/settings', asyncHandler(async (req, res) => {
  const settings = db.settings.getAll();
  apiResponse(res, 200, settings);
}));

// Update a setting
router.put('/settings/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  // Validate key against whitelist
  if (!VALID_SETTINGS_KEYS.includes(key)) {
    return apiResponse(res, 400, null, { code: 'INVALID_KEY', message: `Ungueltiger Settings-Key: ${key}` });
  }

  if (value === undefined) {
    return apiResponse(res, 400, null, { code: 'MISSING_VALUE', message: 'value ist erforderlich' });
  }

  db.settings.set(key, String(value));
  apiResponse(res, 200, { key, value: String(value) });
}));

// =====================================================
// Commands API
// =====================================================

// Blocked commands that could be dangerous
var BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'dd if=',
  'mkfs',
  ':(){:|:&};:',
  '> /dev/sda',
  'chmod -R 777 /',
  'chown -R',
  'wget http',
  'curl http',
  'nc -e',
  'bash -i',
  '/dev/tcp/',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
  'halt',
  'poweroff',
  'eval ',
  'exec ',
  'source ',
  'python -c',
  'perl -e',
  'ruby -e',
  'php -r',
  'iptables',
  'crontab',
  'passwd',
  'useradd',
  'usermod',
  'kill -9',
  'killall',
  'pkill',
];

// Shell metacharacters that enable command chaining/injection
var DANGEROUS_METACHARACTERS = [';', '&&', '||', '|', '$(', '`', '>>', '<<', '\n', '\r'];

// Check for dangerous shell metacharacters
function containsDangerousMetachars(command) {
  for (var i = 0; i < DANGEROUS_METACHARACTERS.length; i++) {
    if (command.indexOf(DANGEROUS_METACHARACTERS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

// Validate command is not blocked
function isCommandBlocked(command) {
  var lowerCmd = command.toLowerCase().trim();
  for (var i = 0; i < BLOCKED_COMMANDS.length; i++) {
    if (lowerCmd.indexOf(BLOCKED_COMMANDS[i].toLowerCase()) !== -1) {
      return true;
    }
  }
  return false;
}

// Get command templates
router.get('/commands/templates', asyncHandler(async (req, res) => {
  var category = req.query.category;
  var templates = db.commands.getTemplates(category || null);
  apiResponse(res, 200, templates);
}));

// Get templates for specific node type
router.get('/commands/templates/for/:nodeType', asyncHandler(async (req, res) => {
  var nodeType = req.params.nodeType;

  // Validate node type
  var VALID_NODE_TYPES = ['proxmox-host', 'docker-host', 'bare-metal', 'raspberry-pi', 'all', 'unknown'];
  if (VALID_NODE_TYPES.indexOf(nodeType) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_TYPE', message: 'Ungueltiger Node-Typ' });
  }

  var templates = db.commands.getTemplatesForNodeType(nodeType);
  apiResponse(res, 200, templates);
}));

// Get command history
router.get('/commands/history', asyncHandler(async (req, res) => {
  var limit = parseInt(req.query.limit, 10) || 50;
  if (limit < 1 || limit > 500) limit = 50;
  var history = db.commands.getHistory(limit);
  apiResponse(res, 200, history);
}));

// Get command history for a node
router.get('/nodes/:id/commands/history', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var limit = parseInt(req.query.limit, 10) || 20;
  if (limit < 1 || limit > 100) limit = 20;

  var history = db.commands.getHistoryForNode(nodeId, limit);
  apiResponse(res, 200, history);
}));

// Execute command on a node
router.post('/nodes/:id/commands', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var command = req.body.command;
  var templateId = req.body.template_id ? parseInt(req.body.template_id, 10) : null;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    return apiResponse(res, 400, null, { code: 'INVALID_COMMAND', message: 'Command ist erforderlich' });
  }

  command = command.trim();

  // Validate command length
  if (command.length > 2000) {
    return apiResponse(res, 400, null, { code: 'COMMAND_TOO_LONG', message: 'Command darf maximal 2000 Zeichen lang sein' });
  }

  // Check for dangerous shell metacharacters (command injection prevention)
  if (containsDangerousMetachars(command)) {
    return apiResponse(res, 400, null, { code: 'DANGEROUS_CHARACTERS', message: 'Command enthaelt gefaehrliche Zeichen (;, &&, ||, |, etc.)' });
  }

  // Check for blocked commands
  if (isCommandBlocked(command)) {
    return apiResponse(res, 400, null, { code: 'BLOCKED_COMMAND', message: 'Dieser Befehl ist aus Sicherheitsgruenden blockiert' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Create history entry
  var historyId = db.commands.createHistory({
    command_template_id: templateId,
    full_command: command,
    target_type: 'single',
    target_value: node.name,
  });

  var startedAt = new Date().toISOString();
  var result;
  var status = 'success';

  try {
    // Execute command with 2 minute timeout
    result = await ssh.execute(node, command, 120000);

    if (result.exitCode !== 0) {
      status = 'failed';
    }
  } catch (err) {
    status = err.message.toLowerCase().indexOf('timeout') !== -1 ? 'timeout' : 'failed';
    result = {
      stdout: '',
      stderr: err.message,
      exitCode: -1,
    };
  }

  var finishedAt = new Date().toISOString();

  // Save result
  var resultId = db.commands.createResult({
    history_id: historyId,
    node_id: nodeId,
    status: status,
    exit_code: result.exitCode,
    output: result.stdout || '',
    error: result.stderr || '',
    started_at: startedAt,
    finished_at: finishedAt,
  });

  // Update node online status
  if (status === 'success' || status === 'failed') {
    db.nodes.setOnline(nodeId, true);
  } else if (status === 'timeout') {
    db.nodes.setOnline(nodeId, false, 'Command timeout');
  }

  apiResponse(res, status === 'success' ? 200 : 500, {
    result_id: resultId,
    history_id: historyId,
    status: status,
    exit_code: result.exitCode,
    output: result.stdout || '',
    error: result.stderr || '',
    started_at: startedAt,
    finished_at: finishedAt,
  });
}));

// Get command result by ID
router.get('/commands/results/:id', asyncHandler(async (req, res) => {
  var resultId = parseInt(req.params.id, 10);
  if (isNaN(resultId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Result-ID' });
  }

  var result = db.commands.getResultById(resultId);
  if (!result) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Result nicht gefunden' });
  }

  apiResponse(res, 200, result);
}));

// =====================================================
// Services API (systemd)
// =====================================================

// Get systemd services for a node
router.get('/nodes/:id/services', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Check if node has systemd
  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.has_systemd) {
    return apiResponse(res, 400, null, { code: 'NO_SYSTEMD', message: 'Node hat kein systemd' });
  }

  try {
    // Get list of services with status
    var result = await ssh.execute(node, 'systemctl list-units --type=service --no-pager --plain --no-legend', 30000);

    if (result.exitCode !== 0) {
      return apiResponse(res, 500, null, { code: 'COMMAND_FAILED', message: result.stderr || 'Konnte Services nicht abrufen' });
    }

    // Parse the output
    var services = [];
    var lines = (result.stdout || '').split('\n');

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      // Format: UNIT LOAD ACTIVE SUB DESCRIPTION
      var parts = line.split(/\s+/);
      if (parts.length >= 4) {
        var unit = parts[0];
        var load = parts[1];
        var active = parts[2];
        var sub = parts[3];
        var description = parts.slice(4).join(' ');

        // Only include actual services (not template instances, etc)
        if (unit.match(/\.service$/)) {
          services.push({
            name: unit.replace('.service', ''),
            unit: unit,
            load: load,
            active: active,
            sub: sub,
            description: description,
          });
        }
      }
    }

    db.nodes.setOnline(nodeId, true);
    apiResponse(res, 200, { services: services });
  } catch (err) {
    db.nodes.setOnline(nodeId, false, err.message);
    apiResponse(res, 500, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

// Control a systemd service (start/stop/restart)
router.post('/nodes/:id/services/:service/:action', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  var serviceName = req.params.service;
  var action = req.params.action;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  // Validate action
  var validActions = ['start', 'stop', 'restart', 'status'];
  if (validActions.indexOf(action) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_ACTION', message: 'Ungueltige Aktion. Erlaubt: start, stop, restart, status' });
  }

  // Validate service name (only alphanumeric, dash, underscore, @ allowed, max 255 chars)
  if (!serviceName.match(/^[a-zA-Z0-9_@-]+$/) || serviceName.length > 255) {
    return apiResponse(res, 400, null, { code: 'INVALID_SERVICE', message: 'Ungueltiger Service-Name (max. 255 Zeichen)' });
  }

  // Need credentials for SSH connection
  var node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Check if node has systemd
  var discovery = db.discovery.getForNode(nodeId);
  if (!discovery || !discovery.has_systemd) {
    return apiResponse(res, 400, null, { code: 'NO_SYSTEMD', message: 'Node hat kein systemd' });
  }

  try {
    // Execute systemctl command
    var command = 'sudo systemctl ' + action + ' ' + serviceName + '.service';
    if (action === 'status') {
      command = 'systemctl status ' + serviceName + '.service --no-pager';
    }

    var result = await ssh.execute(node, command, 30000);

    // For status, exitCode != 0 is normal for stopped services
    if (action !== 'status' && result.exitCode !== 0) {
      return apiResponse(res, 500, null, {
        code: 'COMMAND_FAILED',
        message: result.stderr || 'Aktion fehlgeschlagen',
        output: result.stdout || '',
      });
    }

    db.nodes.setOnline(nodeId, true);
    apiResponse(res, 200, {
      service: serviceName,
      action: action,
      exit_code: result.exitCode,
      output: result.stdout || '',
      error: result.stderr || '',
    });
  } catch (err) {
    db.nodes.setOnline(nodeId, false, err.message);
    apiResponse(res, 500, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

// =====================================================
// Alerts API
// =====================================================

// Get alert counts for header badge
router.get('/alerts/count', asyncHandler(async (req, res) => {
  const counts = {
    total: db.alerts.getActiveCount(),
    warning: db.alerts.getActiveCountByLevel('warning'),
    critical: db.alerts.getActiveCountByLevel('critical')
  };
  apiResponse(res, 200, counts);
}));

// Get all active alerts
router.get('/alerts', asyncHandler(async (req, res) => {
  const alerts = db.alerts.getActive();
  const alertsWithNodes = alerts.map(alert => {
    const node = db.nodes.getById(alert.node_id);
    return {
      ...alert,
      node_name: node ? node.name : 'Unbekannt'
    };
  });
  apiResponse(res, 200, alertsWithNodes);
}));

// Acknowledge an alert
router.post('/alerts/:id/acknowledge', asyncHandler(async (req, res) => {
  const alertId = parseInt(req.params.id, 10);
  if (isNaN(alertId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Alert-ID' });
  }

  db.alerts.acknowledge(alertId);
  apiResponse(res, 200, { acknowledged: true });
}));

module.exports = router;

/**
 * Nodes API Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../../db');
const ssh = require('../../ssh');
const collector = require('../../collector');
const childCollector = require('../../collector/child-collector');
const { asyncHandler, apiResponse, validateNodeInput } = require('./helpers');
const { validatePort } = require('../../lib/validators');
const { parseIntParam, parseHoursParam, parseLimitParam, parseMaxHopsParam } = require('../../lib/params');

// =====================================================
// Basic CRUD Operations
// =====================================================

// Get all nodes
// Query params:
//   ?hierarchy=true - include parent/child info and child_count
//   ?tree=true - return full hierarchy tree structure
//   ?roots=true - only return root nodes (no parent)
router.get('/', asyncHandler(async (req, res) => {
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
router.get('/:id', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }
  apiResponse(res, 200, node);
}));

// Create node
router.post('/', asyncHandler(async (req, res) => {
  const { name, host, ssh_port, ssh_user, ssh_password, ssh_key_path, notes } = req.body;

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
      ssh_port: validatePort(ssh_port, 22).value,
      ssh_user: ssh_user.trim(),
      ssh_password: ssh_password ? ssh_password.trim() : null,
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
router.put('/:id', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const { name, host, ssh_port, ssh_user, ssh_password, ssh_key_path, notes, monitoring_enabled, monitoring_interval } = req.body;

  // Build update data with existing values as fallback
  const updateData = {
    name: name !== undefined ? name : node.name,
    host: host !== undefined ? host : node.host,
    ssh_port: ssh_port !== undefined ? validatePort(ssh_port, node.ssh_port).value : node.ssh_port,
    ssh_user: ssh_user !== undefined ? ssh_user : node.ssh_user,
    ssh_key_path: ssh_key_path !== undefined ? ssh_key_path : node.ssh_key_path,
    notes: notes !== undefined ? notes : node.notes,
    monitoring_enabled: monitoring_enabled !== undefined ? (monitoring_enabled ? 1 : 0) : node.monitoring_enabled,
    monitoring_interval: monitoring_interval !== undefined ? parseIntParam(monitoring_interval, node.monitoring_interval) : node.monitoring_interval,
    // Only update password if a new one is provided (non-empty)
    ssh_password: (ssh_password && ssh_password.trim()) ? ssh_password.trim() : node.ssh_password,
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
      ssh_password: updateData.ssh_password || null,
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
router.delete('/:id', asyncHandler(async (req, res) => {
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
router.get('/:id/children', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const children = db.nodes.getChildren(node.id);
  apiResponse(res, 200, children);
}));

// Set parent for a node
router.patch('/:id/parent', asyncHandler(async (req, res) => {
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
      return apiResponse(res, 400, null, { code: 'CIRCULAR_REF', message: 'Zirkulaere Referenz nicht erlaubt' });
    }

    db.nodes.setParent(node.id, parentId);
  } else {
    // Remove parent (set to null)
    db.nodes.setParent(node.id, null);
  }

  const updated = db.nodes.getById(node.id);
  apiResponse(res, 200, updated);
}));

// Update guest IP for child nodes (VMs/LXCs)
// Also updates host field for network tools
router.patch('/:id/guest-ip', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungültige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Only allow for child nodes (VMs/LXCs)
  if (!node.guest_type) {
    return apiResponse(res, 400, null, {
      code: 'NOT_CHILD',
      message: 'Guest-IP kann nur für Child-Nodes (VMs/LXCs) gesetzt werden'
    });
  }

  var guestIp = req.body.guest_ip;

  // Allow empty string or null to reset to auto-detection
  if (guestIp === '' || guestIp === undefined) {
    guestIp = null;
  }

  // Validate IP format if provided
  if (guestIp) {
    // Simple IPv4 validation
    var ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipPattern.test(guestIp)) {
      return apiResponse(res, 400, null, {
        code: 'INVALID_IP',
        message: 'Ungültiges IP-Format (erwartet: IPv4, z.B. 192.168.1.100)'
      });
    }
  }

  // Update guest_ip
  db.nodes.setGuestIp(nodeId, guestIp);

  // Also update host field for network tools (ping, traceroute, etc.)
  if (guestIp) {
    var stmt = db.getDb().prepare('UPDATE nodes SET host = ? WHERE id = ?');
    stmt.run(guestIp, nodeId);
  } else {
    // Reset to parent host if guest_ip is cleared
    if (node.parent_id) {
      var parent = db.nodes.getById(node.parent_id);
      if (parent) {
        var stmt = db.getDb().prepare('UPDATE nodes SET host = ? WHERE id = ?');
        stmt.run(parent.host, nodeId);
      }
    }
  }

  var updated = db.nodes.getById(nodeId);
  apiResponse(res, 200, {
    success: true,
    guest_ip: updated.guest_ip,
    host: updated.host,
    message: guestIp ? 'Guest-IP gesetzt' : 'Guest-IP zurückgesetzt (Auto-Detection aktiv)'
  });
}));

// Import Proxmox VMs/CTs as child nodes
router.post('/:id/import-children', asyncHandler(async (req, res) => {
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
    message: `${imported.length} VMs/CTs koennen importiert werden. ${skipped.length} uebersprungen.`,
  });
}));

// Create child node from Proxmox VM/CT
router.post('/:id/create-child', asyncHandler(async (req, res) => {
  const parentNode = db.nodes.getByIdWithCredentials(req.params.id);
  if (!parentNode) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Parent-Node nicht gefunden' });
  }

  let { type, vmid, name, host, ssh_user, ssh_port, ssh_key_path, ssh_password } = req.body;

  // Inherit credentials from parent if setting is enabled and no credentials provided
  const settings = db.settings.getAll();
  if (settings.import_inherit_credentials !== 'false') {
    if (!ssh_user || !ssh_user.trim()) {
      ssh_user = parentNode.ssh_user;
    }
    if (!ssh_password && !ssh_key_path) {
      ssh_password = parentNode.ssh_password;
      ssh_key_path = parentNode.ssh_key_path;
    }
    if (!ssh_port) {
      ssh_port = parentNode.ssh_port;
    }
  }

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
      ssh_port: validatePort(ssh_port, 22).value,
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

// =====================================================
// SSH & Discovery Operations
// =====================================================

// Test connection (SSH for normal nodes, pct/qm exec for child nodes)
router.post('/:id/test', asyncHandler(async (req, res) => {
  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    // Check if this is a child node (VM/LXC)
    if (node.guest_type && node.parent_id) {
      // Child-Node: Test via pct/qm exec through parent
      const parent = db.nodes.getByIdWithCredentials(node.parent_id);
      if (!parent) {
        return apiResponse(res, 400, null, { code: 'PARENT_NOT_FOUND', message: 'Parent-Node nicht gefunden' });
      }
      if (!parent.online) {
        return apiResponse(res, 503, null, { code: 'PARENT_OFFLINE', message: 'Parent-Node ist offline' });
      }

      const result = await childCollector.execInChild(
        parent,
        node.guest_vmid,
        node.guest_type,
        'hostname',
        { timeout: 15000 }
      );

      if (result.success) {
        db.nodes.setOnline(node.id, true);
        apiResponse(res, 200, {
          connected: true,
          hostname: result.stdout.trim(),
          connection_type: node.guest_type === 'lxc' ? 'pct exec' : 'qm guest exec',
        });
      } else {
        db.nodes.setOnline(node.id, false, result.error);
        apiResponse(res, 503, null, { code: 'EXEC_ERROR', message: result.error });
      }
    } else {
      // Normal node: Direct SSH test
      const result = await ssh.testConnection(node);
      db.nodes.setOnline(node.id, true);
      apiResponse(res, 200, {
        connected: true,
        hostname: result.hostname,
        connection_type: 'ssh',
      });
    }
  } catch (err) {
    db.nodes.setOnline(node.id, false, err.message);
    // Return 503 for connection failures (service unavailable)
    apiResponse(res, 503, null, { code: 'SSH_ERROR', message: err.message });
  }
}));

// Run discovery on a node
router.post('/:id/discover', asyncHandler(async (req, res) => {
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
    // Check if this is a child node (VM/LXC)
    if (node.guest_type && node.parent_id) {
      // Child-Node: Discovery via pct/qm exec through parent
      const discoveryData = await collector.runDiscoveryForChild(node);

      // Determine node type from discovery data
      const nodeType = collector.determineNodeType(discoveryData);
      db.nodes.setNodeType(node.id, nodeType);

      // Apply auto-tags
      collector.applyAutoTags(node.id, discoveryData);

      apiResponse(res, 200, {
        discovery: discoveryData,
        hardware: null,  // Hardware collection not implemented for child nodes yet
        hardwareError: null,
        nodeType: nodeType,
        connection_type: node.guest_type === 'lxc' ? 'pct exec' : 'qm guest exec',
      });
    } else {
      // Normal node: Direct SSH discovery
      const result = await collector.runFullDiscovery(node);

      // Return 207 Multi-Status if hardware collection failed but discovery succeeded
      const statusCode = result.hardwareError ? 207 : 200;

      apiResponse(res, statusCode, {
        discovery: result.discovery,
        hardware: result.hardware,
        hardwareError: result.hardwareError || null,
        nodeType: result.nodeType,
        connection_type: 'ssh',
      });
    }
  } catch (err) {
    db.nodes.setOnline(node.id, false, err.message);
    apiResponse(res, 503, null, { code: 'DISCOVERY_ERROR', message: err.message });
  }
}));

// Get discovery data for a node
router.get('/:id/discovery', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const discovery = db.discovery.getForNode(node.id);
  apiResponse(res, 200, discovery || null);
}));

// Get hardware data for a node
router.get('/:id/hardware', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const hardware = db.hardware.getForNode(node.id);
  apiResponse(res, 200, hardware || null);
}));

// Refresh hardware data for a node
router.post('/:id/hardware', asyncHandler(async (req, res) => {
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
router.get('/:id/system-info', asyncHandler(async (req, res) => {
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
// Network Diagnostics API
// =====================================================

// Get network diagnostics for a node
router.get('/:id/network', asyncHandler(async (req, res) => {
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  try {
    const networkData = await collector.runNetworkDiagnostics(node);
    apiResponse(res, 200, networkData);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'NETWORK_ERROR', message: err.message });
  }
}));

// Run ping test from a node
router.post('/:id/network/ping', asyncHandler(async (req, res) => {
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const target = req.body.target;
  if (!target || typeof target !== 'string') {
    return apiResponse(res, 400, null, { code: 'INVALID_TARGET', message: 'target ist erforderlich' });
  }

  // Basic validation
  if (target.length > 255) {
    return apiResponse(res, 400, null, { code: 'INVALID_TARGET', message: 'target darf maximal 255 Zeichen lang sein' });
  }

  const count = parseInt(req.body.count, 10) || 4;
  if (count < 1 || count > 20) {
    return apiResponse(res, 400, null, { code: 'INVALID_COUNT', message: 'count muss zwischen 1 und 20 liegen' });
  }

  try {
    const result = await collector.runPingTest(node, target, count);
    apiResponse(res, 200, result);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'PING_ERROR', message: err.message });
  }
}));

// Run DNS lookup from a node
router.post('/:id/network/dns', asyncHandler(async (req, res) => {
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const hostname = req.body.hostname;
  if (!hostname || typeof hostname !== 'string') {
    return apiResponse(res, 400, null, { code: 'INVALID_HOSTNAME', message: 'hostname ist erforderlich' });
  }

  if (hostname.length > 255) {
    return apiResponse(res, 400, null, { code: 'INVALID_HOSTNAME', message: 'hostname darf maximal 255 Zeichen lang sein' });
  }

  try {
    const result = await collector.runDnsLookup(node, hostname);
    apiResponse(res, 200, result);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'DNS_ERROR', message: err.message });
  }
}));

// Run traceroute from a node
router.post('/:id/network/traceroute', asyncHandler(async (req, res) => {
  const node = db.nodes.getByIdWithCredentials(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const target = req.body.target;
  if (!target || typeof target !== 'string') {
    return apiResponse(res, 400, null, { code: 'INVALID_TARGET', message: 'target ist erforderlich' });
  }

  if (target.length > 255) {
    return apiResponse(res, 400, null, { code: 'INVALID_TARGET', message: 'target darf maximal 255 Zeichen lang sein' });
  }

  const maxHops = parseMaxHopsParam(req.body.maxHops);
  if (maxHops < 1 || maxHops > 64) {
    return apiResponse(res, 400, null, { code: 'INVALID_MAXHOPS', message: 'maxHops muss zwischen 1 und 64 liegen' });
  }

  try {
    const result = await collector.runTraceroute(node, target, maxHops);
    apiResponse(res, 200, result);
  } catch (err) {
    apiResponse(res, 503, null, { code: 'TRACEROUTE_ERROR', message: err.message });
  }
}));

// =====================================================
// Tags API (node-specific)
// =====================================================

// Get tags for node
router.get('/:id/tags', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const tags = db.tags.getForNode(node.id);
  apiResponse(res, 200, tags);
}));

// =====================================================
// Stats API (node-specific)
// =====================================================

// Get current stats for a node
router.get('/:id/stats', asyncHandler(async (req, res) => {
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
router.get('/:id/stats/history', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  const node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const hours = parseHoursParam(req.query.hours);
  const history = db.stats.getHistory(nodeId, hours);
  apiResponse(res, 200, history);
}));

// Collect stats now for a node
router.post('/:id/stats', asyncHandler(async (req, res) => {
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
    let data;
    // Check if this is a child node (VM/LXC)
    if (node.guest_type && node.parent_id) {
      // Child-Node: Stats via pct/qm exec through parent
      data = await collector.runStatsForChild(node, true);
    } else {
      // Normal node: Direct SSH stats
      data = await collector.runStats(node, true);
    }
    apiResponse(res, 200, data);
  } catch (err) {
    db.nodes.setOnline(node.id, false, err.message);
    apiResponse(res, 503, null, { code: 'STATS_ERROR', message: err.message });
  }
}));

// =====================================================
// Commands API (node-specific)
// =====================================================

// Get command history for a node
router.get('/:id/commands/history', asyncHandler(async (req, res) => {
  var nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var limit = parseLimitParam(req.query.limit, 20);
  if (limit < 1 || limit > 100) limit = 20;

  var history = db.commands.getHistoryForNode(nodeId, limit);
  apiResponse(res, 200, history);
}));

// =====================================================
// Circuit Breaker Management
// =====================================================

var CircuitBreaker = require('../../lib/circuit-breaker');

// Reset circuit breaker for a node (allows retry after failures)
router.post('/:id/circuit-breaker/reset', asyncHandler(async function(req, res) {
  var nodeId = parseIntParam(req.params.id);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungültige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  CircuitBreaker.reset(nodeId);
  apiResponse(res, 200, {
    success: true,
    message: 'Circuit breaker für ' + node.name + ' zurückgesetzt',
    node_id: nodeId,
    node_name: node.name
  });
}));

// Get circuit breaker status for a node
router.get('/:id/circuit-breaker', asyncHandler(async function(req, res) {
  var nodeId = parseIntParam(req.params.id);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungültige Node-ID' });
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  var allStates = CircuitBreaker.getAllStates();
  var state = allStates.find(function(s) { return s.nodeId === nodeId; });

  apiResponse(res, 200, {
    node_id: nodeId,
    node_name: node.name,
    circuit_breaker: state || {
      state: 'closed',
      failures: 0,
      lastFailure: null,
      timeSinceFailureSec: null
    }
  });
}));

module.exports = router;

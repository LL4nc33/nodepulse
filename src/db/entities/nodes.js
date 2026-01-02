'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

// Safe columns for API responses (excludes credentials)
const NODE_SAFE_COLUMNS = `
  n.id, n.name, n.host, n.ssh_port, n.ssh_user,
  n.node_type, n.node_type_locked, n.auto_discovery,
  n.monitoring_enabled, n.monitoring_interval,
  n.online, n.last_seen, n.last_error, n.notes,
  n.parent_id, n.auto_discovered_from,
  n.guest_vmid, n.guest_type, n.guest_ip,
  (n.ssh_password IS NOT NULL AND n.ssh_password != '') as has_ssh_password,
  (n.ssh_key_path IS NOT NULL AND n.ssh_key_path != '') as has_ssh_key,
  n.created_at, n.updated_at
`;

const nodes = {
  /**
   * Get all nodes (safe - no credentials)
   */
  getAll() {
    const stmt = getDb().prepare(`
      SELECT ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      GROUP BY n.id
      ORDER BY n.name
    `);
    return stmt.all();
  },

  /**
   * Get a single node by ID (safe - no credentials)
   */
  getById(id) {
    const stmt = getDb().prepare(`
      SELECT ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.id = ?
      GROUP BY n.id
    `);
    return stmt.get(id);
  },

  /**
   * Get a single node by ID WITH credentials (internal use only!)
   * Use this ONLY for SSH connections, never for API responses
   */
  getByIdWithCredentials(id) {
    const stmt = getDb().prepare(`
      SELECT n.*,
        GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.id = ?
      GROUP BY n.id
    `);
    return stmt.get(id);
  },

  /**
   * Get a single node by name (safe - no credentials)
   */
  getByName(name) {
    const stmt = getDb().prepare(`
      SELECT ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.name = ?
      GROUP BY n.id
    `);
    return stmt.get(name);
  },

  /**
   * Create a new node
   */
  create(node) {
    const stmt = getDb().prepare(`
      INSERT INTO nodes (name, host, ssh_port, ssh_user, ssh_password, ssh_key_path, notes, monitoring_interval)
      VALUES (@name, @host, @ssh_port, @ssh_user, @ssh_password, @ssh_key_path, @notes, @monitoring_interval)
    `);
    const result = stmt.run({
      name: node.name,
      host: node.host,
      ssh_port: node.ssh_port || 22,
      ssh_user: node.ssh_user,
      ssh_password: node.ssh_password || null,
      ssh_key_path: node.ssh_key_path || null,
      notes: node.notes || null,
      monitoring_interval: node.monitoring_interval || 30,
    });
    return result.lastInsertRowid;
  },

  /**
   * Update an existing node
   */
  update(id, node) {
    // Build dynamic update query - only update ssh_password if provided
    const fields = [
      'name = @name',
      'host = @host',
      'ssh_port = @ssh_port',
      'ssh_user = @ssh_user',
      'ssh_key_path = @ssh_key_path',
      'notes = @notes',
      'monitoring_enabled = @monitoring_enabled',
      'monitoring_interval = @monitoring_interval',
    ];

    const params = {
      id,
      name: node.name,
      host: node.host,
      ssh_port: node.ssh_port || 22,
      ssh_user: node.ssh_user,
      ssh_key_path: node.ssh_key_path || null,
      notes: node.notes || null,
      monitoring_enabled: node.monitoring_enabled !== undefined ? node.monitoring_enabled : 1,
      monitoring_interval: node.monitoring_interval || 30,
    };

    // Only update password if explicitly provided
    if (node.ssh_password !== undefined) {
      fields.push('ssh_password = @ssh_password');
      params.ssh_password = node.ssh_password;
    }

    const stmt = getDb().prepare(`
      UPDATE nodes SET ${fields.join(', ')} WHERE id = @id
    `);
    return stmt.run(params);
  },

  /**
   * Delete a node
   */
  delete(id) {
    const stmt = getDb().prepare('DELETE FROM nodes WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Update node online status
   */
  setOnline(id, online, error = null) {
    const stmt = getDb().prepare(`
      UPDATE nodes SET
        online = ?,
        last_seen = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_seen END,
        last_error = ?
      WHERE id = ?
    `);
    return stmt.run(online ? 1 : 0, online ? 1 : 0, error, id);
  },

  /**
   * Update node type
   */
  setNodeType(id, nodeType) {
    const stmt = getDb().prepare(`
      UPDATE nodes SET node_type = ? WHERE id = ? AND node_type_locked = 0
    `);
    return stmt.run(nodeType, id);
  },

  /**
   * Update guest IP for child nodes (VMs/LXCs)
   * Sets the real IP address of the guest for display purposes
   * @param {number} id - Node ID
   * @param {string} guestIp - IP address of the VM/LXC
   */
  setGuestIp(id, guestIp) {
    const stmt = getDb().prepare('UPDATE nodes SET guest_ip = ? WHERE id = ?');
    return stmt.run(guestIp, id);
  },

  // =====================================================
  // Node Hierarchy Methods
  // =====================================================

  /**
   * Get all nodes with hierarchy info (safe - no credentials)
   * Returns nodes with parent info and child count
   */
  getAllWithHierarchy() {
    const stmt = getDb().prepare(`
      SELECT ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(DISTINCT t.name) as tags,
        p.name as parent_name,
        (SELECT COUNT(*) FROM nodes c WHERE c.parent_id = n.id) as child_count
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      LEFT JOIN nodes p ON n.parent_id = p.id
      GROUP BY n.id
      ORDER BY COALESCE(n.parent_id, n.id), n.parent_id IS NOT NULL, n.name
    `);
    return stmt.all();
  },

  /**
   * Get root nodes only (nodes without parent)
   */
  getRootNodes() {
    const stmt = getDb().prepare(`
      SELECT ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(t.name) as tags,
        (SELECT COUNT(*) FROM nodes c WHERE c.parent_id = n.id) as child_count
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.parent_id IS NULL
      GROUP BY n.id
      ORDER BY n.name
    `);
    return stmt.all();
  },

  /**
   * Get children of a node
   */
  getChildren(parentId) {
    const stmt = getDb().prepare(`
      SELECT ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(t.name) as tags,
        (SELECT COUNT(*) FROM nodes c WHERE c.parent_id = n.id) as child_count
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.parent_id = ?
      GROUP BY n.id
      ORDER BY n.name
    `);
    return stmt.all(parentId);
  },

  /**
   * Get a node with all its children (one level deep)
   */
  getWithChildren(id) {
    const node = this.getById(id);
    if (!node) return null;
    node.children = this.getChildren(id);
    return node;
  },

  /**
   * Set parent for a node
   */
  setParent(id, parentId) {
    const stmt = getDb().prepare(`
      UPDATE nodes SET parent_id = ? WHERE id = ?
    `);
    return stmt.run(parentId, id);
  },

  /**
   * Set auto_discovered_from for a node
   */
  setAutoDiscoveredFrom(id, discoveredFromId) {
    const stmt = getDb().prepare(`
      UPDATE nodes SET auto_discovered_from = ? WHERE id = ?
    `);
    return stmt.run(discoveredFromId, id);
  },

  /**
   * Get nodes that were auto-discovered from a specific host
   */
  getAutoDiscoveredFrom(hostNodeId) {
    const stmt = getDb().prepare(`
      SELECT ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.auto_discovered_from = ?
      GROUP BY n.id
      ORDER BY n.name
    `);
    return stmt.all(hostNodeId);
  },

  /**
   * Build full hierarchy tree (recursive)
   * Returns nodes structured as a tree
   */
  getHierarchyTree() {
    const allNodes = this.getAllWithHierarchy();
    const nodeMap = new Map();
    const roots = [];

    // First pass: create map
    for (const node of allNodes) {
      node.children = [];
      nodeMap.set(node.id, node);
    }

    // Second pass: build tree
    for (const node of allNodes) {
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  },

  // =====================================================
  // Auto-Discovery Child Node Methods
  // =====================================================

  /**
   * Get a child node by guest ID (VM/LXC ID on Proxmox host)
   * Used to check if a VM/LXC is already registered as a child node
   * @param {number} parentId - Parent node ID (Proxmox host)
   * @param {number} vmid - VM/CT ID on Proxmox (100-999999)
   * @param {string} type - 'vm' or 'lxc'
   * @returns {Object|null} Node or null if not found
   */
  getByGuestId(parentId, vmid, type) {
    const stmt = getDb().prepare(`
      SELECT ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE (n.auto_discovered_from = ? OR n.parent_id = ?)
        AND n.guest_vmid = ?
        AND n.guest_type = ?
      GROUP BY n.id
    `);
    return stmt.get(parentId, parentId, vmid, type);
  },

  /**
   * Create a child node from Proxmox VM/LXC data
   * Used by DiscoveryOrchestrator to auto-create child nodes
   * @param {number} parentId - Parent node ID (Proxmox host)
   * @param {Object} data - Guest data
   * @param {string} data.name - VM/LXC name
   * @param {number} data.guest_vmid - VM/CT ID (100-999999)
   * @param {string} data.guest_type - 'vm' or 'lxc'
   * @param {string} data.guest_ip - Guest IP address (optional)
   * @param {string} data.node_type - 'proxmox-vm' or 'proxmox-lxc'
   * @returns {number} New node ID
   */
  createChildFromProxmox(parentId, data) {
    const stmt = getDb().prepare(`
      INSERT INTO nodes (
        name, host, ssh_port, ssh_user,
        parent_id, auto_discovered_from,
        guest_vmid, guest_type, guest_ip, node_type,
        monitoring_enabled, auto_discovery
      ) VALUES (
        @name, @host, @ssh_port, @ssh_user,
        @parent_id, @auto_discovered_from,
        @guest_vmid, @guest_type, @guest_ip, @node_type,
        @monitoring_enabled, @auto_discovery
      )
    `);

    // Get parent node for host info
    const parent = this.getById(parentId);
    const hostName = parent ? parent.host : 'localhost';

    const result = stmt.run({
      name: data.name,
      host: hostName,  // Same host as parent (commands go via parent)
      ssh_port: 22,
      ssh_user: 'root',
      parent_id: parentId,
      auto_discovered_from: parentId,
      guest_vmid: data.guest_vmid,
      guest_type: data.guest_type,
      guest_ip: data.guest_ip || null,
      node_type: data.node_type || (data.guest_type === 'vm' ? 'proxmox-vm' : 'proxmox-lxc'),
      monitoring_enabled: 1,
      auto_discovery: 1
    });

    return result.lastInsertRowid;
  },

  /**
   * Update child node status from Proxmox data
   * @param {number} nodeId - Child node ID
   * @param {string} status - 'running', 'stopped', etc.
   */
  updateChildStatus(nodeId, status) {
    const online = status === 'running' ? 1 : 0;
    const stmt = getDb().prepare(`
      UPDATE nodes SET
        online = ?,
        last_seen = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_seen END
      WHERE id = ?
    `);
    return stmt.run(online, online, nodeId);
  },

  /**
   * Get all child nodes that were auto-discovered from a host
   * but no longer exist in Proxmox (orphaned)
   * @param {number} parentId - Parent node ID
   * @param {Array} currentVmids - List of current VMIDs from Proxmox
   * @param {string} type - 'vm' or 'lxc'
   * @returns {Array} Orphaned child nodes
   */
  getOrphanedChildren(parentId, currentVmids, type) {
    const placeholders = currentVmids.length > 0
      ? currentVmids.map(function() { return '?'; }).join(',')
      : '-1';  // No valid VMIDs means all are orphaned

    const sql = `
      SELECT id, name, guest_vmid FROM nodes
      WHERE auto_discovered_from = ?
        AND guest_type = ?
        AND guest_vmid NOT IN (${placeholders})
    `;

    const stmt = getDb().prepare(sql);
    const params = [parentId, type].concat(currentVmids);
    return stmt.all.apply(stmt, params);
  },
};

module.exports = { init, nodes };

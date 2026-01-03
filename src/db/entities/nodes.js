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
      host: data.guest_ip || hostName,  // Use guest IP for display/network tools, fallback to parent
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

  /**
   * Get a node with all core related data in a single query
   * Combines: node, discovery, hardware, currentStats, health
   * Reduces 5 queries to 1 for the detail page
   * @param {number} id - Node ID
   * @returns {Object|null} Object with node and related data
   */
  getByIdWithCoreData(id) {
    const stmt = getDb().prepare(`
      SELECT
        ${NODE_SAFE_COLUMNS},
        GROUP_CONCAT(DISTINCT t.name) as tags,
        -- Discovery data
        d.virtualization, d.is_proxmox_host, d.proxmox_version,
        d.is_proxmox_cluster, d.cluster_name, d.cluster_nodes,
        d.has_docker, d.docker_version, d.hostname,
        d.os_name, d.os_version, d.kernel, d.architecture,
        d.discovered_at,
        -- Hardware data
        hw.cpu_model, hw.cpu_cores, hw.cpu_threads,
        hw.mem_total_mb, hw.swap_total_mb,
        hw.disk_total_gb, hw.disk_used_gb, hw.disks_json,
        hw.detected_at as hw_detected_at,
        -- Current stats
        s.cpu_percent, s.mem_percent, s.swap_percent, s.disk_percent,
        s.disk_read_mb, s.disk_write_mb, s.net_rx_mb, s.net_tx_mb,
        s.load_1, s.load_5, s.load_15,
        s.processes_running, s.processes_total,
        s.updated_at as stats_updated_at,
        -- Health data
        hl.kernel_version, hl.last_boot, hl.uptime_seconds, hl.reboot_required,
        hl.cpu_temp, hl.cpu_temp_status,
        hl.health_score, hl.health_status, hl.health_issues,
        hl.apt_updates, hl.apt_security, hl.apt_status, hl.apt_packages_json,
        hl.failed_services, hl.failed_services_list,
        hl.checked_at as health_checked_at
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      LEFT JOIN node_discovery d ON n.id = d.node_id
      LEFT JOIN node_hardware hw ON n.id = hw.node_id
      LEFT JOIN node_stats_current s ON n.id = s.node_id
      LEFT JOIN node_health hl ON n.id = hl.node_id
      WHERE n.id = ?
      GROUP BY n.id
    `);

    const row = stmt.get(id);
    if (!row) return null;

    // Extract node data (columns from NODE_SAFE_COLUMNS + tags)
    const node = {
      id: row.id,
      name: row.name,
      host: row.host,
      ssh_port: row.ssh_port,
      ssh_user: row.ssh_user,
      node_type: row.node_type,
      node_type_locked: row.node_type_locked,
      auto_discovery: row.auto_discovery,
      monitoring_enabled: row.monitoring_enabled,
      monitoring_interval: row.monitoring_interval,
      online: row.online,
      last_seen: row.last_seen,
      last_error: row.last_error,
      notes: row.notes,
      parent_id: row.parent_id,
      auto_discovered_from: row.auto_discovered_from,
      guest_vmid: row.guest_vmid,
      guest_type: row.guest_type,
      guest_ip: row.guest_ip,
      has_ssh_password: row.has_ssh_password,
      has_ssh_key: row.has_ssh_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
      tags: row.tags
    };

    // Extract discovery data (only if exists)
    const discovery = row.discovered_at ? {
      node_id: id,
      virtualization: row.virtualization,
      is_proxmox_host: row.is_proxmox_host,
      proxmox_version: row.proxmox_version,
      is_proxmox_cluster: row.is_proxmox_cluster,
      cluster_name: row.cluster_name,
      cluster_nodes: row.cluster_nodes,
      has_docker: row.has_docker,
      docker_version: row.docker_version,
      hostname: row.hostname,
      os_name: row.os_name,
      os_version: row.os_version,
      kernel: row.kernel,
      architecture: row.architecture,
      discovered_at: row.discovered_at
    } : null;

    // Extract hardware data (only if exists)
    const hardware = row.hw_detected_at ? {
      node_id: id,
      cpu_model: row.cpu_model,
      cpu_cores: row.cpu_cores,
      cpu_threads: row.cpu_threads,
      mem_total_mb: row.mem_total_mb,
      swap_total_mb: row.swap_total_mb,
      disk_total_gb: row.disk_total_gb,
      disk_used_gb: row.disk_used_gb,
      disks_json: row.disks_json,
      detected_at: row.hw_detected_at
    } : null;

    // Extract current stats (only if exists)
    const currentStats = row.stats_updated_at ? {
      node_id: id,
      cpu_percent: row.cpu_percent,
      mem_percent: row.mem_percent,
      swap_percent: row.swap_percent,
      disk_percent: row.disk_percent,
      disk_read_mb: row.disk_read_mb,
      disk_write_mb: row.disk_write_mb,
      net_rx_mb: row.net_rx_mb,
      net_tx_mb: row.net_tx_mb,
      load_1: row.load_1,
      load_5: row.load_5,
      load_15: row.load_15,
      processes_running: row.processes_running,
      processes_total: row.processes_total,
      updated_at: row.stats_updated_at
    } : null;

    // Extract health data (only if exists)
    const health = row.health_checked_at ? {
      node_id: id,
      kernel_version: row.kernel_version,
      last_boot: row.last_boot,
      uptime_seconds: row.uptime_seconds,
      reboot_required: row.reboot_required,
      cpu_temp: row.cpu_temp,
      cpu_temp_status: row.cpu_temp_status,
      health_score: row.health_score,
      health_status: row.health_status,
      health_issues: row.health_issues,
      apt_updates: row.apt_updates,
      apt_security: row.apt_security,
      apt_status: row.apt_status,
      apt_packages_json: row.apt_packages_json,
      failed_services: row.failed_services,
      failed_services_list: row.failed_services_list,
      checked_at: row.health_checked_at
    } : null;

    return { node, discovery, hardware, currentStats, health };
  },
};

module.exports = { init, nodes };

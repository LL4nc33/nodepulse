const SqlJsWrapper = require('./sqljs-wrapper');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
let initPromise = null;

/**
 * Initialize the database connection and create tables if needed
 * @returns {Promise<SqlJsWrapper>}
 */
async function init() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Create wrapper and initialize
    const wrapper = new SqlJsWrapper();
    db = await wrapper.init(config.dbPath);

    // Enable foreign keys (WAL mode ignored by wrapper - not needed for in-memory)
    db.pragma('foreign_keys = ON');

    // Run schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    // Migration: Add ssh_password column if it doesn't exist
    try {
      const columns = db.prepare("PRAGMA table_info(nodes)").all();
      const hasPassword = columns.some(col => col.name === 'ssh_password');
      if (!hasPassword) {
        db.exec('ALTER TABLE nodes ADD COLUMN ssh_password TEXT');
        console.log('[DB] Migration: Added ssh_password column');
      }
    } catch (err) {
      console.error('[DB] Migration error:', err.message);
      throw err;  // Re-throw to prevent app start with incomplete schema
    }

    // Migration: Add parent_id and auto_discovered_from columns for Node Hierarchy
    try {
      const columns = db.prepare("PRAGMA table_info(nodes)").all();
      const hasParentId = columns.some(col => col.name === 'parent_id');
      const hasAutoDiscovered = columns.some(col => col.name === 'auto_discovered_from');

      if (!hasParentId) {
        db.exec('ALTER TABLE nodes ADD COLUMN parent_id INTEGER REFERENCES nodes(id)');
        console.log('[DB] Migration: Added parent_id column');
      }
      if (!hasAutoDiscovered) {
        db.exec('ALTER TABLE nodes ADD COLUMN auto_discovered_from INTEGER REFERENCES nodes(id)');
        console.log('[DB] Migration: Added auto_discovered_from column');
      }
    } catch (err) {
      console.error('[DB] Migration error (hierarchy):', err.message);
      throw err;  // Re-throw to prevent app start with incomplete schema
    }

    // Migration: Add thermal_json column to node_hardware
    try {
      const columns = db.prepare("PRAGMA table_info(node_hardware)").all();
      const hasThermal = columns.some(col => col.name === 'thermal_json');
      if (!hasThermal) {
        db.exec('ALTER TABLE node_hardware ADD COLUMN thermal_json TEXT');
        console.log('[DB] Migration: Added thermal_json column');
      }
    } catch (err) {
      console.error('[DB] Migration error (thermal):', err.message);
      throw err;
    }

    // Migration: Add power_json column to node_hardware
    try {
      const columns = db.prepare("PRAGMA table_info(node_hardware)").all();
      const hasPower = columns.some(col => col.name === 'power_json');
      if (!hasPower) {
        db.exec('ALTER TABLE node_hardware ADD COLUMN power_json TEXT');
        console.log('[DB] Migration: Added power_json column');
      }
    } catch (err) {
      console.error('[DB] Migration error (power):', err.message);
      throw err;
    }

    // Migration: Create node_health table if not exists
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS node_health (
          node_id INTEGER PRIMARY KEY,
          kernel_version TEXT,
          last_boot TEXT,
          uptime_seconds INTEGER,
          reboot_required INTEGER DEFAULT 0,
          apt_updates INTEGER DEFAULT 0,
          apt_security INTEGER DEFAULT 0,
          apt_packages_json TEXT,
          pve_version TEXT,
          pve_repo TEXT,
          docker_images INTEGER DEFAULT 0,
          npm_outdated INTEGER DEFAULT 0,
          apt_cache_free_mb INTEGER DEFAULT 0,
          checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
      `);
    } catch (err) {
      console.error('[DB] Migration error (health):', err.message);
      throw err;
    }

    // Migration 7: Tiered Polling Timestamps + Capabilities
    try {
      const statsCols = db.prepare("PRAGMA table_info(node_stats_current)").all();
      const hasTier1 = statsCols.some(col => col.name === 'tier1_last_update');
      const hasTier2 = statsCols.some(col => col.name === 'tier2_last_update');

      if (!hasTier1) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN tier1_last_update INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added tier1_last_update column to node_stats_current');
      }
      if (!hasTier2) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN tier2_last_update INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added tier2_last_update column to node_stats_current');
      }

      const hardwareCols = db.prepare("PRAGMA table_info(node_hardware)").all();
      const hasTier3 = hardwareCols.some(col => col.name === 'tier3_last_update');
      if (!hasTier3) {
        db.exec('ALTER TABLE node_hardware ADD COLUMN tier3_last_update INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added tier3_last_update column to node_hardware');
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS node_capabilities (
          node_id INTEGER PRIMARY KEY,
          capabilities_json TEXT NOT NULL,
          last_detected_at INTEGER NOT NULL,
          FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
      `);
      console.log('[DB] Migration: Created node_capabilities table');
    } catch (err) {
      console.error('[DB] Migration error (tiered timestamps):', err.message);
      throw err;
    }

    // Migration 8: VMs/Container Counts for TOON Format
    // Store counts in node_stats_current instead of SubQuery (30-50% performance gain)
    try {
      const statsCols = db.prepare("PRAGMA table_info(node_stats_current)").all();
      const hasVMs = statsCols.some(col => col.name === 'vms_running');
      const hasCTs = statsCols.some(col => col.name === 'cts_running');
      const hasContainers = statsCols.some(col => col.name === 'containers_running');

      if (!hasVMs) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN vms_running INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added vms_running column to node_stats_current');
      }
      if (!hasCTs) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN cts_running INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added cts_running column to node_stats_current');
      }
      if (!hasContainers) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN containers_running INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added containers_running column to node_stats_current');
      }

      // Backfill NULL → 0 for consistency
      if (!hasVMs || !hasCTs || !hasContainers) {
        db.exec(`
          UPDATE node_stats_current
          SET vms_running = COALESCE(vms_running, 0),
              cts_running = COALESCE(cts_running, 0),
              containers_running = COALESCE(containers_running, 0)
          WHERE vms_running IS NULL OR cts_running IS NULL OR containers_running IS NULL
        `);
        console.log('[DB] Migration: Backfilled NULL → 0 for VM/Container counts');
      }
    } catch (err) {
      console.error('[DB] Migration error (vm/container counts):', err.message);
      throw err;
    }

    // Run seed data
    const seedPath = path.join(__dirname, 'seed.sql');
    const seed = fs.readFileSync(seedPath, 'utf8');
    db.exec(seed);

    console.log('[DB] Database initialized at', config.dbPath);

    return db;
  })();

  return initPromise;
}

/**
 * Get the database instance (sync after init)
 * @returns {SqlJsWrapper}
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call await init() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
function close() {
  if (db) {
    db.close();
    db = null;
    initPromise = null;
    console.log('[DB] Database connection closed');
  }
}

// =====================================================
// Node Operations
// =====================================================

// Safe columns for API responses (excludes credentials)
const NODE_SAFE_COLUMNS = `
  n.id, n.name, n.host, n.ssh_port, n.ssh_user,
  n.node_type, n.node_type_locked, n.auto_discovery,
  n.monitoring_enabled, n.monitoring_interval,
  n.online, n.last_seen, n.last_error, n.notes,
  n.parent_id, n.auto_discovered_from,
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
};

// =====================================================
// Tag Operations
// =====================================================

const tags = {
  /**
   * Get all tags
   */
  getAll() {
    const stmt = getDb().prepare('SELECT * FROM tags ORDER BY tag_type, name');
    return stmt.all();
  },

  /**
   * Get tags for a node
   */
  getForNode(nodeId) {
    const stmt = getDb().prepare(`
      SELECT t.* FROM tags t
      JOIN node_tags nt ON t.id = nt.tag_id
      WHERE nt.node_id = ?
      ORDER BY t.name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Add a tag to a node
   */
  addToNode(nodeId, tagId) {
    const stmt = getDb().prepare(`
      INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)
    `);
    return stmt.run(nodeId, tagId);
  },

  /**
   * Remove a tag from a node
   */
  removeFromNode(nodeId, tagId) {
    const stmt = getDb().prepare(`
      DELETE FROM node_tags WHERE node_id = ? AND tag_id = ?
    `);
    return stmt.run(nodeId, tagId);
  },

  /**
   * Get tag by name
   */
  getByName(name) {
    const stmt = getDb().prepare('SELECT * FROM tags WHERE name = ?');
    return stmt.get(name);
  },

  /**
   * Create a user tag
   */
  create(tag) {
    const stmt = getDb().prepare(`
      INSERT INTO tags (name, tag_type, color, description)
      VALUES (@name, 'user', @color, @description)
    `);
    const result = stmt.run({
      name: tag.name,
      color: tag.color || '#718096',
      description: tag.description || null,
    });
    return result.lastInsertRowid;
  },
};

// =====================================================
// Settings Operations
// =====================================================

// Settings Cache für Performance (RPi 2B Optimierung)
let settingsCache = null;

const settings = {
  /**
   * Load all settings into cache
   * @private
   */
  _loadCache() {
    const stmt = getDb().prepare('SELECT * FROM settings');
    const rows = stmt.all();
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    settingsCache = result;
    return result;
  },

  /**
   * Invalidate cache (call after set())
   * @private
   */
  _invalidateCache() {
    settingsCache = null;
  },

  /**
   * Get a setting value (cached)
   */
  get(key, defaultValue = null) {
    if (!settingsCache) {
      this._loadCache();
    }
    return settingsCache[key] !== undefined ? settingsCache[key] : defaultValue;
  },

  /**
   * Set a setting value (invalidates cache)
   */
  set(key, value) {
    const stmt = getDb().prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const result = stmt.run(key, value);
    this._invalidateCache();
    return result;
  },

  /**
   * Get all settings (cached)
   */
  getAll() {
    if (!settingsCache) {
      this._loadCache();
    }
    // Return shallow copy to prevent external modifications
    return Object.assign({}, settingsCache);
  },
};

// =====================================================
// Discovery Operations
// =====================================================

const discovery = {
  /**
   * Get discovery data for a node
   */
  getForNode(nodeId) {
    const stmt = getDb().prepare('SELECT * FROM node_discovery WHERE node_id = ?');
    return stmt.get(nodeId);
  },

  /**
   * Save or update discovery data for a node
   */
  save(nodeId, data) {
    const stmt = getDb().prepare(`
      INSERT INTO node_discovery (
        node_id, raw_json, virtualization,
        is_proxmox_host, proxmox_version, is_proxmox_cluster,
        proxmox_cluster_name, proxmox_cluster_nodes,
        has_docker, docker_version, docker_containers,
        has_podman, podman_version,
        is_raspberry_pi, raspberry_pi_model,
        arch, os_id, os_name, hostname, has_systemd,
        discovered_at
      ) VALUES (
        @node_id, @raw_json, @virtualization,
        @is_proxmox_host, @proxmox_version, @is_proxmox_cluster,
        @proxmox_cluster_name, @proxmox_cluster_nodes,
        @has_docker, @docker_version, @docker_containers,
        @has_podman, @podman_version,
        @is_raspberry_pi, @raspberry_pi_model,
        @arch, @os_id, @os_name, @hostname, @has_systemd,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(node_id) DO UPDATE SET
        raw_json = excluded.raw_json,
        virtualization = excluded.virtualization,
        is_proxmox_host = excluded.is_proxmox_host,
        proxmox_version = excluded.proxmox_version,
        is_proxmox_cluster = excluded.is_proxmox_cluster,
        proxmox_cluster_name = excluded.proxmox_cluster_name,
        proxmox_cluster_nodes = excluded.proxmox_cluster_nodes,
        has_docker = excluded.has_docker,
        docker_version = excluded.docker_version,
        docker_containers = excluded.docker_containers,
        has_podman = excluded.has_podman,
        podman_version = excluded.podman_version,
        is_raspberry_pi = excluded.is_raspberry_pi,
        raspberry_pi_model = excluded.raspberry_pi_model,
        arch = excluded.arch,
        os_id = excluded.os_id,
        os_name = excluded.os_name,
        hostname = excluded.hostname,
        has_systemd = excluded.has_systemd,
        discovered_at = CURRENT_TIMESTAMP
    `);

    return stmt.run({
      node_id: nodeId,
      raw_json: JSON.stringify(data),
      virtualization: data.virtualization || null,
      is_proxmox_host: data.is_proxmox_host ? 1 : 0,
      proxmox_version: data.proxmox_version || null,
      is_proxmox_cluster: data.is_proxmox_cluster ? 1 : 0,
      proxmox_cluster_name: data.proxmox_cluster_name || null,
      proxmox_cluster_nodes: data.proxmox_cluster_nodes || null,
      has_docker: data.has_docker ? 1 : 0,
      docker_version: data.docker_version || null,
      docker_containers: data.docker_containers || 0,
      has_podman: data.has_podman ? 1 : 0,
      podman_version: data.podman_version || null,
      is_raspberry_pi: data.is_raspberry_pi ? 1 : 0,
      raspberry_pi_model: data.raspberry_pi_model || null,
      arch: data.arch || null,
      os_id: data.os_id || null,
      os_name: data.os_name || null,
      hostname: data.hostname || null,
      has_systemd: data.has_systemd ? 1 : 0,
    });
  },

  /**
   * Delete discovery data for a node
   */
  delete(nodeId) {
    const stmt = getDb().prepare('DELETE FROM node_discovery WHERE node_id = ?');
    return stmt.run(nodeId);
  },
};

// =====================================================
// Hardware Operations
// =====================================================

const hardware = {
  /**
   * Get hardware data for a node
   */
  getForNode(nodeId) {
    const stmt = getDb().prepare('SELECT * FROM node_hardware WHERE node_id = ?');
    return stmt.get(nodeId);
  },

  /**
   * Save or update hardware data for a node
   */
  save(nodeId, data) {
    const stmt = getDb().prepare(`
      INSERT INTO node_hardware (
        node_id,
        system_manufacturer, system_product, system_serial, bios_version, boot_mode,
        cpu_model, cpu_vendor, cpu_cores, cpu_threads, cpu_max_mhz, cpu_arch,
        cpu_cache_l1, cpu_cache_l2, cpu_cache_l3, cpu_virt_support,
        ram_total_bytes, ram_type, ram_speed_mhz, swap_total_bytes,
        disks_json, network_json, gpu_json, thermal_json, power_json,
        updated_at
      ) VALUES (
        @node_id,
        @system_manufacturer, @system_product, @system_serial, @bios_version, @boot_mode,
        @cpu_model, @cpu_vendor, @cpu_cores, @cpu_threads, @cpu_max_mhz, @cpu_arch,
        @cpu_cache_l1, @cpu_cache_l2, @cpu_cache_l3, @cpu_virt_support,
        @ram_total_bytes, @ram_type, @ram_speed_mhz, @swap_total_bytes,
        @disks_json, @network_json, @gpu_json, @thermal_json, @power_json,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(node_id) DO UPDATE SET
        system_manufacturer = excluded.system_manufacturer,
        system_product = excluded.system_product,
        system_serial = excluded.system_serial,
        bios_version = excluded.bios_version,
        boot_mode = excluded.boot_mode,
        cpu_model = excluded.cpu_model,
        cpu_vendor = excluded.cpu_vendor,
        cpu_cores = excluded.cpu_cores,
        cpu_threads = excluded.cpu_threads,
        cpu_max_mhz = excluded.cpu_max_mhz,
        cpu_arch = excluded.cpu_arch,
        cpu_cache_l1 = excluded.cpu_cache_l1,
        cpu_cache_l2 = excluded.cpu_cache_l2,
        cpu_cache_l3 = excluded.cpu_cache_l3,
        cpu_virt_support = excluded.cpu_virt_support,
        ram_total_bytes = excluded.ram_total_bytes,
        ram_type = excluded.ram_type,
        ram_speed_mhz = excluded.ram_speed_mhz,
        swap_total_bytes = excluded.swap_total_bytes,
        disks_json = excluded.disks_json,
        network_json = excluded.network_json,
        gpu_json = excluded.gpu_json,
        thermal_json = excluded.thermal_json,
        power_json = excluded.power_json,
        updated_at = CURRENT_TIMESTAMP
    `);

    const system = data.system || {};
    const cpu = data.cpu || {};
    const memory = data.memory || {};

    return stmt.run({
      node_id: nodeId,
      system_manufacturer: system.manufacturer || null,
      system_product: system.product || null,
      system_serial: system.serial || null,
      bios_version: system.bios_version || null,
      boot_mode: system.boot_mode || null,
      cpu_model: cpu.model || null,
      cpu_vendor: cpu.vendor || null,
      cpu_cores: cpu.cores || null,
      cpu_threads: cpu.threads || null,
      cpu_max_mhz: cpu.max_mhz || null,
      cpu_arch: cpu.arch || null,
      cpu_cache_l1: cpu.cache_l1 || null,
      cpu_cache_l2: cpu.cache_l2 || null,
      cpu_cache_l3: cpu.cache_l3 || null,
      cpu_virt_support: cpu.virt_support || null,
      ram_total_bytes: memory.total_bytes || null,
      ram_type: memory.type || null,
      ram_speed_mhz: memory.speed_mhz || null,
      swap_total_bytes: memory.swap_total_bytes || null,
      disks_json: JSON.stringify(data.disks || []),
      network_json: JSON.stringify(data.network || []),
      gpu_json: JSON.stringify(data.gpu || []),
      thermal_json: JSON.stringify(data.thermal || []),
      power_json: JSON.stringify(data.power || []),
    });
  },

  /**
   * Delete hardware data for a node
   */
  delete(nodeId) {
    const stmt = getDb().prepare('DELETE FROM node_hardware WHERE node_id = ?');
    return stmt.run(nodeId);
  },
};

// =====================================================
// Stats Operations
// =====================================================

const stats = {
  /**
   * Get current stats for a node
   */
  getCurrent(nodeId) {
    const stmt = getDb().prepare('SELECT * FROM node_stats_current WHERE node_id = ?');
    return stmt.get(nodeId);
  },

  /**
   * Get current stats for all nodes
   */
  getAllCurrent() {
    const stmt = getDb().prepare(`
      SELECT s.*, n.name as node_name, n.online, n.node_type
      FROM node_stats_current s
      JOIN nodes n ON s.node_id = n.id
      ORDER BY n.name
    `);
    return stmt.all();
  },

  /**
   * Get all nodes with their current stats (including nodes without stats)
   * Extended version with hardware info and VM/container counts
   */
  getAllNodesWithStats() {
    const stmt = getDb().prepare(`
      SELECT
        n.id, n.name, n.host, n.node_type, n.online, n.last_seen,
        n.monitoring_enabled, n.monitoring_interval, n.parent_id,
        s.timestamp, s.cpu_percent, s.load_1m, s.load_5m, s.load_15m,
        s.ram_used_bytes, s.ram_available_bytes, s.ram_percent,
        s.swap_used_bytes, s.disk_used_bytes, s.disk_available_bytes,
        s.disk_percent, s.net_rx_bytes, s.net_tx_bytes,
        s.temp_cpu, s.uptime_seconds, s.processes,
        s.tier1_last_update, s.tier2_last_update,
        s.vms_running, s.cts_running, s.containers_running,
        h.cpu_cores,
        h.ram_total_bytes,
        (s.disk_used_bytes + s.disk_available_bytes) AS disk_total_bytes
      FROM nodes n
      LEFT JOIN node_stats_current s ON n.id = s.node_id
      LEFT JOIN node_hardware h ON n.id = h.node_id
      ORDER BY n.name
    `);
    return stmt.all();
  },

  /**
   * Save or update current stats for a node
   */
  saveCurrent(nodeId, data) {
    const stmt = getDb().prepare(`
      INSERT INTO node_stats_current (
        node_id, timestamp,
        cpu_percent, load_1m, load_5m, load_15m,
        ram_used_bytes, ram_available_bytes, ram_percent, swap_used_bytes,
        disk_used_bytes, disk_available_bytes, disk_percent,
        net_rx_bytes, net_tx_bytes, temp_cpu,
        uptime_seconds, processes,
        vms_running, cts_running, containers_running
      ) VALUES (
        @node_id, @timestamp,
        @cpu_percent, @load_1m, @load_5m, @load_15m,
        @ram_used_bytes, @ram_available_bytes, @ram_percent, @swap_used_bytes,
        @disk_used_bytes, @disk_available_bytes, @disk_percent,
        @net_rx_bytes, @net_tx_bytes, @temp_cpu,
        @uptime_seconds, @processes,
        @vms_running, @cts_running, @containers_running
      )
      ON CONFLICT(node_id) DO UPDATE SET
        timestamp = excluded.timestamp,
        cpu_percent = excluded.cpu_percent,
        load_1m = excluded.load_1m,
        load_5m = excluded.load_5m,
        load_15m = excluded.load_15m,
        ram_used_bytes = excluded.ram_used_bytes,
        ram_available_bytes = excluded.ram_available_bytes,
        ram_percent = excluded.ram_percent,
        swap_used_bytes = excluded.swap_used_bytes,
        disk_used_bytes = excluded.disk_used_bytes,
        disk_available_bytes = excluded.disk_available_bytes,
        disk_percent = excluded.disk_percent,
        net_rx_bytes = excluded.net_rx_bytes,
        net_tx_bytes = excluded.net_tx_bytes,
        temp_cpu = excluded.temp_cpu,
        uptime_seconds = excluded.uptime_seconds,
        processes = excluded.processes,
        vms_running = excluded.vms_running,
        cts_running = excluded.cts_running,
        containers_running = excluded.containers_running
    `);

    return stmt.run({
      node_id: nodeId,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      cpu_percent: data.cpu_percent || 0,
      load_1m: data.load_1m || 0,
      load_5m: data.load_5m || 0,
      load_15m: data.load_15m || 0,
      ram_used_bytes: data.ram_used_bytes || 0,
      ram_available_bytes: data.ram_available_bytes || 0,
      ram_percent: data.ram_percent || 0,
      swap_used_bytes: data.swap_used_bytes || 0,
      disk_used_bytes: data.disk_used_bytes || 0,
      disk_available_bytes: data.disk_available_bytes || 0,
      disk_percent: data.disk_percent || 0,
      net_rx_bytes: data.net_rx_bytes || 0,
      net_tx_bytes: data.net_tx_bytes || 0,
      temp_cpu: data.temp_cpu !== null && data.temp_cpu !== 'null' ? data.temp_cpu : null,
      uptime_seconds: data.uptime_seconds || 0,
      processes: data.processes || 0,
      vms_running: data.vms_running || 0,
      cts_running: data.cts_running || 0,
      containers_running: data.containers_running || 0,
    });
  },

  /**
   * Save stats to history
   */
  saveHistory(nodeId, data) {
    const stmt = getDb().prepare(`
      INSERT INTO node_stats_history (
        node_id, timestamp,
        cpu_percent, load_1m, ram_percent, ram_used_bytes,
        swap_used_bytes, disk_percent,
        net_rx_bytes, net_tx_bytes, temp_cpu
      ) VALUES (
        @node_id, @timestamp,
        @cpu_percent, @load_1m, @ram_percent, @ram_used_bytes,
        @swap_used_bytes, @disk_percent,
        @net_rx_bytes, @net_tx_bytes, @temp_cpu
      )
    `);

    return stmt.run({
      node_id: nodeId,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      cpu_percent: data.cpu_percent || 0,
      load_1m: data.load_1m || 0,
      ram_percent: data.ram_percent || 0,
      ram_used_bytes: data.ram_used_bytes || 0,
      swap_used_bytes: data.swap_used_bytes || 0,
      disk_percent: data.disk_percent || 0,
      net_rx_bytes: data.net_rx_bytes || 0,
      net_tx_bytes: data.net_tx_bytes || 0,
      temp_cpu: data.temp_cpu !== null && data.temp_cpu !== 'null' ? data.temp_cpu : null,
    });
  },

  /**
   * Get history for a node (last X hours)
   */
  getHistory(nodeId, hours = 24) {
    const cutoff = Math.floor(Date.now() / 1000) - (hours * 3600);
    const stmt = getDb().prepare(`
      SELECT * FROM node_stats_history
      WHERE node_id = ? AND timestamp > ?
      ORDER BY timestamp ASC
    `);
    return stmt.all(nodeId, cutoff);
  },

  /**
   * Delete old history entries
   */
  cleanupHistory(retentionHours = 168) {
    const cutoff = Math.floor(Date.now() / 1000) - (retentionHours * 3600);
    const stmt = getDb().prepare('DELETE FROM node_stats_history WHERE timestamp < ?');
    return stmt.run(cutoff);
  },

  /**
   * Delete stats for a node
   */
  deleteForNode(nodeId) {
    const stmt1 = getDb().prepare('DELETE FROM node_stats_current WHERE node_id = ?');
    const stmt2 = getDb().prepare('DELETE FROM node_stats_history WHERE node_id = ?');
    stmt1.run(nodeId);
    stmt2.run(nodeId);
  },
};

// =====================================================
// Alerts Operations
// =====================================================

const alerts = {
  /**
   * Create a new alert
   */
  create(nodeId, alertType, alertLevel, value, threshold, message) {
    const stmt = getDb().prepare(`
      INSERT INTO alerts_history (node_id, alert_type, alert_level, value, threshold, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Math.floor(Date.now() / 1000);
    const result = stmt.run(nodeId, alertType, alertLevel, value, threshold, message, now);
    return result.lastInsertRowid;
  },

  /**
   * Get all alerts (with optional filters)
   * @param {Object} options - { nodeId, active, limit, offset }
   */
  getAll(options = {}) {
    let sql = `
      SELECT a.*, n.name as node_name, n.host as node_host
      FROM alerts_history a
      LEFT JOIN nodes n ON a.node_id = n.id
      WHERE 1=1
    `;
    const params = [];

    if (options.nodeId) {
      sql += ' AND a.node_id = ?';
      params.push(options.nodeId);
    }

    if (options.active === true) {
      sql += ' AND a.resolved_at IS NULL';
    } else if (options.active === false) {
      sql += ' AND a.resolved_at IS NOT NULL';
    }

    if (options.level) {
      sql += ' AND a.alert_level = ?';
      params.push(options.level);
    }

    sql += ' ORDER BY a.created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const stmt = getDb().prepare(sql);
    return stmt.all(...params);
  },

  /**
   * Get active (unresolved) alerts
   */
  getActive() {
    return this.getAll({ active: true });
  },

  /**
   * Get active alert count
   */
  getActiveCount() {
    const stmt = getDb().prepare(`
      SELECT COUNT(*) as count FROM alerts_history WHERE resolved_at IS NULL
    `);
    return stmt.get().count;
  },

  /**
   * Get active alerts count by level
   */
  getActiveCountByLevel(level) {
    if (level) {
      // Return count for specific level
      const stmt = getDb().prepare(`
        SELECT COUNT(*) as count
        FROM alerts_history
        WHERE resolved_at IS NULL AND alert_level = ?
      `);
      return stmt.get(level).count;
    }

    // Return all levels if no specific level requested
    const stmt = getDb().prepare(`
      SELECT alert_level, COUNT(*) as count
      FROM alerts_history
      WHERE resolved_at IS NULL
      GROUP BY alert_level
    `);
    const rows = stmt.all();
    const result = { warning: 0, critical: 0 };
    rows.forEach(row => {
      result[row.alert_level] = row.count;
    });
    return result;
  },

  /**
   * Get a single alert by ID
   */
  getById(id) {
    const stmt = getDb().prepare(`
      SELECT a.*, n.name as node_name, n.host as node_host
      FROM alerts_history a
      LEFT JOIN nodes n ON a.node_id = n.id
      WHERE a.id = ?
    `);
    return stmt.get(id);
  },

  /**
   * Check if an active alert exists for a node/type/level combination
   */
  hasActiveAlert(nodeId, alertType, alertLevel) {
    const stmt = getDb().prepare(`
      SELECT id FROM alerts_history
      WHERE node_id = ? AND alert_type = ? AND alert_level = ? AND resolved_at IS NULL
      LIMIT 1
    `);
    return stmt.get(nodeId, alertType, alertLevel) !== undefined;
  },

  /**
   * Resolve an alert (set resolved_at timestamp)
   */
  resolve(id) {
    const stmt = getDb().prepare(`
      UPDATE alerts_history SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL
    `);
    const now = Math.floor(Date.now() / 1000);
    return stmt.run(now, id).changes > 0;
  },

  /**
   * Resolve all active alerts for a node/type (when value goes back to normal)
   */
  resolveByNodeAndType(nodeId, alertType) {
    const stmt = getDb().prepare(`
      UPDATE alerts_history SET resolved_at = ?
      WHERE node_id = ? AND alert_type = ? AND resolved_at IS NULL
    `);
    const now = Math.floor(Date.now() / 1000);
    return stmt.run(now, nodeId, alertType).changes;
  },

  /**
   * Acknowledge an alert
   */
  acknowledge(id) {
    const stmt = getDb().prepare(`
      UPDATE alerts_history SET acknowledged = 1 WHERE id = ?
    `);
    return stmt.run(id).changes > 0;
  },

  /**
   * Delete old alerts (older than retentionDays)
   */
  cleanup(retentionDays = 90) {
    const stmt = getDb().prepare(`
      DELETE FROM alerts_history
      WHERE created_at < ? AND resolved_at IS NOT NULL
    `);
    const cutoff = Math.floor(Date.now() / 1000) - (retentionDays * 24 * 60 * 60);
    return stmt.run(cutoff).changes;
  },

  /**
   * Delete all alerts for a node
   */
  deleteForNode(nodeId) {
    const stmt = getDb().prepare('DELETE FROM alerts_history WHERE node_id = ?');
    return stmt.run(nodeId).changes;
  },
};

// =====================================================
// Docker Operations
// =====================================================

const docker = {
  /**
   * Get all Docker data for a node
   */
  getAllForNode(nodeId) {
    return {
      containers: this.getContainers(nodeId),
      images: this.getImages(nodeId),
      volumes: this.getVolumes(nodeId),
      networks: this.getNetworks(nodeId),
    };
  },

  /**
   * Get containers for a node
   */
  getContainers(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_containers WHERE node_id = ? ORDER BY name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Get a single container
   */
  getContainer(nodeId, containerId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_containers WHERE node_id = ? AND container_id = ?
    `);
    return stmt.get(nodeId, containerId);
  },

  /**
   * Save containers for a node (replaces all existing)
   */
  saveContainers(nodeId, containers) {
    const deleteStmt = getDb().prepare('DELETE FROM docker_containers WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO docker_containers (node_id, container_id, name, image, status, state, ports_json, created_at)
      VALUES (@node_id, @container_id, @name, @image, @status, @state, @ports_json, @created_at)
    `);

    const transaction = getDb().transaction(function(containers) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < containers.length; i++) {
        var c = containers[i];
        insertStmt.run({
          node_id: nodeId,
          container_id: c.id,
          name: c.name,
          image: c.image,
          status: c.status,
          state: c.state,
          ports_json: c.ports || null,
          created_at: c.created || null,
        });
      }
    });

    transaction(containers);
  },

  /**
   * Get images for a node
   */
  getImages(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_images WHERE node_id = ? ORDER BY repository, tag
    `);
    return stmt.all(nodeId);
  },

  /**
   * Save images for a node (replaces all existing)
   */
  saveImages(nodeId, images) {
    const deleteStmt = getDb().prepare('DELETE FROM docker_images WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO docker_images (node_id, image_id, repository, tag, size_bytes, created_at)
      VALUES (@node_id, @image_id, @repository, @tag, @size_bytes, @created_at)
    `);

    const transaction = getDb().transaction(function(images) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < images.length; i++) {
        var img = images[i];
        insertStmt.run({
          node_id: nodeId,
          image_id: img.id,
          repository: img.repository,
          tag: img.tag,
          size_bytes: img.size_bytes || 0,
          created_at: img.created || null,
        });
      }
    });

    transaction(images);
  },

  /**
   * Get volumes for a node
   */
  getVolumes(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_volumes WHERE node_id = ? ORDER BY name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Save volumes for a node (replaces all existing)
   */
  saveVolumes(nodeId, volumes) {
    const deleteStmt = getDb().prepare('DELETE FROM docker_volumes WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO docker_volumes (node_id, name, driver, mountpoint, in_use)
      VALUES (@node_id, @name, @driver, @mountpoint, @in_use)
    `);

    const transaction = getDb().transaction(function(volumes) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < volumes.length; i++) {
        var v = volumes[i];
        insertStmt.run({
          node_id: nodeId,
          name: v.name,
          driver: v.driver || 'local',
          mountpoint: v.mountpoint || null,
          in_use: v.in_use ? 1 : 0,
        });
      }
    });

    transaction(volumes);
  },

  /**
   * Get networks for a node
   */
  getNetworks(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_networks WHERE node_id = ? ORDER BY name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Save networks for a node (replaces all existing)
   */
  saveNetworks(nodeId, networks) {
    const deleteStmt = getDb().prepare('DELETE FROM docker_networks WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO docker_networks (node_id, network_id, name, driver, scope)
      VALUES (@node_id, @network_id, @name, @driver, @scope)
    `);

    const transaction = getDb().transaction(function(networks) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < networks.length; i++) {
        var n = networks[i];
        insertStmt.run({
          node_id: nodeId,
          network_id: n.id,
          name: n.name,
          driver: n.driver || 'bridge',
          scope: n.scope || 'local',
        });
      }
    });

    transaction(networks);
  },

  /**
   * Save all Docker data for a node
   */
  saveAll(nodeId, data) {
    if (data.containers) {
      this.saveContainers(nodeId, data.containers);
    }
    if (data.images) {
      this.saveImages(nodeId, data.images);
    }
    if (data.volumes) {
      this.saveVolumes(nodeId, data.volumes);
    }
    if (data.networks) {
      this.saveNetworks(nodeId, data.networks);
    }
  },

  /**
   * Delete all Docker data for a node
   */
  deleteForNode(nodeId) {
    getDb().prepare('DELETE FROM docker_containers WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM docker_images WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM docker_volumes WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM docker_networks WHERE node_id = ?').run(nodeId);
  },

  /**
   * Get summary counts for a node
   */
  getSummary(nodeId) {
    const containers = getDb().prepare('SELECT COUNT(*) as count FROM docker_containers WHERE node_id = ?').get(nodeId);
    const running = getDb().prepare("SELECT COUNT(*) as count FROM docker_containers WHERE node_id = ? AND state = 'running'").get(nodeId);
    const images = getDb().prepare('SELECT COUNT(*) as count FROM docker_images WHERE node_id = ?').get(nodeId);
    const volumes = getDb().prepare('SELECT COUNT(*) as count FROM docker_volumes WHERE node_id = ?').get(nodeId);
    const networks = getDb().prepare('SELECT COUNT(*) as count FROM docker_networks WHERE node_id = ?').get(nodeId);

    return {
      containers_total: containers.count,
      containers_running: running.count,
      images: images.count,
      volumes: volumes.count,
      networks: networks.count,
    };
  },
};

// =====================================================
// Proxmox Operations
// =====================================================

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
};

// =====================================================
// Commands
// =====================================================

const commands = {
  // Command Templates
  getTemplates: function(category) {
    if (category) {
      return getDb().prepare('SELECT * FROM command_templates WHERE category = ? ORDER BY sort_order, name').all(category);
    }
    return getDb().prepare('SELECT * FROM command_templates ORDER BY category, sort_order, name').all();
  },

  getTemplateById: function(id) {
    return getDb().prepare('SELECT * FROM command_templates WHERE id = ?').get(id);
  },

  getTemplatesForNodeType: function(nodeType) {
    var templates = getDb().prepare('SELECT * FROM command_templates ORDER BY category, sort_order, name').all();
    return templates.filter(function(t) {
      var types = t.node_types.split(',').map(function(s) { return s.trim(); });
      return types.indexOf(nodeType) !== -1 || types.indexOf('all') !== -1;
    });
  },

  createTemplate: function(data) {
    var stmt = getDb().prepare(
      'INSERT INTO command_templates (name, description, category, node_types, template, requires_param, dangerous, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    var result = stmt.run(
      data.name,
      data.description || null,
      data.category,
      data.node_types,
      data.template,
      data.requires_param || null,
      data.dangerous || 0,
      data.sort_order || 0
    );
    return result.lastInsertRowid;
  },

  deleteTemplate: function(id) {
    return getDb().prepare('DELETE FROM command_templates WHERE id = ?').run(id);
  },

  // Command History
  createHistory: function(data) {
    var stmt = getDb().prepare(
      'INSERT INTO command_history (command_template_id, full_command, target_type, target_value) VALUES (?, ?, ?, ?)'
    );
    var result = stmt.run(
      data.command_template_id || null,
      data.full_command,
      data.target_type,
      data.target_value || null
    );
    return result.lastInsertRowid;
  },

  getHistory: function(limit) {
    limit = limit || 50;
    return getDb().prepare(
      'SELECT h.*, t.name as template_name, t.category as template_category FROM command_history h LEFT JOIN command_templates t ON h.command_template_id = t.id ORDER BY h.executed_at DESC LIMIT ?'
    ).all(limit);
  },

  getHistoryForNode: function(nodeId, limit) {
    limit = limit || 20;
    return getDb().prepare(
      'SELECT DISTINCT h.*, t.name as template_name, t.category as template_category FROM command_history h LEFT JOIN command_templates t ON h.command_template_id = t.id INNER JOIN command_results r ON h.id = r.history_id WHERE r.node_id = ? ORDER BY h.executed_at DESC LIMIT ?'
    ).all(nodeId, limit);
  },

  // Command Results
  createResult: function(data) {
    var stmt = getDb().prepare(
      'INSERT INTO command_results (history_id, node_id, status, exit_code, output, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    var result = stmt.run(
      data.history_id,
      data.node_id,
      data.status,
      data.exit_code,
      data.output || null,
      data.error || null,
      data.started_at,
      data.finished_at
    );
    return result.lastInsertRowid;
  },

  getResultsForHistory: function(historyId) {
    return getDb().prepare(
      'SELECT r.*, n.name as node_name FROM command_results r INNER JOIN nodes n ON r.node_id = n.id WHERE r.history_id = ? ORDER BY r.started_at'
    ).all(historyId);
  },

  getResultById: function(id) {
    return getDb().prepare(
      'SELECT r.*, n.name as node_name, h.full_command FROM command_results r INNER JOIN nodes n ON r.node_id = n.id INNER JOIN command_history h ON r.history_id = h.id WHERE r.id = ?'
    ).get(id);
  },

  getLatestResultForNode: function(nodeId) {
    return getDb().prepare(
      'SELECT r.*, h.full_command FROM command_results r INNER JOIN command_history h ON r.history_id = h.id WHERE r.node_id = ? ORDER BY r.started_at DESC LIMIT 1'
    ).get(nodeId);
  },

  // Cleanup old history
  cleanupHistory: function(olderThanDays) {
    olderThanDays = olderThanDays || 30;
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    var cutoffStr = cutoff.toISOString();

    // Delete results first (FK constraint)
    getDb().prepare(
      'DELETE FROM command_results WHERE history_id IN (SELECT id FROM command_history WHERE executed_at < ?)'
    ).run(cutoffStr);

    // Then delete history
    return getDb().prepare('DELETE FROM command_history WHERE executed_at < ?').run(cutoffStr);
  },
};

// =============================================================================
// HEALTH
// =============================================================================

var health = {
  // Get health data for a node
  get: function(nodeId) {
    return getDb().prepare(
      'SELECT * FROM node_health WHERE node_id = ?'
    ).get(nodeId);
  },

  // Get health data for all nodes
  getAll: function() {
    return getDb().prepare(
      'SELECT h.*, n.name as node_name FROM node_health h INNER JOIN nodes n ON h.node_id = n.id ORDER BY h.apt_updates DESC'
    ).all();
  },

  // Get nodes with pending updates
  getNodesWithUpdates: function() {
    return getDb().prepare(
      'SELECT h.*, n.name as node_name FROM node_health h INNER JOIN nodes n ON h.node_id = n.id WHERE h.apt_updates > 0 ORDER BY h.apt_security DESC, h.apt_updates DESC'
    ).all();
  },

  // Save or update health data
  save: function(nodeId, data) {
    var stmt = getDb().prepare(`
      INSERT OR REPLACE INTO node_health (
        node_id, kernel_version, last_boot, uptime_seconds, reboot_required,
        apt_updates, apt_security, apt_packages_json,
        pve_version, pve_repo,
        docker_images, npm_outdated, apt_cache_free_mb,
        checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(
      nodeId,
      data.kernel_version || null,
      data.last_boot || null,
      data.uptime_seconds || 0,
      data.reboot_required ? 1 : 0,
      data.apt_updates || 0,
      data.apt_security || 0,
      data.apt_packages_json || null,
      data.pve_version || null,
      data.pve_repo || null,
      data.docker_images || 0,
      data.npm_outdated || 0,
      data.apt_cache_free_mb || 0
    );
  },

  // Delete health data for a node
  delete: function(nodeId) {
    return getDb().prepare('DELETE FROM node_health WHERE node_id = ?').run(nodeId);
  },

  // Get total pending updates across all nodes
  getTotalUpdates: function() {
    var result = getDb().prepare(
      'SELECT COALESCE(SUM(apt_updates), 0) as total, COALESCE(SUM(apt_security), 0) as security FROM node_health'
    ).get();
    return result || { total: 0, security: 0 };
  },
};

// =============================================================================
// CAPABILITIES
// =============================================================================

var capabilities = {
  // Get capabilities for a node
  get: function(nodeId) {
    return getDb().prepare(
      'SELECT * FROM node_capabilities WHERE node_id = ?'
    ).get(nodeId);
  },

  // Get all node capabilities
  getAll: function() {
    return getDb().prepare(
      'SELECT c.*, n.name as node_name FROM node_capabilities c INNER JOIN nodes n ON c.node_id = n.id'
    ).all();
  },

  // Save or update capabilities for a node
  upsert: function(nodeId, capabilitiesJson, timestamp) {
    var stmt = getDb().prepare(`
      INSERT OR REPLACE INTO node_capabilities (node_id, capabilities_json, last_detected_at)
      VALUES (?, ?, ?)
    `);
    return stmt.run(nodeId, capabilitiesJson, timestamp);
  },

  // Delete capabilities for a node
  delete: function(nodeId) {
    return getDb().prepare('DELETE FROM node_capabilities WHERE node_id = ?').run(nodeId);
  },
};

// =====================================================
// LVM Storage Operations
// =====================================================

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

// =====================================================
// Backup Operations
// =====================================================

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

// =====================================================
// Task Operations (Proxmox Task History)
// =====================================================

var tasks = {
  // === Save/Update Tasks ===
  saveTasks: function(nodeId, taskList) {
    if (!taskList || taskList.length === 0) return;

    var upsertStmt = getDb().prepare(`
      INSERT INTO node_tasks (node_id, upid, pve_node, task_type, vmid, user, status, exitstatus, starttime, endtime, pid, pstart)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_id, upid) DO UPDATE SET
        status = excluded.status,
        exitstatus = excluded.exitstatus,
        endtime = excluded.endtime,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (var i = 0; i < taskList.length; i++) {
      var t = taskList[i];
      upsertStmt.run(
        nodeId,
        t.upid || '',
        t.node || null,
        t.type || 'unknown',
        t.id || null,  // vmid
        t.user || null,
        t.status || 'unknown',
        t.exitstatus || null,
        t.starttime || null,
        t.endtime || null,
        t.pid || null,
        t.pstart || null
      );
    }
  },

  // === Get Tasks (filtered by pve_node name, not node_id) ===
  getTasks: function(nodeId, options) {
    options = options || {};
    var limit = options.limit || 100;
    var offset = options.offset || 0;
    var taskType = options.type || null;
    var status = options.status || null;
    var vmid = options.vmid || null;
    var pveNode = options.pveNode || null;

    // Filter by pve_node (cluster-wide tasks filtered to this node)
    var sql = 'SELECT * FROM node_tasks WHERE pve_node = ?';
    var params = [pveNode];

    if (taskType) {
      sql += ' AND task_type = ?';
      params.push(taskType);
    }
    if (status) {
      if (status === 'running') {
        sql += ' AND status = ?';
        params.push('running');
      } else if (status === 'ok') {
        sql += ' AND (status = ? OR exitstatus = ?)';
        params.push('OK', 'OK');
      } else if (status === 'error') {
        sql += ' AND ((status NOT IN (?, ?, ?) AND status IS NOT NULL) OR (exitstatus IS NOT NULL AND exitstatus != ? AND exitstatus != ?))';
        params.push('running', 'OK', '', 'OK', '');
      }
    }
    if (vmid) {
      sql += ' AND vmid = ?';
      params.push(vmid);
    }

    sql += ' ORDER BY starttime DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return getDb().prepare(sql).all.apply(getDb().prepare(sql), params);
  },

  // === Get single task by UPID ===
  getTaskByUpid: function(nodeId, upid) {
    return getDb().prepare('SELECT * FROM node_tasks WHERE node_id = ? AND upid = ?').get(nodeId, upid);
  },

  // === Get running tasks ===
  getRunningTasks: function(nodeId) {
    return getDb().prepare('SELECT * FROM node_tasks WHERE node_id = ? AND status = ? ORDER BY starttime DESC').all(nodeId, 'running');
  },

  // === Get task count by status (filtered by pve_node) ===
  getTaskCounts: function(nodeId, pveNode) {
    var result = getDb().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'OK' OR exitstatus = 'OK' THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN status NOT IN ('running', 'OK', '') AND status IS NOT NULL THEN 1
            WHEN exitstatus IS NOT NULL AND exitstatus != 'OK' AND exitstatus != '' THEN 1
            ELSE 0 END) as error
      FROM node_tasks WHERE pve_node = ?
    `).get(pveNode);
    return result || { total: 0, running: 0, ok: 0, error: 0 };
  },

  // === Get task types for filter (filtered by pve_node) ===
  getTaskTypes: function(nodeId, pveNode) {
    return getDb().prepare('SELECT DISTINCT task_type FROM node_tasks WHERE pve_node = ? ORDER BY task_type').all(pveNode);
  },

  // === Cleanup old tasks (keep last N days) ===
  cleanupOldTasks: function(nodeId, daysToKeep) {
    daysToKeep = daysToKeep || 30;
    var cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 86400);
    getDb().prepare('DELETE FROM node_tasks WHERE node_id = ? AND starttime < ? AND status != ?').run(nodeId, cutoff, 'running');
  },

  // === Delete all tasks for a node ===
  deleteForNode: function(nodeId) {
    getDb().prepare('DELETE FROM node_tasks WHERE node_id = ?').run(nodeId);
  },
};

module.exports = {
  init,
  getDb,
  close,
  nodes,
  tags,
  settings,
  discovery,
  hardware,
  stats,
  alerts,
  docker,
  proxmox,
  commands,
  health,
  capabilities,
  lvm,
  backups,
  tasks,
};

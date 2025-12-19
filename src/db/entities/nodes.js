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

module.exports = { init, nodes };

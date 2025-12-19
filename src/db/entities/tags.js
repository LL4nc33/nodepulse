'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

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

module.exports = { init, tags };

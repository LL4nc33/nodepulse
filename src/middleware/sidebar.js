/**
 * Sidebar Data Middleware
 * Provides sidebar data (nodes, tags, stats) to all views via res.locals
 */

/**
 * Get sidebar data for views
 * @param {Object} db - Database instance
 * @returns {Object} Sidebar data
 */
const getSidebarData = (db) => {
  const allNodes = db.nodes.getAll();
  const nodeTree = db.nodes.getHierarchyTree();
  const allTags = db.tags.getAll();
  const onlineCount = allNodes.filter(n => n.online).length;

  return {
    nodes: allNodes,
    nodeTree,
    tags: allTags,
    stats: {
      total: allNodes.length,
      online: onlineCount,
      offline: allNodes.length - onlineCount
    }
  };
};

/**
 * Middleware factory
 * @param {Object} db - Database instance
 * @returns {Function} Express middleware
 */
module.exports = (db) => {
  return (req, res, next) => {
    const sidebarData = getSidebarData(db);
    // Merge sidebar data into res.locals for all views
    Object.assign(res.locals, sidebarData);
    next();
  };
};

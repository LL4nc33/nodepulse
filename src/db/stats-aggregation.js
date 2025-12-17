/**
 * =============================================================================
 * STATS AGGREGATION - Hierarchie-basierte Metriken-Aggregation
 * =============================================================================
 *
 * Aggregiert Stats von Child-Nodes für Parent-Nodes (z.B. Proxmox Host).
 *
 * Funktionen:
 * - aggregateChildStats(parentId) - Aggregiert alle Child-Stats
 * - Weighted Average für CPU (nach Cores gewichtet)
 * - Summe für RAM/Disk (used + total)
 * - Summe für VMs/Containers/Uptime
 *
 * Use Case:
 * - Proxmox-Host zeigt Gesamt-CPU/RAM/Disk aller VMs
 * - Parent-Node hat aggregierte Metriken in Grouped View
 * =============================================================================
 */

const db = require('./index');

/**
 * Aggregiere Stats von allen Child-Nodes
 * @param {number} parentId - Parent Node ID
 * @returns {Object} Aggregierte Stats
 */
function aggregateChildStats(parentId) {
  // Get all children (recursive, alle Ebenen)
  const children = getChildrenRecursive(parentId);

  if (children.length === 0) {
    return null;
  }

  // Aggregation-Objekt initialisieren
  const aggregate = {
    total_nodes: children.length,
    total_cpu_cores: 0,
    total_ram_bytes: 0,
    total_disk_bytes: 0,
    total_vms: 0,
    total_cts: 0,
    total_containers: 0,
    avg_cpu_percent: 0,
    avg_ram_percent: 0,
    avg_disk_percent: 0,
    online_count: 0,
    offline_count: 0
  };

  let cpuWeightedSum = 0;
  let cpuTotalWeight = 0;
  let ramUsedSum = 0;
  let ramTotalSum = 0;
  let diskUsedSum = 0;
  let diskTotalSum = 0;

  // Iteriere über alle Children
  children.forEach(child => {
    const stats = db.stats.getCurrent(child.id) || {};
    const hardware = db.hardware.getByNodeId(child.id) || {};

    // Online-Status
    if (child.online) {
      aggregate.online_count++;
    } else {
      aggregate.offline_count++;
    }

    // CPU (Weighted Average nach Cores)
    const cpuCores = hardware.cpu_cores || 1;
    const cpuPercent = stats.cpu_percent || 0;
    cpuWeightedSum += cpuPercent * cpuCores;
    cpuTotalWeight += cpuCores;
    aggregate.total_cpu_cores += cpuCores;

    // RAM (Summe used/total)
    const ramTotal = hardware.ram_total_bytes || 0;
    const ramUsed = stats.ram_used_bytes || 0;
    ramUsedSum += ramUsed;
    ramTotalSum += ramTotal;
    aggregate.total_ram_bytes += ramTotal;

    // Disk (Summe used/total)
    const diskTotal = stats.disk_total_bytes || (stats.disk_used_bytes + stats.disk_available_bytes) || 0;
    const diskUsed = stats.disk_used_bytes || 0;
    diskUsedSum += diskUsed;
    diskTotalSum += diskTotal;
    aggregate.total_disk_bytes += diskTotal;

    // VMs/Containers
    aggregate.total_vms += (stats.vms_running || 0) + (stats.cts_running || 0);
    aggregate.total_containers += stats.containers_running || 0;
  });

  // Berechne Durchschnitte
  if (cpuTotalWeight > 0) {
    aggregate.avg_cpu_percent = Math.round(cpuWeightedSum / cpuTotalWeight);
  }

  if (ramTotalSum > 0) {
    aggregate.avg_ram_percent = Math.round((ramUsedSum / ramTotalSum) * 100);
    aggregate.total_ram_used_bytes = ramUsedSum;
  }

  if (diskTotalSum > 0) {
    aggregate.avg_disk_percent = Math.round((diskUsedSum / diskTotalSum) * 100);
    aggregate.total_disk_used_bytes = diskUsedSum;
  }

  return aggregate;
}

/**
 * Get all children recursively (alle Ebenen)
 * @param {number} parentId - Parent Node ID
 * @returns {Array} Array of child nodes
 */
function getChildrenRecursive(parentId) {
  const allChildren = [];

  function getChildren(id) {
    const children = db.getDb()
      .prepare('SELECT * FROM nodes WHERE parent_id = ? ORDER BY name')
      .all(id);

    children.forEach(child => {
      allChildren.push(child);
      // Rekursiv für Child-Children
      getChildren(child.id);
    });
  }

  getChildren(parentId);
  return allChildren;
}

/**
 * Get hierarchical tree with aggregated stats
 * @returns {Array} Tree structure mit aggregierten Stats
 */
function getHierarchicalStats() {
  // Get all root nodes (keine parent_id)
  const roots = db.getDb()
    .prepare('SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY name')
    .all();

  const tree = [];

  roots.forEach(root => {
    const node = buildNodeWithStats(root);
    tree.push(node);
  });

  return tree;
}

/**
 * Build node object with stats and children (recursive)
 * @param {Object} node - Node DB-Objekt
 * @returns {Object} Node mit Stats + Children
 */
function buildNodeWithStats(node) {
  const stats = db.stats.getCurrent(node.id) || {};
  const hardware = db.hardware.getByNodeId(node.id) || {};

  // Build node object
  const nodeWithStats = {
    id: node.id,
    name: node.name,
    host: node.host,
    node_type: node.node_type,
    online: node.online,
    parent_id: node.parent_id,
    tags: node.tags,
    stats: {
      cpu_percent: stats.cpu_percent || 0,
      cpu_cores: hardware.cpu_cores || 0,
      ram_percent: stats.ram_percent || 0,
      ram_used_bytes: stats.ram_used_bytes || 0,
      ram_total_bytes: hardware.ram_total_bytes || 0,
      disk_percent: stats.disk_percent || 0,
      disk_used_bytes: stats.disk_used_bytes || 0,
      disk_total_bytes: stats.disk_total_bytes || 0,
      vms_running: stats.vms_running || 0,
      cts_running: stats.cts_running || 0,
      containers_running: stats.containers_running || 0,
      uptime_seconds: stats.uptime_seconds || 0
    }
  };

  // Get children (recursive)
  const children = db.getDb()
    .prepare('SELECT * FROM nodes WHERE parent_id = ? ORDER BY name')
    .all(node.id);

  if (children.length > 0) {
    nodeWithStats.children = children.map(child => buildNodeWithStats(child));

    // Aggregierte Stats berechnen
    nodeWithStats.aggregate = aggregateChildStats(node.id);
  } else {
    nodeWithStats.children = [];
    nodeWithStats.aggregate = null;
  }

  return nodeWithStats;
}

module.exports = {
  aggregateChildStats,
  getChildrenRecursive,
  getHierarchicalStats,
  buildNodeWithStats
};

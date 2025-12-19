'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

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

  // Save or update health data (Extended with all health metrics)
  save: function(nodeId, data) {
    var stmt = getDb().prepare(`
      INSERT OR REPLACE INTO node_health (
        node_id, kernel_version, last_boot, uptime_seconds, reboot_required,
        cpu_temp, cpu_temp_status, load_1, load_5, load_15, load_status,
        mem_percent, mem_status, swap_percent, swap_status,
        disk_percent, disk_status,
        failed_services, failed_services_list, services_status,
        zombie_processes, zombie_status,
        time_sync, time_status, net_gateway, net_status,
        health_score, health_status, health_issues,
        apt_updates, apt_security, apt_status, apt_packages_json,
        pve_version, pve_repo,
        docker_images, npm_outdated, apt_cache_free_mb,
        checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(
      nodeId,
      data.kernel_version || null,
      data.last_boot || null,
      data.uptime_seconds || 0,
      data.reboot_required ? 1 : 0,
      data.cpu_temp || 0,
      data.cpu_temp_status || 'unknown',
      data.load_1 || 0,
      data.load_5 || 0,
      data.load_15 || 0,
      data.load_status || 'ok',
      data.mem_percent || 0,
      data.mem_status || 'ok',
      data.swap_percent || 0,
      data.swap_status || 'ok',
      data.disk_percent || 0,
      data.disk_status || 'ok',
      data.failed_services || 0,
      data.failed_services_list || null,
      data.services_status || 'ok',
      data.zombie_processes || 0,
      data.zombie_status || 'ok',
      data.time_sync || null,
      data.time_status || 'unknown',
      data.net_gateway || null,
      data.net_status || 'unknown',
      data.health_score || 100,
      data.health_status || 'healthy',
      data.health_issues || null,
      data.apt_updates || 0,
      data.apt_security || 0,
      data.apt_status || 'ok',
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

module.exports = { init, health };

'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

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

  /**
   * Get aggregated cluster history (all nodes averaged per time bucket)
   * @param {number} hours - Hours of history to fetch
   * @param {number} bucketMinutes - Time bucket size in minutes (default 5)
   * @returns {Array} - Array of {timestamp, cpu_percent, ram_percent, disk_percent}
   */
  getClusterHistory(hours, bucketMinutes) {
    hours = hours || 1;
    bucketMinutes = bucketMinutes || 5;
    var cutoff = Math.floor(Date.now() / 1000) - (hours * 3600);
    var bucketSeconds = bucketMinutes * 60;

    // Group by time bucket and average across all nodes
    var stmt = getDb().prepare('\n      SELECT \n        (timestamp / ' + bucketSeconds + ') * ' + bucketSeconds + ' as bucket,\n        AVG(cpu_percent) as cpu_percent,\n        AVG(ram_percent) as ram_percent,\n        AVG(disk_percent) as disk_percent,\n        COUNT(DISTINCT node_id) as node_count\n      FROM node_stats_history\n      WHERE timestamp > ?\n      GROUP BY bucket\n      ORDER BY bucket ASC\n    ');

    return stmt.all(cutoff).map(function(row) {
      return {
        timestamp: row.bucket,
        cpu_percent: row.cpu_percent !== null ? Math.round(row.cpu_percent * 10) / 10 : null,
        ram_percent: row.ram_percent !== null ? Math.round(row.ram_percent * 10) / 10 : null,
        disk_percent: row.disk_percent !== null ? Math.round(row.disk_percent * 10) / 10 : null,
        node_count: row.node_count
      };
    });
  },
};

module.exports = { init, stats };

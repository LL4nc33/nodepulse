/**
 * Stats Collector Module
 * System metrics collection (CPU, RAM, Disk, Network)
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');
var utils = require('./utils');
var alertsService = require('../services/alerts');
var thresholds = require('../lib/thresholds');
var childCollector = require('./child-collector');

/**
 * Run stats collection on a node
 * @param {Object} node - Node object from database
 * @param {boolean} saveHistory - Whether to save to history table (default: true)
 * @param {Function} runFullDiscovery - Full discovery function (for re-discovery on online)
 * @returns {Promise<Object>} Stats data
 */
async function runStats(node, saveHistory, runFullDiscovery) {
  if (saveHistory === undefined) saveHistory = true;

  var script = utils.getScript('stats.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 30000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Stats script failed';
    db.nodes.setOnline(node.id, false, errMsg);
    throw new Error(errMsg);
  }

  var data;
  try {
    data = utils.parseScriptOutput(result.stdout, node.name);
  } catch (err) {
    // Save raw output snippet to last_error for debugging
    var errorWithOutput = err.rawOutput
      ? err.message + ' | Raw: ' + err.rawOutput.substring(0, 200)
      : err.message;
    db.nodes.setOnline(node.id, false, errorWithOutput);
    throw err;
  }

  // Defensive Parsing: Sanitize NaN/Infinity values (TOON Integration - Problem 2)
  Object.keys(data).forEach(function(key) {
    if (typeof data[key] === 'number' && !isFinite(data[key])) {
      console.warn('[Collector] Invalid number for ' + node.name + '.' + key + ': ' + data[key] + ', replacing with 0');
      data[key] = 0;
    }
  });

  // Timestamp Validation (TOON Integration - Problem 7)
  var now = Date.now();
  var minDate = new Date('2024-01-01').getTime();
  var maxDate = now + 3600000; // +1h future tolerance

  if (data.timestamp) {
    var ts = data.timestamp;
    // Convert seconds to milliseconds if needed (timestamps before year 2001 in ms are > 10^12)
    if (ts < 10000000000) {
      ts = ts * 1000;
    }
    data.timestamp = ts;

    if (ts < minDate || ts > maxDate) {
      console.warn('[Collector] Invalid timestamp for ' + node.name + ': ' + ts + ', using current time');
      data.timestamp = now;
    }
  } else {
    data.timestamp = now;
  }

  // Counter Reset Detection (TOON Integration - Problem 11)
  var previousStats = db.stats.getCurrent(node.id);
  if (previousStats) {
    // Check net_rx_bytes for counter reset (reboot or overflow)
    if (data.net_rx_bytes < previousStats.net_rx_bytes) {
      var diff = previousStats.net_rx_bytes - data.net_rx_bytes;
      if (diff > 1073741824) { // 1 GB difference = likely reset
        console.warn('[Collector] Counter reset detected for ' + node.name + ' (RX: ' + previousStats.net_rx_bytes + ' -> ' + data.net_rx_bytes + ')');
        // Don't throw error - just log it, data is still valid
      }
    }
    // Check net_tx_bytes
    if (data.net_tx_bytes < previousStats.net_tx_bytes) {
      var diff2 = previousStats.net_tx_bytes - data.net_tx_bytes;
      if (diff2 > 1073741824) {
        console.warn('[Collector] Counter reset detected for ' + node.name + ' (TX: ' + previousStats.net_tx_bytes + ' -> ' + data.net_tx_bytes + ')');
      }
    }
  }

  // Count VMs/Containers (TOON Integration - consolidated query)
  // Uses single UNION ALL query instead of 3 separate COUNT queries (N+1 → 1)
  try {
    var isProxmox = node.node_type === 'proxmox' || node.is_proxmox_host;
    var isDocker = node.is_docker;
    var counts = db.stats.getRunningCounts(node.id, isProxmox, isDocker);
    data.vms_running = counts.vms_running;
    data.cts_running = counts.cts_running;
    data.containers_running = counts.containers_running;
  } catch (err) {
    console.error('[Collector] Failed to count VMs/Containers for node ' + node.id + ':', err.message);
    // Continue with 0 counts - not critical
    data.vms_running = 0;
    data.cts_running = 0;
    data.containers_running = 0;
  }

  // Save to current stats
  db.stats.saveCurrent(node.id, data);

  // Save to history if enabled
  if (saveHistory) {
    db.stats.saveHistory(node.id, data);
  }

  // Check if node was offline before (for re-discovery)
  var wasOffline = !node.online;

  // Update node online status
  db.nodes.setOnline(node.id, true);

  // Load settings once for re-discovery and alerts (cached, efficient for RPi 2B)
  var settings = db.settings.getAll();

  // Re-Discovery wenn Node von offline auf online wechselt
  if (wasOffline && settings.rediscovery_on_connect === 'true' && runFullDiscovery) {
    // Discovery im Hintergrund ausführen (nicht-blocking)
    runFullDiscovery(node).catch(function(err) {
      console.error('Re-Discovery für Node ' + node.id + ' fehlgeschlagen:', err.message);
    });
  }

  // Check alerts if thresholds are configured (zentrale Threshold-Funktion)
  try {
    var thresholdValues = thresholds.getThresholds(settings);

    alertsService.checkAlerts(node.id, data, thresholdValues);
    // Also resolve any offline alert since we successfully collected stats
    alertsService.checkOfflineAlert(node.id, true);
  } catch (alertErr) {
    console.error('Alert check failed for node', node.name, ':', alertErr.message);
  }

  return data;
}

/**
 * Run stats collection for a child node (VM/LXC) via parent host
 * Uses pct exec (LXC) or qm guest exec (VM) instead of direct SSH
 *
 * @param {Object} childNode - Child node object (must have parent_id, guest_vmid, guest_type)
 * @param {boolean} saveHistory - Whether to save to history table (default: true)
 * @returns {Promise<Object>} Stats data
 */
async function runStatsForChild(childNode, saveHistory) {
  if (saveHistory === undefined) saveHistory = true;

  // Validate child node properties
  if (!childNode.parent_id) {
    throw new Error('Not a child node: missing parent_id');
  }
  if (!childNode.guest_vmid || !childNode.guest_type) {
    throw new Error('Not a child node: missing guest_vmid or guest_type');
  }

  // Get parent node with credentials
  var parent = db.nodes.getByIdWithCredentials(childNode.parent_id);
  if (!parent) {
    throw new Error('Parent node not found');
  }
  if (!parent.online) {
    throw new Error('Parent node is offline');
  }

  console.log('[STATS] Running child stats for ' + childNode.name +
              ' (' + childNode.guest_type + ' ' + childNode.guest_vmid + ') via ' + parent.name);

  // Commands for stats collection
  var commands = ['load', 'memory', 'disk', 'uptime', 'process-count'];

  // Execute commands via pct/qm exec
  var batchResult = await childCollector.execBatchInChild(
    parent,
    childNode.guest_vmid,
    childNode.guest_type,
    commands,
    { timeout: 30000 }
  );

  if (!batchResult.success) {
    db.nodes.setOnline(childNode.id, false, batchResult.error);
    throw new Error('Child stats failed: ' + batchResult.error);
  }

  // Parse results into stats data structure
  var data = parseChildStatsResults(batchResult.results, childNode);
  data.timestamp = Date.now();

  // Save to current stats
  db.stats.saveCurrent(childNode.id, data);

  // Save to history if enabled
  if (saveHistory) {
    db.stats.saveHistory(childNode.id, data);
  }

  // Update node online status
  db.nodes.setOnline(childNode.id, true);

  // Load settings for alerts
  var settings = db.settings.getAll();

  // Check alerts if thresholds are configured
  try {
    var thresholdValues = thresholds.getThresholds(settings);
    alertsService.checkAlerts(childNode.id, data, thresholdValues);
    alertsService.checkOfflineAlert(childNode.id, true);
  } catch (alertErr) {
    console.error('Alert check failed for child node', childNode.name, ':', alertErr.message);
  }

  console.log('[STATS] Child stats complete for ' + childNode.name +
              ': cpu=' + data.cpu_percent + '%, ram=' + data.ram_percent + '%');

  return data;
}

/**
 * Parse batch command results into stats data structure
 * @param {Object} results - Results from execBatchInChild
 * @param {Object} childNode - Child node object
 * @returns {Object} Stats data
 */
function parseChildStatsResults(results, childNode) {
  var data = {
    cpu_percent: 0,
    ram_percent: 0,
    ram_used_mb: 0,
    ram_total_mb: 0,
    disk_percent: 0,
    disk_used_gb: 0,
    disk_total_gb: 0,
    load_1: 0,
    load_5: 0,
    load_15: 0,
    net_rx_bytes: 0,
    net_tx_bytes: 0,
    process_count: 0,
    uptime_seconds: 0,
    vms_running: 0,
    cts_running: 0,
    containers_running: 0
  };

  // Parse load average
  if (results.load && results.load.success) {
    var loadParts = results.load.stdout.trim().split(/\s+/);
    if (loadParts.length >= 3) {
      data.load_1 = parseFloat(loadParts[0]) || 0;
      data.load_5 = parseFloat(loadParts[1]) || 0;
      data.load_15 = parseFloat(loadParts[2]) || 0;
    }
  }

  // Parse memory (free -b output)
  if (results.memory && results.memory.success) {
    var memLines = results.memory.stdout.trim().split('\n');
    for (var i = 0; i < memLines.length; i++) {
      var line = memLines[i];
      if (line.indexOf('Mem:') === 0) {
        var memParts = line.split(/\s+/);
        if (memParts.length >= 3) {
          var totalBytes = parseInt(memParts[1], 10) || 0;
          var usedBytes = parseInt(memParts[2], 10) || 0;
          data.ram_total_mb = Math.round(totalBytes / 1024 / 1024);
          data.ram_used_mb = Math.round(usedBytes / 1024 / 1024);
          if (totalBytes > 0) {
            data.ram_percent = Math.round((usedBytes / totalBytes) * 100);
          }
        }
        break;
      }
    }
  }

  // Parse disk usage (df -B1 / output)
  if (results.disk && results.disk.success) {
    var diskParts = results.disk.stdout.trim().split(/\s+/);
    // df output: Filesystem 1B-blocks Used Available Use% Mounted
    if (diskParts.length >= 5) {
      var diskTotal = parseInt(diskParts[1], 10) || 0;
      var diskUsed = parseInt(diskParts[2], 10) || 0;
      data.disk_total_gb = Math.round(diskTotal / 1024 / 1024 / 1024 * 10) / 10;
      data.disk_used_gb = Math.round(diskUsed / 1024 / 1024 / 1024 * 10) / 10;
      // Parse percent from Use% column (e.g. "45%")
      var percentStr = diskParts[4].replace('%', '');
      data.disk_percent = parseInt(percentStr, 10) || 0;
    }
  }

  // Parse uptime
  if (results.uptime && results.uptime.success) {
    var uptimeOutput = results.uptime.stdout.trim();
    // Try to extract uptime from "up X days, H:M" or "up H:M"
    var upMatch = uptimeOutput.match(/up\s+(\d+)\s+day/i);
    var hourMatch = uptimeOutput.match(/up\s+(?:\d+\s+days?,\s+)?(\d+):(\d+)/);
    var seconds = 0;
    if (upMatch) {
      seconds += parseInt(upMatch[1], 10) * 86400;
    }
    if (hourMatch) {
      seconds += parseInt(hourMatch[1], 10) * 3600;
      seconds += parseInt(hourMatch[2], 10) * 60;
    }
    data.uptime_seconds = seconds;
  }

  // Parse process count
  if (results['process-count'] && results['process-count'].success) {
    var count = parseInt(results['process-count'].stdout.trim(), 10) || 0;
    data.process_count = Math.max(0, count - 1); // -1 for header line
  }

  // Estimate CPU usage from load average (load / cores * 100)
  // This is a rough estimate - real CPU% would need vmstat parsing
  var discovery = db.discovery.getByNodeId(childNode.id);
  if (discovery && discovery.cpu_cores > 0) {
    var cpuEstimate = Math.round((data.load_1 / discovery.cpu_cores) * 100);
    data.cpu_percent = Math.min(100, Math.max(0, cpuEstimate));
  }

  return data;
}

module.exports = {
  runStats: runStats,
  runStatsForChild: runStatsForChild
};

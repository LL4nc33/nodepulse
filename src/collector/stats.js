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

module.exports = {
  runStats: runStats
};

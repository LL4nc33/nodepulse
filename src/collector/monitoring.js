/**
 * Monitoring Management Module
 * Tiered polling and monitoring lifecycle
 */

'use strict';

var db = require('../db');
var TieredPoller = require('./tiered-poller');

// Active pollers (nodeId -> TieredPoller instance)
var activePollers = new Map();

/**
 * Start tiered polling for a node
 * @param {number} nodeId - Node ID
 */
function startTieredMonitoring(nodeId) {
  // Check if already running
  if (activePollers.has(nodeId)) {
    console.log('[Collector] Tiered monitoring already running for node ' + nodeId);
    return;
  }

  var node = db.nodes.getById(nodeId);
  if (!node) {
    console.error('[Collector] Cannot start monitoring: Node ' + nodeId + ' not found');
    return;
  }

  if (!node.monitoring_enabled) {
    console.log('[Collector] Monitoring disabled for node ' + nodeId);
    return;
  }

  // Get capabilities (if exists)
  var capsData = db.capabilities.get(nodeId);
  var capabilities = {};
  if (capsData && capsData.capabilities_json) {
    try {
      capabilities = JSON.parse(capsData.capabilities_json);
    } catch (err) {
      console.error('[Collector] Error parsing capabilities for node ' + nodeId + ':', err.message);
    }
  }

  // Create and start poller
  var poller = new TieredPoller(nodeId, capabilities);
  activePollers.set(nodeId, poller);
  poller.start();

  console.log('[Collector] Started tiered monitoring for node ' + nodeId + ' (' + node.name + ')');
}

/**
 * Stop tiered polling for a node
 * @param {number} nodeId - Node ID
 * @returns {Promise<void>}
 */
async function stopTieredMonitoring(nodeId) {
  var poller = activePollers.get(nodeId);
  if (poller) {
    await poller.stop();
    activePollers.delete(nodeId);
    console.log('[Collector] Stopped tiered monitoring for node ' + nodeId);
  }
}

/**
 * Start monitoring for all nodes
 */
function startAllMonitoring() {
  var nodes = db.nodes.getAll();
  nodes.forEach(function(node) {
    if (node.monitoring_enabled) {
      startTieredMonitoring(node.id);
    }
  });
  console.log('[Collector] Started monitoring for ' + activePollers.size + ' nodes');
}

/**
 * Stop all monitoring
 * @returns {Promise<void>}
 */
async function stopAllMonitoring() {
  var stopPromises = [];
  activePollers.forEach(function(poller) {
    stopPromises.push(poller.stop());
  });
  await Promise.all(stopPromises);
  activePollers.clear();
  console.log('[Collector] Stopped all monitoring');
}

/**
 * Get monitoring status
 * @returns {Array} Status array for all active pollers
 */
function getMonitoringStatus() {
  var status = [];
  activePollers.forEach(function(poller) {
    status.push(poller.getStatus());
  });
  return status;
}

/**
 * Get active pollers map (for testing)
 * @returns {Map} Active pollers
 */
function getActivePollers() {
  return activePollers;
}

module.exports = {
  startTieredMonitoring: startTieredMonitoring,
  stopTieredMonitoring: stopTieredMonitoring,
  startAllMonitoring: startAllMonitoring,
  stopAllMonitoring: stopAllMonitoring,
  getMonitoringStatus: getMonitoringStatus,
  getActivePollers: getActivePollers
};

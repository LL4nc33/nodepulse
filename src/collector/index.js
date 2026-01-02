/**
 * Collector Module - Main Entry Point
 *
 * This file serves as a facade that re-exports all collector modules.
 * The actual implementations are split into:
 *
 * - utils.js      - Shared utilities (getScript, parseScriptOutput)
 * - discovery.js  - Node discovery and auto-tagging
 * - hardware.js   - Hardware and system info collection
 * - stats.js      - System metrics (CPU, RAM, Disk, Network)
 * - docker.js     - Docker container management
 * - proxmox.js    - Proxmox VE management
 * - network.js    - Network diagnostics
 * - storage.js    - LVM, Backup, Task discovery
 * - monitoring.js - Tiered polling management
 */

'use strict';

// Import all modules
var discoveryModule = require('./discovery');
var hardwareModule = require('./hardware');
var statsModule = require('./stats');
var dockerModule = require('./docker');
var proxmoxModule = require('./proxmox');
var networkModule = require('./network');
var storageModule = require('./storage');
var monitoringModule = require('./monitoring');

// =============================================================================
// WRAPPER FUNCTIONS
// =============================================================================
// Some functions need cross-module dependencies, so we wrap them here

/**
 * Run full discovery process on a node
 * Wrapper that connects discovery with hardware collection
 */
async function runFullDiscovery(node) {
  return discoveryModule.runFullDiscovery(node, hardwareModule.runHardware);
}

/**
 * Run stats collection on a node
 * Wrapper that connects stats with full discovery for re-discovery
 */
async function runStats(node, saveHistory) {
  return statsModule.runStats(node, saveHistory, runFullDiscovery);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Discovery
  runDiscovery: discoveryModule.runDiscovery,
  runDiscoveryForChild: discoveryModule.runDiscoveryForChild,
  runFullDiscovery: runFullDiscovery,
  determineNodeType: discoveryModule.determineNodeType,
  getTagsFromDiscovery: discoveryModule.getTagsFromDiscovery,
  applyAutoTags: discoveryModule.applyAutoTags,

  // Hardware
  runHardware: hardwareModule.runHardware,
  runSystemInfo: hardwareModule.runSystemInfo,

  // Stats
  runStats: runStats,
  runStatsForChild: statsModule.runStatsForChild,

  // Docker
  runDocker: dockerModule.runDocker,
  runDockerCommand: dockerModule.runDockerCommand,

  // Proxmox
  runProxmox: proxmoxModule.runProxmox,
  runProxmoxCommand: proxmoxModule.runProxmoxCommand,
  runProxmoxResources: proxmoxModule.runProxmoxResources,

  // Network
  runNetworkDiagnostics: networkModule.runNetworkDiagnostics,
  runPingTest: networkModule.runPingTest,
  runDnsLookup: networkModule.runDnsLookup,
  runTraceroute: networkModule.runTraceroute,

  // Storage (LVM, Backup, Tasks)
  runLvmDiscovery: storageModule.runLvmDiscovery,
  runBackupDiscovery: storageModule.runBackupDiscovery,
  runTaskDiscovery: storageModule.runTaskDiscovery,
  runCommand: storageModule.runCommand,

  // Monitoring
  startTieredMonitoring: monitoringModule.startTieredMonitoring,
  stopTieredMonitoring: monitoringModule.stopTieredMonitoring,
  startAllMonitoring: monitoringModule.startAllMonitoring,
  stopAllMonitoring: monitoringModule.stopAllMonitoring,
  getMonitoringStatus: monitoringModule.getMonitoringStatus
};

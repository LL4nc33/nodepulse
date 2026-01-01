/**
 * Discovery Collector Module
 * Node discovery, type detection, and auto-tagging
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');
var utils = require('./utils');

/**
 * Run discovery on a node
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Discovery data
 */
async function runDiscovery(node) {
  var script = utils.getScript('discovery.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Discovery script failed';
    db.nodes.setOnline(node.id, false, errMsg);
    throw new Error(errMsg);
  }

  var data = utils.parseScriptOutput(result.stdout, node.name);

  // Save to database
  db.discovery.save(node.id, data);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

/**
 * Determine node type from discovery data
 * @param {Object} discoveryData - Discovery data
 * @returns {string} Node type
 */
function determineNodeType(discoveryData) {
  // Priority order for type determination
  if (discoveryData.is_proxmox_host) {
    return 'proxmox-host';
  }

  // Check virtualization type
  var virt = discoveryData.virtualization;
  if (virt === 'lxc') {
    return 'proxmox-ct';
  }
  if (virt === 'kvm' || virt === 'qemu') {
    return 'proxmox-vm';
  }
  if (virt === 'vmware') {
    return 'vmware-vm';
  }
  if (virt === 'oracle') {
    return 'virtualbox-vm';
  }

  // Check for Raspberry Pi
  if (discoveryData.is_raspberry_pi) {
    return 'raspberry-pi';
  }

  // Check for Docker host (not in a container)
  if (discoveryData.has_docker && (virt === 'none' || !virt || virt === 'unknown')) {
    return 'docker-host';
  }

  // Default to bare-metal if no virtualization detected
  if (virt === 'none' || !virt || virt === 'unknown') {
    return 'bare-metal';
  }

  return 'unknown';
}

/**
 * Get tags to apply based on discovery data
 * @param {Object} discoveryData - Discovery data
 * @returns {string[]} Array of tag names
 */
function getTagsFromDiscovery(discoveryData) {
  var tags = [];

  // Virtualization/Physical
  var virt = discoveryData.virtualization;
  if (virt === 'none' || !virt || virt === 'unknown') {
    tags.push('bare-metal');
  } else if (virt === 'kvm' || virt === 'qemu') {
    tags.push('vm');
  } else if (virt === 'lxc') {
    tags.push('container');
  }

  // Proxmox
  if (discoveryData.is_proxmox_host) {
    tags.push('proxmox');
    if (discoveryData.is_proxmox_cluster) {
      tags.push('cluster-node');
    } else {
      tags.push('standalone');
    }
  }

  // Proxmox VM/CT
  if (virt === 'kvm' || virt === 'qemu') {
    tags.push('proxmox-vm');
  } else if (virt === 'lxc') {
    tags.push('proxmox-ct');
  }

  // Container runtimes
  if (discoveryData.has_docker) {
    tags.push('docker');
  }
  if (discoveryData.has_podman) {
    tags.push('podman');
  }

  // Hardware
  if (discoveryData.is_raspberry_pi) {
    tags.push('raspberry-pi');
  }

  // Architecture
  var arch = discoveryData.arch;
  if (arch === 'x86_64' || arch === 'amd64') {
    tags.push('x86');
  } else if (arch && (arch.indexOf('arm') === 0 || arch.indexOf('aarch') === 0)) {
    tags.push('arm');
  }

  return tags;
}

/**
 * Apply auto-tags to a node based on discovery data
 * @param {number} nodeId - Node ID
 * @param {Object} discoveryData - Discovery data
 */
function applyAutoTags(nodeId, discoveryData) {
  var tagNames = getTagsFromDiscovery(discoveryData);

  for (var i = 0; i < tagNames.length; i++) {
    var tag = db.tags.getByName(tagNames[i]);
    if (tag) {
      db.tags.addToNode(nodeId, tag.id);
    }
  }
}

/**
 * Run full discovery process on a node
 * - Run discovery script
 * - Determine node type
 * - Apply auto-tags
 * - Run hardware collection
 * @param {Object} node - Node object from database
 * @param {Function} runHardware - Hardware collection function
 * @returns {Promise<Object>}
 */
async function runFullDiscovery(node, runHardware) {
  // Run discovery
  var discoveryData = await runDiscovery(node);

  // Determine and set node type
  var nodeType = determineNodeType(discoveryData);
  db.nodes.setNodeType(node.id, nodeType);

  // Apply auto-tags
  applyAutoTags(node.id, discoveryData);

  // Run hardware collection
  var hardwareData = null;
  var hardwareError = null;
  try {
    hardwareData = await runHardware(node);
  } catch (err) {
    hardwareError = err.message;
    console.error('[COLLECTOR] Hardware collection failed for ' + node.name + ':', err.message);
  }

  return {
    discovery: discoveryData,
    hardware: hardwareData,
    hardwareError: hardwareError,
    nodeType: nodeType
  };
}

module.exports = {
  runDiscovery: runDiscovery,
  determineNodeType: determineNodeType,
  getTagsFromDiscovery: getTagsFromDiscovery,
  applyAutoTags: applyAutoTags,
  runFullDiscovery: runFullDiscovery
};

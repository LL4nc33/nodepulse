/**
 * Discovery Collector Module
 * Node discovery, type detection, and auto-tagging
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');
var utils = require('./utils');
var childCollector = require('./child-collector');
var validators = require('../lib/validators');

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
 * Run discovery for a child node (VM/LXC) via parent host
 * Uses pct exec (LXC) or qm guest exec (VM) instead of direct SSH
 *
 * @param {Object} childNode - Child node object (must have parent_id, guest_vmid, guest_type)
 * @returns {Promise<Object>} Discovery data
 */
async function runDiscoveryForChild(childNode) {
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

  console.log('[DISCOVERY] Running child discovery for ' + childNode.name +
              ' (' + childNode.guest_type + ' ' + childNode.guest_vmid + ') via ' + parent.name);

  // Commands to run for discovery (including IP for guest_ip column)
  var commands = ['hostname', 'os-release', 'uname', 'cpu-info', 'mem-info',
                  'df', 'docker-check', 'systemd-check', 'kernel-version', 'get-ip'];

  // Execute commands via pct/qm exec
  var batchResult = await childCollector.execBatchInChild(
    parent,
    childNode.guest_vmid,
    childNode.guest_type,
    commands,
    { timeout: 60000 }
  );

  if (!batchResult.success) {
    db.nodes.setOnline(childNode.id, false, batchResult.error);
    throw new Error('Child discovery failed: ' + batchResult.error);
  }

  // Parse results into discovery data structure
  var data = parseChildDiscoveryResults(batchResult.results, childNode);

  // Save to database
  db.discovery.save(childNode.id, data);

  // Extract and save guest IP (for display instead of host IP)
  var guestIp = null;
  if (batchResult.results['get-ip'] && batchResult.results['get-ip'].success) {
    var rawIp = batchResult.results['get-ip'].stdout.trim();
    // Validate IP format before saving (security: prevent injection via SSH output)
    if (rawIp && validators.isValidIP(rawIp)) {
      guestIp = rawIp;
      try {
        db.nodes.setGuestIp(childNode.id, guestIp);
        console.log('[DISCOVERY] Set guest_ip for ' + childNode.name + ': ' + guestIp);
      } catch (err) {
        console.error('[DISCOVERY] Failed to save guest_ip:', err.message);
      }
    } else if (rawIp) {
      console.warn('[DISCOVERY] Invalid IP format for ' + childNode.name + ': ' + rawIp.substring(0, 50));
    }
  }

  // Update node online status
  db.nodes.setOnline(childNode.id, true);

  console.log('[DISCOVERY] Child discovery complete for ' + childNode.name +
              ': hostname=' + data.hostname + ', docker=' + data.has_docker + ', ip=' + (guestIp || 'n/a'));

  return data;
}

/**
 * Parse batch command results into discovery data structure
 * @param {Object} results - Results from execBatchInChild
 * @param {Object} childNode - Child node object
 * @returns {Object} Discovery data
 */
function parseChildDiscoveryResults(results, childNode) {
  var data = {
    hostname: '',
    os_name: 'Linux',
    os_version: '',
    os_pretty: '',
    arch: '',
    kernel: '',
    cpu_cores: 0,
    ram_total_mb: 0,
    has_docker: 0,
    has_podman: 0,
    has_systemd: 0,
    is_proxmox_host: 0,
    is_raspberry_pi: 0,
    virtualization: childNode.guest_type === 'lxc' ? 'lxc' : 'kvm',
    discovered_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
  };

  // Parse hostname
  if (results.hostname && results.hostname.success) {
    data.hostname = results.hostname.stdout.trim();
  }

  // Parse os-release
  if (results['os-release'] && results['os-release'].success) {
    var osRelease = results['os-release'].stdout;
    var nameMatch = osRelease.match(/^NAME="?([^"\n]+)"?/m);
    var versionMatch = osRelease.match(/^VERSION_ID="?([^"\n]+)"?/m);
    var prettyMatch = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m);

    if (nameMatch) data.os_name = nameMatch[1];
    if (versionMatch) data.os_version = versionMatch[1];
    if (prettyMatch) data.os_pretty = prettyMatch[1];
  }

  // Parse uname
  if (results.uname && results.uname.success) {
    var uname = results.uname.stdout.trim();
    var parts = uname.split(' ');
    if (parts.length >= 3) {
      data.kernel = parts[2];  // Kernel version is usually 3rd field
    }
    // Architecture is usually last field
    var archPart = parts[parts.length - 1];
    if (archPart) {
      data.arch = archPart;
    }
  }

  // Parse kernel-version (more reliable)
  if (results['kernel-version'] && results['kernel-version'].success) {
    data.kernel = results['kernel-version'].stdout.trim();
  }

  // Parse cpu-info
  if (results['cpu-info'] && results['cpu-info'].success) {
    var cpuInfo = results['cpu-info'].stdout;
    var processorMatches = cpuInfo.match(/^processor\s*:/gm);
    if (processorMatches) {
      data.cpu_cores = processorMatches.length;
    }
  }

  // Parse mem-info
  if (results['mem-info'] && results['mem-info'].success) {
    var memInfo = results['mem-info'].stdout;
    var memMatch = memInfo.match(/^MemTotal:\s*(\d+)/m);
    if (memMatch) {
      // meminfo is in kB, convert to MB
      data.ram_total_mb = Math.round(parseInt(memMatch[1], 10) / 1024);
    }
  }

  // Check for docker
  if (results['docker-check'] && results['docker-check'].success) {
    data.has_docker = results['docker-check'].stdout.indexOf('HAS_DOCKER') !== -1 ? 1 : 0;
  }

  // Check for systemd
  if (results['systemd-check'] && results['systemd-check'].success) {
    data.has_systemd = results['systemd-check'].stdout.indexOf('HAS_SYSTEMD') !== -1 ? 1 : 0;
  }

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
  if (tagNames.length === 0) return;

  // Pre-fetch all tags once (N+1 fix: 1 query instead of N)
  var allTags = db.tags.getAll();
  var tagMap = {};
  for (var i = 0; i < allTags.length; i++) {
    tagMap[allTags[i].name] = allTags[i].id;
  }

  // Apply tags using cached lookup
  for (var j = 0; j < tagNames.length; j++) {
    var tagId = tagMap[tagNames[j]];
    if (tagId) {
      db.tags.addToNode(nodeId, tagId);
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
  runDiscoveryForChild: runDiscoveryForChild,
  determineNodeType: determineNodeType,
  getTagsFromDiscovery: getTagsFromDiscovery,
  applyAutoTags: applyAutoTags,
  runFullDiscovery: runFullDiscovery
};

/**
 * Discovery Orchestrator
 *
 * Petra's Architecture: SEPARATE class from ProxmoxPoller (Single Responsibility)
 *
 * Responsibilities:
 * 1. Sync VMs/LXCs from Proxmox as child nodes in the nodes table
 * 2. Create new child nodes when VMs/LXCs are discovered
 * 3. Update child node status based on Proxmox data
 * 4. Clean up orphaned children (removed VMs/LXCs)
 *
 * This class is called AFTER ProxmoxPoller syncs VM/CT data to proxmox_vms/proxmox_cts tables.
 * It then creates/updates corresponding entries in the nodes table.
 */

'use strict';

var db = require('../db');
var childCollector = require('./child-collector');
var validators = require('../lib/validators');

/**
 * DiscoveryOrchestrator - Manages child node discovery and sync
 * @param {number} hostNodeId - Proxmox host node ID
 */
function DiscoveryOrchestrator(hostNodeId) {
  this.hostNodeId = hostNodeId;
  this.lastSyncTime = null;
  this.stats = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: []
  };
}

/**
 * Check if auto-discovery is enabled for this host
 * @returns {boolean} True if enabled
 */
DiscoveryOrchestrator.prototype.isEnabled = function() {
  // Check global setting
  var globalEnabled = db.settings.get('auto_create_child_nodes', '0');
  if (globalEnabled !== '1') {
    return false;
  }

  // Check node-level setting (if exists)
  var node = db.nodes.getById(this.hostNodeId);
  if (!node) return false;

  // auto_discovery column on node level
  return node.auto_discovery === 1;
};

/**
 * Sync all VMs and LXCs from Proxmox as child nodes
 * Main entry point - call this after ProxmoxPoller.poll()
 *
 * @returns {Promise<Object>} Sync result with counts
 */
DiscoveryOrchestrator.prototype.syncChildNodes = async function() {
  this.stats = { created: 0, updated: 0, deleted: 0, errors: [] };

  if (!this.isEnabled()) {
    return { skipped: true, reason: 'Auto-discovery disabled' };
  }

  try {
    // Get current Proxmox data (already synced by ProxmoxPoller)
    var proxmoxData = db.proxmox.getAllForNode(this.hostNodeId);

    // Sync VMs
    if (proxmoxData.vms && proxmoxData.vms.length > 0) {
      await this.syncGuests(proxmoxData.vms, 'vm');
    }

    // Sync CTs (LXCs)
    if (proxmoxData.cts && proxmoxData.cts.length > 0) {
      await this.syncGuests(proxmoxData.cts, 'lxc');
    }

    // Cleanup orphaned children
    this.cleanupOrphanedChildren(proxmoxData);

    this.lastSyncTime = Date.now();

    return {
      success: true,
      created: this.stats.created,
      updated: this.stats.updated,
      deleted: this.stats.deleted,
      errors: this.stats.errors
    };
  } catch (err) {
    console.error('[DiscoveryOrchestrator] Sync failed for host ' + this.hostNodeId + ':', err.message);
    return {
      success: false,
      error: err.message,
      created: this.stats.created,
      updated: this.stats.updated,
      deleted: this.stats.deleted,
      errors: this.stats.errors.concat([err.message])
    };
  }
};

/**
 * Sync guests (VMs or CTs) as child nodes
 * N+1 Fix: Cache all children once instead of querying per guest
 *
 * @param {Array} guests - Array of VM/CT objects from proxmox_vms/proxmox_cts
 * @param {string} type - 'vm' or 'lxc'
 */
DiscoveryOrchestrator.prototype.syncGuests = async function(guests, type) {
  var self = this;

  // N+1 Fix: Load all existing children once (1 query instead of N)
  var existingChildren = db.nodes.getChildren(this.hostNodeId);
  var childMap = {};
  for (var i = 0; i < existingChildren.length; i++) {
    var c = existingChildren[i];
    if (c.guest_type === type && c.guest_vmid) {
      childMap[c.guest_vmid] = c;
    }
  }

  for (var j = 0; j < guests.length; j++) {
    var guest = guests[j];
    try {
      var vmid = type === 'vm' ? guest.vmid : guest.ctid;

      // O(1) lookup instead of O(N) query
      var existing = childMap[vmid];

      if (existing) {
        // Update existing child node status (async for IP retrieval)
        await self.updateChildNode(existing, guest);
        self.stats.updated++;
      } else {
        // Create new child node (async for IP retrieval)
        await self.createChildNode(guest, type);
        self.stats.created++;
      }
    } catch (err) {
      self.stats.errors.push('Failed to sync ' + type + ' ' + (guest.vmid || guest.ctid) + ': ' + err.message);
    }
  }
};

/**
 * Create a new child node from Proxmox guest
 * Fetches guest IP immediately if guest is running
 *
 * @param {Object} guest - VM/CT object
 * @param {string} type - 'vm' or 'lxc'
 * @returns {Promise<number>} New node ID
 */
DiscoveryOrchestrator.prototype.createChildNode = async function(guest, type) {
  var vmid = type === 'vm' ? guest.vmid : guest.ctid;
  var name = guest.name || (type + '-' + vmid);

  // Get guest IP if running (async)
  var guestIp = null;
  if (guest.status === 'running') {
    try {
      var hostNode = db.nodes.getByIdWithCredentials(this.hostNodeId);
      if (hostNode) {
        var ipResult = await childCollector.getGuestIpFromHost(hostNode, vmid, type);
        if (ipResult.success && ipResult.ip && validators.isValidIP(ipResult.ip)) {
          guestIp = ipResult.ip;
        }
      }
    } catch (err) {
      console.warn('[DiscoveryOrchestrator] Failed to get IP for ' + name + ':', err.message);
    }
  }

  console.log('[DiscoveryOrchestrator] Creating child node: ' + name +
              ' (' + type + ' ' + vmid + ') IP: ' + (guestIp || 'pending'));

  var nodeId = db.nodes.createChildFromProxmox(this.hostNodeId, {
    name: name,
    guest_vmid: vmid,
    guest_type: type,
    guest_ip: guestIp,
    node_type: type === 'vm' ? 'proxmox-vm' : 'proxmox-lxc'
  });

  // Set initial online status based on Proxmox status
  db.nodes.updateChildStatus(nodeId, guest.status);

  return nodeId;
};

/**
 * Update an existing child node from Proxmox data
 * @param {Object} childNode - Existing node from nodes table
 * @param {Object} guest - Updated VM/CT data from Proxmox
 */
DiscoveryOrchestrator.prototype.updateChildNode = async function(childNode, guest) {
  // Update online status based on Proxmox status
  db.nodes.updateChildStatus(childNode.id, guest.status);

  // Update name if changed (and not manually renamed)
  if (guest.name && guest.name !== childNode.name) {
    // Only update if the current name looks auto-generated
    var autoNamePattern = /^(vm|lxc)-\d+$/;
    if (autoNamePattern.test(childNode.name)) {
      db.nodes.update(childNode.id, {
        name: guest.name,
        host: childNode.host,
        ssh_port: childNode.ssh_port,
        ssh_user: childNode.ssh_user,
        monitoring_enabled: childNode.monitoring_enabled,
        monitoring_interval: childNode.monitoring_interval
      });
    }
  }

  // Fetch IP if missing and guest is running
  if (!childNode.guest_ip && guest.status === 'running') {
    try {
      var hostNode = db.nodes.getByIdWithCredentials(this.hostNodeId);
      if (hostNode) {
        var vmid = childNode.guest_vmid;
        var type = childNode.guest_type;
        var ipResult = await childCollector.getGuestIpFromHost(hostNode, vmid, type);
        if (ipResult.success && ipResult.ip && validators.isValidIP(ipResult.ip)) {
          db.nodes.setGuestIp(childNode.id, ipResult.ip);
          console.log('[DiscoveryOrchestrator] Updated guest_ip for ' + childNode.name + ': ' + ipResult.ip);
        }
      }
    } catch (err) {
      console.warn('[DiscoveryOrchestrator] Failed to get IP for ' + childNode.name + ':', err.message);
    }
  }
};

/**
 * Clean up orphaned child nodes (VMs/LXCs that no longer exist in Proxmox)
 * @param {Object} proxmoxData - Current Proxmox data
 */
DiscoveryOrchestrator.prototype.cleanupOrphanedChildren = function(proxmoxData) {
  var self = this;

  // Get current VMIDs from Proxmox
  var currentVmids = (proxmoxData.vms || []).map(function(vm) { return vm.vmid; });
  var currentCtids = (proxmoxData.cts || []).map(function(ct) { return ct.ctid; });

  // Find orphaned VM children
  var orphanedVMs = db.nodes.getOrphanedChildren(this.hostNodeId, currentVmids, 'vm');
  orphanedVMs.forEach(function(orphan) {
    self.handleOrphanedChild(orphan);
  });

  // Find orphaned LXC children
  var orphanedCTs = db.nodes.getOrphanedChildren(this.hostNodeId, currentCtids, 'lxc');
  orphanedCTs.forEach(function(orphan) {
    self.handleOrphanedChild(orphan);
  });
};

/**
 * Handle an orphaned child node
 * Strategy: Mark offline with error, don't auto-delete (user might want data)
 *
 * @param {Object} orphan - Orphaned child node
 */
DiscoveryOrchestrator.prototype.handleOrphanedChild = function(orphan) {
  console.log('[DiscoveryOrchestrator] Guest ' + orphan.guest_vmid + ' no longer exists, marking ' + orphan.name + ' offline');

  try {
    // Mark as offline with informative message
    db.nodes.setOnline(orphan.id, false, 'VM/LXC no longer exists on Proxmox host');

    // Optionally: auto-delete after a grace period?
    // For now, just mark offline - user can delete manually
    this.stats.deleted++;
  } catch (err) {
    this.stats.errors.push('Failed to handle orphan ' + orphan.name + ': ' + err.message);
  }
};

/**
 * Force sync a single guest (manual trigger)
 * @param {number} vmid - VM/CT ID
 * @param {string} type - 'vm' or 'lxc'
 * @returns {Promise<Object>} Result
 */
DiscoveryOrchestrator.prototype.syncSingleGuest = async function(vmid, type) {
  try {
    // Get guest from Proxmox data
    var guest = type === 'vm'
      ? db.proxmox.getVM(this.hostNodeId, vmid)
      : db.proxmox.getCT(this.hostNodeId, vmid);

    if (!guest) {
      return { success: false, error: 'Guest not found in Proxmox data' };
    }

    var existing = db.nodes.getByGuestId(this.hostNodeId, vmid, type);

    if (existing) {
      this.updateChildNode(existing, guest);
      return { success: true, action: 'updated', nodeId: existing.id };
    } else {
      var nodeId = await this.createChildNode(guest, type);
      return { success: true, action: 'created', nodeId: nodeId };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * Get discovery status for this host
 * @returns {Object} Status info
 */
DiscoveryOrchestrator.prototype.getStatus = function() {
  var childNodes = db.nodes.getChildren(this.hostNodeId);
  var vmChildren = childNodes.filter(function(n) { return n.guest_type === 'vm'; });
  var lxcChildren = childNodes.filter(function(n) { return n.guest_type === 'lxc'; });

  return {
    hostNodeId: this.hostNodeId,
    enabled: this.isEnabled(),
    lastSyncTime: this.lastSyncTime,
    childNodes: {
      total: childNodes.length,
      vms: vmChildren.length,
      lxcs: lxcChildren.length,
      online: childNodes.filter(function(n) { return n.online === 1; }).length
    }
  };
};

// =============================================================================
// Factory and Static Methods
// =============================================================================

// Cache of orchestrators by host node ID
var orchestrators = new Map();

/**
 * Get or create DiscoveryOrchestrator for a host
 * @param {number} hostNodeId - Host node ID
 * @returns {DiscoveryOrchestrator}
 */
function getOrchestrator(hostNodeId) {
  if (!orchestrators.has(hostNodeId)) {
    orchestrators.set(hostNodeId, new DiscoveryOrchestrator(hostNodeId));
  }
  return orchestrators.get(hostNodeId);
}

/**
 * Sync all Proxmox hosts' children
 * Called periodically or after ProxmoxPoller updates
 * @returns {Promise<Object>} Combined results
 */
async function syncAllHosts() {
  var results = {
    hosts: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    errors: []
  };

  try {
    // Find all Proxmox hosts
    var nodes = db.nodes.getAll();
    var proxmoxHosts = nodes.filter(function(n) {
      var discovery = db.discovery.get(n.id);
      return discovery && discovery.is_proxmox_host === 1;
    });

    // Process hosts sequentially (to avoid overwhelming SSH)
    for (var i = 0; i < proxmoxHosts.length; i++) {
      var host = proxmoxHosts[i];
      var orchestrator = getOrchestrator(host.id);
      var result = await orchestrator.syncChildNodes();

      if (!result.skipped) {
        results.hosts++;
        results.created += result.created || 0;
        results.updated += result.updated || 0;
        results.deleted += result.deleted || 0;
        if (result.errors) {
          results.errors = results.errors.concat(result.errors);
        }
      }
    }

    return results;
  } catch (err) {
    results.errors.push('syncAllHosts failed: ' + err.message);
    return results;
  }
}

/**
 * Clear orchestrator cache
 */
function clearCache() {
  orchestrators.clear();
}

module.exports = {
  // Class
  DiscoveryOrchestrator: DiscoveryOrchestrator,

  // Factory
  getOrchestrator: getOrchestrator,

  // Static methods
  syncAllHosts: syncAllHosts,
  clearCache: clearCache
};

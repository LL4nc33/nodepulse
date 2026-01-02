/**
 * Proxmox Poller
 * Lightweight polling for VM/CT status updates
 * Separate class following Single Responsibility Principle
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');

var POLL_INTERVAL = 30000; // 30 seconds

/**
 * ProxmoxPoller - Polls Proxmox VM/CT status independently
 * @param {number} nodeId - Node ID to poll
 */
function ProxmoxPoller(nodeId) {
  this.nodeId = nodeId;
  this.timer = null;
  this.running = false;
  this.lastError = null;
}

/**
 * Start polling
 */
ProxmoxPoller.prototype.start = function() {
  if (this.timer) return;
  console.log('[ProxmoxPoller] Starting for node ' + this.nodeId);
  this.poll();
  var self = this;
  this.timer = setInterval(function() { self.poll(); }, POLL_INTERVAL);
};

/**
 * Stop polling
 */
ProxmoxPoller.prototype.stop = function() {
  if (this.timer) {
    clearInterval(this.timer);
    this.timer = null;
  }
  console.log('[ProxmoxPoller] Stopped for node ' + this.nodeId);
};

/**
 * Execute poll (single SSH call with all commands)
 */
ProxmoxPoller.prototype.poll = async function() {
  if (this.running) return;
  this.running = true;

  try {
    var node = db.nodes.getByIdWithCredentials(this.nodeId);
    if (!node || !node.monitoring_enabled) {
      this.running = false;
      return;
    }

    // Combined command: 1 SSH call instead of 3 (performance optimization)
    var cmd = 'echo "===QM===" && qm list 2>/dev/null || true && ' +
              'echo "===PCT===" && pct list 2>/dev/null || true && ' +
              'echo "===ST===" && pvesm status 2>/dev/null || true';

    var result = await ssh.controlMaster.execute(node, cmd, {
      timeout: 10000,
      silent: true
    });

    if (result && result.stdout) {
      var data = this.parseOutput(result.stdout);
      if (data) {
        // Use syncFromPoller to add/remove/update VMs and CTs
        db.proxmox.syncFromPoller(this.nodeId, data);
      }
    }

    this.lastError = null;
  } catch (err) {
    console.error('[ProxmoxPoller] Error for node ' + this.nodeId + ':', err.message);
    this.lastError = err.message;
  } finally {
    this.running = false;
  }
};

/**
 * Parse combined output from qm list, pct list, pvesm status
 * @param {string} stdout - Combined command output
 * @returns {Object} Parsed data with vms and cts arrays (includes name for sync)
 */
ProxmoxPoller.prototype.parseOutput = function(stdout) {
  var data = { vms: [], cts: [] };

  try {
    var sections = stdout.split(/===(\w+)===/);

    for (var i = 0; i < sections.length; i++) {
      // Parse qm list output (VMs)
      // Format: VMID NAME STATUS MEM(MB) BOOTDISK(GB) PID
      if (sections[i] === 'QM' && sections[i + 1]) {
        var vmLines = sections[i + 1].trim().split('\n').slice(1); // Skip header
        for (var j = 0; j < vmLines.length; j++) {
          var vmParts = vmLines[j].trim().split(/\s+/);
          if (vmParts.length >= 3 && !isNaN(parseInt(vmParts[0], 10))) {
            data.vms.push({
              vmid: parseInt(vmParts[0], 10),
              name: vmParts[1] || null,
              status: vmParts[2].toLowerCase()
            });
          }
        }
      }

      // Parse pct list output (CTs)
      // Format: VMID Status Lock Name
      if (sections[i] === 'PCT' && sections[i + 1]) {
        var ctLines = sections[i + 1].trim().split('\n').slice(1); // Skip header
        for (var k = 0; k < ctLines.length; k++) {
          var ctParts = ctLines[k].trim().split(/\s+/);
          if (ctParts.length >= 2 && !isNaN(parseInt(ctParts[0], 10))) {
            // pct list: VMID Status [Lock] Name - Name kann an Position 2 oder 3 sein
            var ctName = ctParts.length >= 4 ? ctParts[3] : (ctParts.length >= 3 ? ctParts[2] : null);
            // Wenn ctParts[2] "running" oder "stopped" ist, dann ist es kein Lock
            if (ctName === 'running' || ctName === 'stopped') {
              ctName = null;
            }
            data.cts.push({
              ctid: parseInt(ctParts[0], 10),
              name: ctName,
              status: ctParts[1].toLowerCase()
            });
          }
        }
      }
    }

    return data;
  } catch (err) {
    console.error('[ProxmoxPoller] Parse error:', err.message);
    return null;
  }
};

module.exports = ProxmoxPoller;

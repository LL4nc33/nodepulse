/**
 * Proxmox Collector Module
 * Proxmox VE management (VMs, CTs, Storage)
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');
var utils = require('./utils');

// Whitelist of allowed Proxmox commands and subcommands
var ALLOWED_PROXMOX_COMMANDS = {
  'qm': ['list', 'status', 'config', 'start', 'stop', 'shutdown', 'reset', 'suspend', 'resume',
         'clone', 'template', 'set', 'snapshot', 'listsnapshot', 'rollback', 'delsnapshot',
         'resize', 'migrate', 'pending', 'cloudinit'],
  'pct': ['list', 'status', 'config', 'start', 'stop', 'shutdown', 'reboot',
          'clone', 'template', 'set', 'snapshot', 'listsnapshot', 'rollback', 'delsnapshot',
          'resize', 'migrate', 'pending'],
  'pvesm': ['list', 'status', 'alloc', 'free', 'scan', 'nfsscan', 'cifsscan'],
  'pveam': ['list', 'available', 'download', 'remove'],
  'pvesh': ['get', 'ls']
};

/**
 * Run Proxmox collection on a node
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Proxmox data (vms, cts, storage, snapshots)
 */
async function runProxmox(node) {
  var script = utils.getScript('proxmox.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 120000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Proxmox script failed';
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

  // Check for error in response
  if (data.error) {
    throw new Error(data.error);
  }

  // Save to database
  db.proxmox.saveAll(node.id, data);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

/**
 * Execute a Proxmox command on a node
 * @param {Object} node - Node object from database
 * @param {string} command - Proxmox command to execute (qm, pct, pvesm, pveam, pvesh)
 * @param {number} timeout - Timeout in ms (default: 60000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runProxmoxCommand(node, command, timeout) {
  timeout = timeout || 60000;

  // Validate command starts with allowed prefix
  var allowedPrefixes = ['qm ', 'pct ', 'pvesm ', 'pveam ', 'pvesh '];
  var isAllowed = allowedPrefixes.some(function(prefix) {
    return command.indexOf(prefix) === 0;
  });

  if (!isAllowed) {
    throw new Error('Command must start with one of: qm, pct, pvesm, pveam, pvesh');
  }

  // Check for dangerous metacharacters
  if (/[;&|`$()><\n\r]/.test(command)) {
    throw new Error('Command contains forbidden characters');
  }

  // Extract and validate subcommand
  var parts = command.trim().split(/\s+/);
  var mainCmd = parts[0];
  var subCmd = parts[1];

  if (ALLOWED_PROXMOX_COMMANDS[mainCmd] && ALLOWED_PROXMOX_COMMANDS[mainCmd].indexOf(subCmd) === -1) {
    throw new Error('Proxmox subcommand not allowed: ' + mainCmd + ' ' + subCmd);
  }

  var result = await ssh.execute(node, command, timeout);
  return result;
}

/**
 * Run Proxmox resources collection on a node
 * Collects ISOs, CT templates, storage pools, and network bridges for VM/CT creation
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Proxmox resources (isos, templates, storage, bridges, nextid)
 */
async function runProxmoxResources(node) {
  var script = utils.getScript('proxmox-resources.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Proxmox resources script failed';
    throw new Error(errMsg);
  }

  var data = utils.parseScriptOutput(result.stdout, node.name);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

module.exports = {
  runProxmox: runProxmox,
  runProxmoxCommand: runProxmoxCommand,
  runProxmoxResources: runProxmoxResources,
  ALLOWED_PROXMOX_COMMANDS: ALLOWED_PROXMOX_COMMANDS
};

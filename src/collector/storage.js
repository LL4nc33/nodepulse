/**
 * Storage Collector Module
 * LVM, Backup, and Task discovery
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');
var utils = require('./utils');

/**
 * Run LVM discovery on a node
 * Collects PVs, VGs, LVs, Thin Pools, Proxmox storages, and available disks
 * @param {Object} node - Node object from database (must have credentials)
 * @returns {Promise<Object>} LVM data
 */
async function runLvmDiscovery(node) {
  var script = utils.getScript('lvm-discovery.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'LVM discovery script failed';
    throw new Error(errMsg);
  }

  var data;
  try {
    data = utils.parseScriptOutput(result.stdout, node.name);
  } catch (err) {
    throw new Error('LVM Discovery: Invalid JSON response - ' + err.message);
  }

  // Save PVs to database
  if (data.pvs && data.pvs.report && data.pvs.report[0]) {
    db.lvm.savePVs(node.id, data.pvs.report[0].pv || []);
  } else {
    db.lvm.savePVs(node.id, []);
  }

  // Save VGs to database
  if (data.vgs && data.vgs.report && data.vgs.report[0]) {
    db.lvm.saveVGs(node.id, data.vgs.report[0].vg || []);
  } else {
    db.lvm.saveVGs(node.id, []);
  }

  // Save LVs to database
  if (data.lvs && data.lvs.report && data.lvs.report[0]) {
    db.lvm.saveLVs(node.id, data.lvs.report[0].lv || []);
  } else {
    db.lvm.saveLVs(node.id, []);
  }

  // Save available disks to database
  if (data.available_disks && Array.isArray(data.available_disks)) {
    db.lvm.saveAvailableDisks(node.id, data.available_disks);
  } else {
    db.lvm.saveAvailableDisks(node.id, []);
  }

  // Match Proxmox storage config to VGs/Pools
  if (data.proxmox_storage_config && Array.isArray(data.proxmox_storage_config)) {
    data.proxmox_storage_config.forEach(function(storage) {
      if (storage.type === 'lvm' && storage.vgname) {
        db.lvm.setVGRegistration(node.id, storage.vgname, storage.storage, 'lvm');
      } else if (storage.type === 'lvmthin' && storage.vgname && storage.thinpool) {
        db.lvm.setLVRegistration(node.id, storage.vgname, storage.thinpool, storage.storage, 'lvmthin');
      }
    });
  }

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

/**
 * Run Backup discovery on a Proxmox node
 * Collects backup storages, vzdump backups, and backup jobs
 * @param {Object} node - Node object from database (must have credentials)
 * @returns {Promise<Object>} Backup data
 */
async function runBackupDiscovery(node) {
  var script = utils.getScript('backup-discovery.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 120000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Backup discovery script failed';
    throw new Error(errMsg);
  }

  var data;
  try {
    data = utils.parseScriptOutput(result.stdout, node.name);
  } catch (err) {
    throw new Error('Backup Discovery: Invalid JSON response - ' + err.message);
  }

  // Save backup storages to database
  if (data.storages && Array.isArray(data.storages)) {
    db.backups.saveBackupStorages(node.id, data.storages);
  } else {
    db.backups.saveBackupStorages(node.id, []);
  }

  // Save backups to database
  if (data.backups && Array.isArray(data.backups)) {
    db.backups.saveBackups(node.id, data.backups);
  } else {
    db.backups.saveBackups(node.id, []);
  }

  // Save backup jobs to database
  if (data.jobs && Array.isArray(data.jobs)) {
    db.backups.saveBackupJobs(node.id, data.jobs);
  } else {
    db.backups.saveBackupJobs(node.id, []);
  }

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

/**
 * Run Task discovery on a Proxmox node
 * Collects task history (completed and running tasks)
 * @param {Object} node - Node object from database (must have credentials)
 * @returns {Promise<Object>} Task data
 */
async function runTaskDiscovery(node) {
  var script = utils.getScript('task-discovery.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 120000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Task discovery script failed';
    throw new Error(errMsg);
  }

  var data;
  try {
    data = utils.parseScriptOutput(result.stdout, node.name);
  } catch (err) {
    throw new Error('Task Discovery: Invalid JSON response - ' + err.message);
  }

  // Merge completed tasks and running tasks
  var allTasks = [];

  if (data.tasks && Array.isArray(data.tasks)) {
    allTasks = allTasks.concat(data.tasks);
  }

  if (data.running && Array.isArray(data.running)) {
    // Add running tasks (avoid duplicates by checking UPID)
    var existingUpids = {};
    for (var i = 0; i < allTasks.length; i++) {
      existingUpids[allTasks[i].upid] = true;
    }
    for (var j = 0; j < data.running.length; j++) {
      if (!existingUpids[data.running[j].upid]) {
        allTasks.push(data.running[j]);
      }
    }
  }

  // Save tasks to database
  db.tasks.saveTasks(node.id, allTasks);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return {
    tasks: allTasks,
    counts: db.tasks.getTaskCounts(node.id, node.name)
  };
}

/**
 * Run a generic command on a node via SSH
 * Used for LVM and other storage operations
 * SECURITY: Only call this from API routes that have validated the command!
 * @param {Object} node - Node object from database (must have credentials)
 * @param {string} command - Command to execute
 * @param {number} timeout - Timeout in ms (default: 60000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runCommand(node, command, timeout) {
  timeout = timeout || 60000;

  // Basic safety check - block obvious shell injection
  if (/[;&|`$()><\n\r]/.test(command)) {
    throw new Error('Command contains forbidden characters');
  }

  var result = await ssh.execute(node, command, timeout);
  return result;
}

module.exports = {
  runLvmDiscovery: runLvmDiscovery,
  runBackupDiscovery: runBackupDiscovery,
  runTaskDiscovery: runTaskDiscovery,
  runCommand: runCommand
};

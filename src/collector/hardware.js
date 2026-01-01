/**
 * Hardware Collector Module
 * Hardware detection and system info collection
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');
var utils = require('./utils');
var statsRouter = require('../routes/api/stats');

/**
 * Run hardware collection on a node
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Hardware data
 */
async function runHardware(node) {
  var script = utils.getScript('hardware.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 120000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Hardware script failed';
    throw new Error(errMsg);
  }

  var data = utils.parseScriptOutput(result.stdout, node.name);

  // Save to database
  db.hardware.save(node.id, data);

  // Invalidate metadata hash cache (TOON integration)
  // Hardware changed → metadata hash must be recalculated
  statsRouter.clearMetadataHashCache(node.id);

  return data;
}

/**
 * Run comprehensive system info collection on a node
 * Collects ALL available system information
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Comprehensive system info
 */
async function runSystemInfo(node) {
  var script = utils.getScript('system-info.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 120000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'System info script failed';
    throw new Error(errMsg);
  }

  var data = utils.parseScriptOutput(result.stdout, node.name);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

module.exports = {
  runHardware: runHardware,
  runSystemInfo: runSystemInfo
};

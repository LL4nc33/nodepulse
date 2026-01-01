/**
 * Docker Collector Module
 * Docker container and image management
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');
var utils = require('./utils');

// Whitelist of allowed Docker subcommands (security hardening)
var ALLOWED_DOCKER_COMMANDS = [
  'ps', 'stats', 'inspect', 'logs', 'images', 'volume', 'network',
  'start', 'stop', 'restart', 'pause', 'unpause', 'kill',
  'pull', 'exec', 'top', 'port', 'info', 'version'
];

/**
 * Run Docker collection on a node
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Docker data (containers, images, volumes, networks)
 */
async function runDocker(node) {
  var script = utils.getScript('docker.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Docker script failed';
    throw new Error(errMsg);
  }

  var data = utils.parseScriptOutput(result.stdout, node.name);

  // Check for error in response
  if (data.error) {
    throw new Error(data.error);
  }

  // Save to database
  db.docker.saveAll(node.id, data);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

/**
 * Execute a Docker command on a node
 * @param {Object} node - Node object from database
 * @param {string} command - Docker command to execute
 * @param {number} timeout - Timeout in ms (default: 30000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runDockerCommand(node, command, timeout) {
  timeout = timeout || 30000;

  // Validate command starts with docker
  if (command.indexOf('docker ') !== 0) {
    throw new Error('Command must start with "docker "');
  }

  // Extract subcommand (second word after 'docker ')
  var parts = command.substring(7).trim().split(/\s+/);
  var subcommand = parts[0];

  if (ALLOWED_DOCKER_COMMANDS.indexOf(subcommand) === -1) {
    throw new Error('Docker subcommand not allowed: ' + subcommand);
  }

  // Check for dangerous metacharacters in the entire command
  if (/[;&|`$()><\n\r\\]/.test(command)) {
    throw new Error('Command contains forbidden characters');
  }

  var result = await ssh.execute(node, command, timeout);
  return result;
}

module.exports = {
  runDocker: runDocker,
  runDockerCommand: runDockerCommand,
  ALLOWED_DOCKER_COMMANDS: ALLOWED_DOCKER_COMMANDS
};

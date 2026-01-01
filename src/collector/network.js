/**
 * Network Collector Module
 * Network diagnostics and connectivity tests
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');
var utils = require('./utils');

/**
 * Validate and sanitize network target (IP or hostname)
 * Uses whitelist approach - only allows safe characters
 * @param {string} target - IP or hostname
 * @returns {string} - Sanitized target or throws error
 */
function validateNetworkTarget(target) {
  if (!target || typeof target !== 'string') {
    throw new Error('Target is required');
  }

  // Trim and convert to lowercase
  var cleaned = target.trim().toLowerCase();

  // Whitelist: Only allow alphanumeric, dots, hyphens, and colons (for IPv6)
  // Maximum length 253 (DNS max hostname length)
  if (!/^[a-z0-9][a-z0-9.\-:]{0,252}$/.test(cleaned)) {
    throw new Error('Invalid target format - only alphanumeric, dots, hyphens allowed');
  }

  // Additional validation: No consecutive dots, no leading/trailing dots
  if (/\.\./.test(cleaned) || cleaned.indexOf('.') === 0 || cleaned.lastIndexOf('.') === cleaned.length - 1) {
    throw new Error('Invalid hostname format');
  }

  return cleaned;
}

/**
 * Run network diagnostics on a node
 * Collects network configuration, routing, connections, and performs tests
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Network diagnostics data
 */
async function runNetworkDiagnostics(node) {
  var script = utils.getScript('network-diagnostics.sh');
  var result = await ssh.controlMaster.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Network diagnostics script failed';
    throw new Error(errMsg);
  }

  var data = utils.parseScriptOutput(result.stdout, node.name);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

/**
 * Run a ping test from a node to a target
 * @param {Object} node - Node object from database
 * @param {string} target - IP or hostname to ping
 * @param {number} count - Number of pings (default: 4)
 * @returns {Promise<Object>} Ping results
 */
async function runPingTest(node, target, count) {
  count = count || 4;

  // Validate and sanitize target using whitelist approach
  var sanitizedTarget = validateNetworkTarget(target);

  // Validate count is a safe integer
  var safeCount = Math.min(Math.max(parseInt(count, 10) || 4, 1), 20);

  var command = 'ping -c ' + safeCount + ' -W 5 ' + sanitizedTarget + ' 2>&1';

  var result = await ssh.execute(node, command, 30000);

  // Parse ping output
  var lines = result.stdout.split('\n');
  var stats = {
    target: sanitizedTarget,
    transmitted: 0,
    received: 0,
    loss_percent: 100,
    min_ms: null,
    avg_ms: null,
    max_ms: null,
    raw: result.stdout
  };

  // Parse statistics line
  var statsLine = lines.find(function(l) { return l.indexOf('packets transmitted') > -1; });
  if (statsLine) {
    var match = statsLine.match(/(\d+) packets transmitted, (\d+) received/);
    if (match) {
      stats.transmitted = parseInt(match[1], 10);
      stats.received = parseInt(match[2], 10);
      stats.loss_percent = stats.transmitted > 0
        ? Math.round((1 - stats.received / stats.transmitted) * 100)
        : 100;
    }
  }

  // Parse RTT line
  var rttLine = lines.find(function(l) { return l.indexOf('min/avg/max') > -1; });
  if (rttLine) {
    var rttMatch = rttLine.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
    if (rttMatch) {
      stats.min_ms = parseFloat(rttMatch[1]);
      stats.avg_ms = parseFloat(rttMatch[2]);
      stats.max_ms = parseFloat(rttMatch[3]);
    }
  }

  return stats;
}

/**
 * Run a DNS lookup from a node
 * @param {Object} node - Node object from database
 * @param {string} hostname - Hostname to resolve
 * @returns {Promise<Object>} DNS results
 */
async function runDnsLookup(node, hostname) {
  // Validate and sanitize hostname using whitelist approach
  var sanitizedHostname = validateNetworkTarget(hostname);
  var command = 'host ' + sanitizedHostname + ' 2>&1 || nslookup ' + sanitizedHostname + ' 2>&1';

  var result = await ssh.execute(node, command, 10000);

  var data = {
    hostname: sanitizedHostname,
    success: result.exitCode === 0,
    addresses: [],
    raw: result.stdout
  };

  // Extract IP addresses from output
  var ipMatches = result.stdout.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  if (ipMatches) {
    data.addresses = ipMatches.filter(function(ip, index, self) {
      return self.indexOf(ip) === index; // unique
    });
  }

  return data;
}

/**
 * Run a traceroute from a node
 * @param {Object} node - Node object from database
 * @param {string} target - IP or hostname to trace
 * @param {number} maxHops - Maximum hops (default: 20)
 * @returns {Promise<Object>} Traceroute results
 */
async function runTraceroute(node, target, maxHops) {
  maxHops = maxHops || 20;

  // Validate and sanitize target using whitelist approach
  var sanitizedTarget = validateNetworkTarget(target);

  // Validate maxHops is a safe integer (1-64)
  var safeMaxHops = Math.min(Math.max(parseInt(maxHops, 10) || 20, 1), 64);

  var command = 'traceroute -m ' + safeMaxHops + ' -w 2 ' + sanitizedTarget + ' 2>&1 || tracepath ' + sanitizedTarget + ' 2>&1';

  var result = await ssh.execute(node, command, 60000);

  var lines = result.stdout.split('\n');
  var hops = [];

  lines.forEach(function(line) {
    // Match traceroute output format: " 1  192.168.1.1 (192.168.1.1)  1.234 ms"
    var match = line.match(/^\s*(\d+)\s+(\S+)\s+\(?([\d.]+)?\)?\s+([\d.]+)\s*ms/);
    if (match) {
      hops.push({
        hop: parseInt(match[1], 10),
        host: match[2],
        ip: match[3] || match[2],
        time_ms: parseFloat(match[4])
      });
    }
  });

  return {
    target: sanitizedTarget,
    hops: hops,
    raw: result.stdout
  };
}

module.exports = {
  validateNetworkTarget: validateNetworkTarget,
  runNetworkDiagnostics: runNetworkDiagnostics,
  runPingTest: runPingTest,
  runDnsLookup: runDnsLookup,
  runTraceroute: runTraceroute
};

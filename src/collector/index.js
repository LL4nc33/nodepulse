const fs = require('fs');
const path = require('path');
const db = require('../db');
const ssh = require('../ssh');
const alertsService = require('../services/alerts');

// Load scripts
const scriptsDir = path.join(__dirname, '../../scripts');

/**
 * Get script content
 */
function getScript(name) {
  const scriptPath = path.join(scriptsDir, name);
  return fs.readFileSync(scriptPath, 'utf8');
}

/**
 * Truncate string for error messages
 */
function truncateForError(str, maxLen = 500) {
  if (!str) return '(empty)';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '... (truncated)';
}

/**
 * Parse JSON output from scripts (handles malformed JSON)
 * Uses balanced brace matching to find first complete JSON object
 * Includes raw output snippet in error for debugging
 */
function parseScriptOutput(output, nodeName = 'unknown') {
  if (!output || typeof output !== 'string') {
    const error = new Error('Empty or invalid script output');
    error.rawOutput = '(no output)';
    throw error;
  }

  // Trim whitespace
  const trimmed = output.trim();

  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // Try to find JSON object - use balanced brace matching
    let braceCount = 0;
    let startIndex = -1;
    let endIndex = -1;

    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '{') {
        if (startIndex === -1) startIndex = i;
        braceCount++;
      } else if (trimmed[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          endIndex = i + 1;
          break;
        }
      }
    }

    if (startIndex !== -1 && endIndex !== -1) {
      const jsonStr = trimmed.substring(startIndex, endIndex);
      try {
        return JSON.parse(jsonStr);
      } catch (e2) {
        // Include position info and raw output snippet
        const error = new Error(`Invalid JSON in output: ${e2.message}`);
        error.rawOutput = truncateForError(jsonStr);
        error.position = e2.message.match(/position (\d+)/)?.[1] || 'unknown';
        console.error(`[COLLECTOR] JSON parse error for ${nodeName}:`, e2.message);
        console.error(`[COLLECTOR] Raw output (first 300 chars):`, trimmed.substring(0, 300));
        throw error;
      }
    }

    // No valid JSON found
    const error = new Error(`No valid JSON found in output: ${e.message}`);
    error.rawOutput = truncateForError(trimmed);
    console.error(`[COLLECTOR] No JSON found for ${nodeName}. Output (first 300 chars):`, trimmed.substring(0, 300));
    throw error;
  }
}

/**
 * Run discovery on a node
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Discovery data
 */
async function runDiscovery(node) {
  const script = getScript('discovery.sh');
  const result = await ssh.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    const errMsg = result.stderr || 'Discovery script failed';
    db.nodes.setOnline(node.id, false, errMsg);
    throw new Error(errMsg);
  }

  const data = parseScriptOutput(result.stdout, node.name);

  // Save to database
  db.discovery.save(node.id, data);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

/**
 * Run hardware collection on a node
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Hardware data
 */
async function runHardware(node) {
  const script = getScript('hardware.sh');
  const result = await ssh.executeScript(node, script, 120000);

  if (result.exitCode !== 0 && !result.stdout) {
    const errMsg = result.stderr || 'Hardware script failed';
    throw new Error(errMsg);
  }

  const data = parseScriptOutput(result.stdout, node.name);

  // Save to database
  db.hardware.save(node.id, data);

  return data;
}

/**
 * Run stats collection on a node
 * @param {Object} node - Node object from database
 * @param {boolean} saveHistory - Whether to save to history table (default: true)
 * @returns {Promise<Object>} Stats data
 */
async function runStats(node, saveHistory = true) {
  const script = getScript('stats.sh');
  const result = await ssh.executeScript(node, script, 30000);

  if (result.exitCode !== 0 && !result.stdout) {
    const errMsg = result.stderr || 'Stats script failed';
    db.nodes.setOnline(node.id, false, errMsg);
    throw new Error(errMsg);
  }

  let data;
  try {
    data = parseScriptOutput(result.stdout, node.name);
  } catch (err) {
    // Save raw output snippet to last_error for debugging
    const errorWithOutput = err.rawOutput
      ? `${err.message} | Raw: ${err.rawOutput.substring(0, 200)}`
      : err.message;
    db.nodes.setOnline(node.id, false, errorWithOutput);
    throw err;
  }

  // Save to current stats
  db.stats.saveCurrent(node.id, data);

  // Save to history if enabled
  if (saveHistory) {
    db.stats.saveHistory(node.id, data);
  }

  // Update node online status
  db.nodes.setOnline(node.id, true);

  // Check alerts if thresholds are configured
  try {
    const thresholds = {
      cpu_warning: parseFloat(db.settings.get('alert_cpu_warning') || '80'),
      cpu_critical: parseFloat(db.settings.get('alert_cpu_critical') || '95'),
      ram_warning: parseFloat(db.settings.get('alert_ram_warning') || '85'),
      ram_critical: parseFloat(db.settings.get('alert_ram_critical') || '95'),
      disk_warning: parseFloat(db.settings.get('alert_disk_warning') || '80'),
      disk_critical: parseFloat(db.settings.get('alert_disk_critical') || '95'),
      temp_warning: parseFloat(db.settings.get('alert_temp_warning') || '70'),
      temp_critical: parseFloat(db.settings.get('alert_temp_critical') || '85')
    };

    alertsService.checkAlerts(node.id, data, thresholds);
    // Also resolve any offline alert since we successfully collected stats
    alertsService.checkOfflineAlert(node.id, true);
  } catch (alertErr) {
    console.error('Alert check failed for node', node.name, ':', alertErr.message);
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
  const virt = discoveryData.virtualization;
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
  const tags = [];

  // Virtualization/Physical
  const virt = discoveryData.virtualization;
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
  const arch = discoveryData.arch;
  if (arch === 'x86_64' || arch === 'amd64') {
    tags.push('x86');
  } else if (arch && (arch.startsWith('arm') || arch.startsWith('aarch'))) {
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
  const tagNames = getTagsFromDiscovery(discoveryData);

  for (const tagName of tagNames) {
    const tag = db.tags.getByName(tagName);
    if (tag) {
      db.tags.addToNode(nodeId, tag.id);
    }
  }
}

/**
 * Run Docker collection on a node
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Docker data (containers, images, volumes, networks)
 */
async function runDocker(node) {
  const script = getScript('docker.sh');
  const result = await ssh.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    const errMsg = result.stderr || 'Docker script failed';
    throw new Error(errMsg);
  }

  const data = parseScriptOutput(result.stdout, node.name);

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
async function runDockerCommand(node, command, timeout = 30000) {
  // Validate command starts with docker
  if (!command.startsWith('docker ')) {
    throw new Error('Command must start with "docker "');
  }

  const result = await ssh.execute(node, command, timeout);
  return result;
}

/**
 * Run Proxmox collection on a node
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Proxmox data (vms, cts, storage, snapshots)
 */
async function runProxmox(node) {
  const script = getScript('proxmox.sh');
  const result = await ssh.executeScript(node, script, 120000);

  if (result.exitCode !== 0 && !result.stdout) {
    const errMsg = result.stderr || 'Proxmox script failed';
    throw new Error(errMsg);
  }

  let data;
  try {
    data = parseScriptOutput(result.stdout, node.name);
  } catch (err) {
    // Save raw output snippet to last_error for debugging
    const errorWithOutput = err.rawOutput
      ? `${err.message} | Raw: ${err.rawOutput.substring(0, 200)}`
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
 * @param {string} command - Proxmox command to execute (qm or pct)
 * @param {number} timeout - Timeout in ms (default: 60000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runProxmoxCommand(node, command, timeout = 60000) {
  // Validate command starts with qm or pct
  if (!command.startsWith('qm ') && !command.startsWith('pct ')) {
    throw new Error('Command must start with "qm " or "pct "');
  }

  const result = await ssh.execute(node, command, timeout);
  return result;
}

/**
 * Run full discovery process on a node
 * - Run discovery script
 * - Determine node type
 * - Apply auto-tags
 * - Run hardware collection
 * @param {Object} node - Node object from database
 * @returns {Promise<{discovery: Object, hardware: Object, nodeType: string, hardwareError: string|null}>}
 */
async function runFullDiscovery(node) {
  // Run discovery
  const discoveryData = await runDiscovery(node);

  // Determine and set node type
  const nodeType = determineNodeType(discoveryData);
  db.nodes.setNodeType(node.id, nodeType);

  // Apply auto-tags
  applyAutoTags(node.id, discoveryData);

  // Run hardware collection
  let hardwareData = null;
  let hardwareError = null;
  try {
    hardwareData = await runHardware(node);
  } catch (err) {
    hardwareError = err.message;
    console.error(`[COLLECTOR] Hardware collection failed for ${node.name}:`, err.message);
  }

  return {
    discovery: discoveryData,
    hardware: hardwareData,
    hardwareError,
    nodeType,
  };
}

/**
 * Run comprehensive system info collection on a node
 * Collects ALL available system information
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Comprehensive system info
 */
async function runSystemInfo(node) {
  const script = getScript('system-info.sh');
  const result = await ssh.executeScript(node, script, 120000);

  if (result.exitCode !== 0 && !result.stdout) {
    const errMsg = result.stderr || 'System info script failed';
    throw new Error(errMsg);
  }

  const data = parseScriptOutput(result.stdout, node.name);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
}

/**
 * Run network diagnostics on a node
 * Collects network configuration, routing, connections, and performs tests
 * @param {Object} node - Node object from database
 * @returns {Promise<Object>} Network diagnostics data
 */
async function runNetworkDiagnostics(node) {
  const script = getScript('network-diagnostics.sh');
  const result = await ssh.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    const errMsg = result.stderr || 'Network diagnostics script failed';
    throw new Error(errMsg);
  }

  const data = parseScriptOutput(result.stdout, node.name);

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
async function runPingTest(node, target, count = 4) {
  // Sanitize target to prevent command injection
  const sanitizedTarget = target.replace(/[;&|`$()]/g, '');
  const command = `ping -c ${count} -W 5 ${sanitizedTarget} 2>&1`;

  const result = await ssh.execute(node, command, 30000);

  // Parse ping output
  const lines = result.stdout.split('\n');
  const stats = {
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
  const statsLine = lines.find(function(l) { return l.indexOf('packets transmitted') > -1; });
  if (statsLine) {
    const match = statsLine.match(/(\d+) packets transmitted, (\d+) received/);
    if (match) {
      stats.transmitted = parseInt(match[1], 10);
      stats.received = parseInt(match[2], 10);
      stats.loss_percent = stats.transmitted > 0
        ? Math.round((1 - stats.received / stats.transmitted) * 100)
        : 100;
    }
  }

  // Parse RTT line
  const rttLine = lines.find(function(l) { return l.indexOf('min/avg/max') > -1; });
  if (rttLine) {
    const match = rttLine.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
    if (match) {
      stats.min_ms = parseFloat(match[1]);
      stats.avg_ms = parseFloat(match[2]);
      stats.max_ms = parseFloat(match[3]);
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
  // Sanitize hostname
  const sanitizedHostname = hostname.replace(/[;&|`$()]/g, '');
  const command = `host ${sanitizedHostname} 2>&1 || nslookup ${sanitizedHostname} 2>&1`;

  const result = await ssh.execute(node, command, 10000);

  const data = {
    hostname: sanitizedHostname,
    success: result.exitCode === 0,
    addresses: [],
    raw: result.stdout
  };

  // Extract IP addresses from output
  const ipMatches = result.stdout.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
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
async function runTraceroute(node, target, maxHops = 20) {
  // Sanitize target
  const sanitizedTarget = target.replace(/[;&|`$()]/g, '');
  const command = `traceroute -m ${maxHops} -w 2 ${sanitizedTarget} 2>&1 || tracepath ${sanitizedTarget} 2>&1`;

  const result = await ssh.execute(node, command, 60000);

  const lines = result.stdout.split('\n');
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
  runDiscovery,
  runHardware,
  runStats,
  runDocker,
  runDockerCommand,
  runProxmox,
  runProxmoxCommand,
  runFullDiscovery,
  runSystemInfo,
  runNetworkDiagnostics,
  runPingTest,
  runDnsLookup,
  runTraceroute,
  determineNodeType,
  getTagsFromDiscovery,
  applyAutoTags,
};

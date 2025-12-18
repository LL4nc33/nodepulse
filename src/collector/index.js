const fs = require('fs');
const path = require('path');
const db = require('../db');
const ssh = require('../ssh');
const alertsService = require('../services/alerts');
const { getThresholds } = require('../lib/thresholds');
const TieredPoller = require('./tiered-poller');
const statsRouter = require('../routes/api/stats');

// Load scripts
const scriptsDir = path.join(__dirname, '../../scripts');

// Active pollers (nodeId -> TieredPoller instance)
const activePollers = new Map();

/**
 * Get script content
 */
function getScript(name) {
  const scriptPath = path.join(scriptsDir, name);
  // Convert CRLF to LF for Linux compatibility
  return fs.readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n');
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

  // Invalidate metadata hash cache (TOON integration)
  // Hardware changed → metadata hash must be recalculated
  statsRouter.clearMetadataHashCache(node.id);

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

  // Defensive Parsing: Sanitize NaN/Infinity values (TOON Integration - Problem 2)
  Object.keys(data).forEach(key => {
    if (typeof data[key] === 'number' && !isFinite(data[key])) {
      console.warn(`[Collector] Invalid number for ${node.name}.${key}: ${data[key]}, replacing with 0`);
      data[key] = 0;
    }
  });

  // Timestamp Validation (TOON Integration - Problem 7)
  const now = Date.now();
  const minDate = new Date('2024-01-01').getTime();
  const maxDate = now + 3600000; // +1h future tolerance

  if (data.timestamp) {
    const ts = data.timestamp;
    if (ts < minDate || ts > maxDate) {
      console.warn(`[Collector] Invalid timestamp for ${node.name}: ${ts}, using current time`);
      data.timestamp = now;
    }
  } else {
    data.timestamp = now;
  }

  // Counter Reset Detection (TOON Integration - Problem 11)
  const previousStats = db.stats.getCurrent(node.id);
  if (previousStats) {
    // Check net_rx_bytes for counter reset (reboot or overflow)
    if (data.net_rx_bytes < previousStats.net_rx_bytes) {
      const diff = previousStats.net_rx_bytes - data.net_rx_bytes;
      if (diff > 1073741824) { // 1 GB difference = likely reset
        console.warn(`[Collector] Counter reset detected for ${node.name} (RX: ${previousStats.net_rx_bytes} -> ${data.net_rx_bytes})`);
        // Don't throw error - just log it, data is still valid
      }
    }
    // Check net_tx_bytes
    if (data.net_tx_bytes < previousStats.net_tx_bytes) {
      const diff = previousStats.net_tx_bytes - data.net_tx_bytes;
      if (diff > 1073741824) {
        console.warn(`[Collector] Counter reset detected for ${node.name} (TX: ${previousStats.net_tx_bytes} -> ${data.net_tx_bytes})`);
      }
    }
  }

  // Count VMs/Containers (TOON Integration - moved from SubQuery to Collector)
  // Improves getAllNodesWithStats() performance by 30-50%
  let vmsRunning = 0;
  let ctsRunning = 0;
  let containersRunning = 0;

  try {
    // Proxmox VMs/CTs (only if Proxmox-Node)
    if (node.node_type === 'proxmox' || node.is_proxmox_host) {
      const vms = db.getDb().prepare('SELECT COUNT(*) as count FROM proxmox_vms WHERE node_id = ? AND status = ?').get(node.id, 'running');
      vmsRunning = vms ? vms.count : 0;

      const cts = db.getDb().prepare('SELECT COUNT(*) as count FROM proxmox_cts WHERE node_id = ? AND status = ?').get(node.id, 'running');
      ctsRunning = cts ? cts.count : 0;
    }

    // Docker Containers (only if Docker-Node)
    if (node.is_docker) {
      const containers = db.getDb().prepare('SELECT COUNT(*) as count FROM docker_containers WHERE node_id = ? AND state = ?').get(node.id, 'running');
      containersRunning = containers ? containers.count : 0;
    }
  } catch (err) {
    console.error(`[Collector] Failed to count VMs/Containers for node ${node.id}:`, err.message);
    // Continue with 0 counts - not critical
  }

  // Add counts to stats data
  data.vms_running = vmsRunning;
  data.cts_running = ctsRunning;
  data.containers_running = containersRunning;

  // Save to current stats
  db.stats.saveCurrent(node.id, data);

  // Save to history if enabled
  if (saveHistory) {
    db.stats.saveHistory(node.id, data);
  }

  // Check if node was offline before (for re-discovery)
  const wasOffline = !node.online;

  // Update node online status
  db.nodes.setOnline(node.id, true);

  // Load settings once for re-discovery and alerts (cached, efficient for RPi 2B)
  const settings = db.settings.getAll();

  // Re-Discovery wenn Node von offline auf online wechselt
  if (wasOffline && settings.rediscovery_on_connect === 'true') {
    // Discovery im Hintergrund ausführen (nicht-blocking)
    runFullDiscovery(node).catch(err => {
      console.error(`Re-Discovery für Node ${node.id} fehlgeschlagen:`, err.message);
    });
  }

  // Check alerts if thresholds are configured (zentrale Threshold-Funktion)
  try {
    const thresholds = getThresholds(settings);

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
  // Whitelist of allowed Docker subcommands (security hardening)
  const ALLOWED_DOCKER_COMMANDS = [
    'ps', 'stats', 'inspect', 'logs', 'images', 'volume', 'network',
    'start', 'stop', 'restart', 'pause', 'unpause', 'kill',
    'pull', 'exec', 'top', 'port', 'info', 'version'
  ];

  // Validate command starts with docker
  if (!command.startsWith('docker ')) {
    throw new Error('Command must start with "docker "');
  }

  // Extract subcommand (second word after 'docker ')
  const parts = command.substring(7).trim().split(/\s+/);
  const subcommand = parts[0];

  if (!ALLOWED_DOCKER_COMMANDS.includes(subcommand)) {
    throw new Error('Docker subcommand not allowed: ' + subcommand);
  }

  // Check for dangerous metacharacters in the entire command
  if (/[;&|`$()><\n\r\\]/.test(command)) {
    throw new Error('Command contains forbidden characters');
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
 * @param {string} command - Proxmox command to execute (qm, pct, pvesm, pveam, pvesh)
 * @param {number} timeout - Timeout in ms (default: 60000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runProxmoxCommand(node, command, timeout = 60000) {
  // Whitelist of allowed Proxmox commands and subcommands
  const ALLOWED_PROXMOX_COMMANDS = {
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

  // Validate command starts with allowed prefix
  var allowedPrefixes = ['qm ', 'pct ', 'pvesm ', 'pveam ', 'pvesh '];
  var isAllowed = allowedPrefixes.some(function(prefix) {
    return command.startsWith(prefix);
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

  if (ALLOWED_PROXMOX_COMMANDS[mainCmd] && !ALLOWED_PROXMOX_COMMANDS[mainCmd].includes(subCmd)) {
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
  var script = getScript('proxmox-resources.sh');
  var result = await ssh.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    var errMsg = result.stderr || 'Proxmox resources script failed';
    throw new Error(errMsg);
  }

  var data = parseScriptOutput(result.stdout, node.name);

  // Update node online status
  db.nodes.setOnline(node.id, true);

  return data;
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
  const cleaned = target.trim().toLowerCase();

  // Whitelist: Only allow alphanumeric, dots, hyphens, and colons (for IPv6)
  // Maximum length 253 (DNS max hostname length)
  if (!/^[a-z0-9][a-z0-9.\-:]{0,252}$/.test(cleaned)) {
    throw new Error('Invalid target format - only alphanumeric, dots, hyphens allowed');
  }

  // Additional validation: No consecutive dots, no leading/trailing dots
  if (/\.\./.test(cleaned) || cleaned.startsWith('.') || cleaned.endsWith('.')) {
    throw new Error('Invalid hostname format');
  }

  return cleaned;
}

/**
 * Run a ping test from a node to a target
 * @param {Object} node - Node object from database
 * @param {string} target - IP or hostname to ping
 * @param {number} count - Number of pings (default: 4)
 * @returns {Promise<Object>} Ping results
 */
async function runPingTest(node, target, count = 4) {
  // Validate and sanitize target using whitelist approach
  const sanitizedTarget = validateNetworkTarget(target);

  // Validate count is a safe integer
  const safeCount = Math.min(Math.max(parseInt(count, 10) || 4, 1), 20);

  const command = `ping -c ${safeCount} -W 5 ${sanitizedTarget} 2>&1`;

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
  // Validate and sanitize hostname using whitelist approach
  const sanitizedHostname = validateNetworkTarget(hostname);
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
  // Validate and sanitize target using whitelist approach
  const sanitizedTarget = validateNetworkTarget(target);

  // Validate maxHops is a safe integer (1-64)
  const safeMaxHops = Math.min(Math.max(parseInt(maxHops, 10) || 20, 1), 64);

  const command = `traceroute -m ${safeMaxHops} -w 2 ${sanitizedTarget} 2>&1 || tracepath ${sanitizedTarget} 2>&1`;

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

/**
 * Start tiered polling for a node
 * @param {number} nodeId - Node ID
 */
function startTieredMonitoring(nodeId) {
  // Check if already running
  if (activePollers.has(nodeId)) {
    console.log(`[Collector] Tiered monitoring already running for node ${nodeId}`);
    return;
  }

  const node = db.nodes.getById(nodeId);
  if (!node) {
    console.error(`[Collector] Cannot start monitoring: Node ${nodeId} not found`);
    return;
  }

  if (!node.monitoring_enabled) {
    console.log(`[Collector] Monitoring disabled for node ${nodeId}`);
    return;
  }

  // Get capabilities (if exists)
  const capsData = db.capabilities.get(nodeId);
  let capabilities = {};
  if (capsData && capsData.capabilities_json) {
    try {
      capabilities = JSON.parse(capsData.capabilities_json);
    } catch (err) {
      console.error(`[Collector] Error parsing capabilities for node ${nodeId}:`, err.message);
    }
  }

  // Create and start poller
  const poller = new TieredPoller(nodeId, capabilities);
  activePollers.set(nodeId, poller);
  poller.start();

  console.log(`[Collector] Started tiered monitoring for node ${nodeId} (${node.name})`);
}

/**
 * Stop tiered polling for a node
 * @param {number} nodeId - Node ID
 * @returns {Promise<void>}
 */
async function stopTieredMonitoring(nodeId) {
  const poller = activePollers.get(nodeId);
  if (poller) {
    await poller.stop();
    activePollers.delete(nodeId);
    console.log(`[Collector] Stopped tiered monitoring for node ${nodeId}`);
  }
}

/**
 * Start monitoring for all nodes
 */
function startAllMonitoring() {
  const nodes = db.nodes.getAll();
  nodes.forEach(node => {
    if (node.monitoring_enabled) {
      startTieredMonitoring(node.id);
    }
  });
  console.log(`[Collector] Started monitoring for ${activePollers.size} nodes`);
}

/**
 * Stop all monitoring
 * @returns {Promise<void>}
 */
async function stopAllMonitoring() {
  const stopPromises = [];
  activePollers.forEach((poller, nodeId) => {
    stopPromises.push(poller.stop());
  });
  await Promise.all(stopPromises);
  activePollers.clear();
  console.log('[Collector] Stopped all monitoring');
}

/**
 * Get monitoring status
 */
function getMonitoringStatus() {
  const status = [];
  activePollers.forEach((poller, nodeId) => {
    status.push(poller.getStatus());
  });
  return status;
}

/**
 * Run LVM discovery on a node
 * Collects PVs, VGs, LVs, Thin Pools, Proxmox storages, and available disks
 * @param {Object} node - Node object from database (must have credentials)
 * @returns {Promise<Object>} LVM data
 */
async function runLvmDiscovery(node) {
  const script = getScript('lvm-discovery.sh');
  const result = await ssh.executeScript(node, script, 60000);

  if (result.exitCode !== 0 && !result.stdout) {
    const errMsg = result.stderr || 'LVM discovery script failed';
    throw new Error(errMsg);
  }

  let data;
  try {
    data = parseScriptOutput(result.stdout, node.name);
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
 * Run a generic command on a node via SSH
 * Used for LVM and other storage operations
 * SECURITY: Only call this from API routes that have validated the command!
 * @param {Object} node - Node object from database (must have credentials)
 * @param {string} command - Command to execute
 * @param {number} timeout - Timeout in ms (default: 60000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runCommand(node, command, timeout = 60000) {
  // Basic safety check - block obvious shell injection
  if (/[;&|`$()><\n\r]/.test(command)) {
    throw new Error('Command contains forbidden characters');
  }

  const result = await ssh.execute(node, command, timeout);
  return result;
}

module.exports = {
  runDiscovery,
  runHardware,
  runStats,
  runDocker,
  runDockerCommand,
  runProxmox,
  runProxmoxCommand,
  runProxmoxResources,
  runFullDiscovery,
  runSystemInfo,
  runNetworkDiagnostics,
  runPingTest,
  runDnsLookup,
  runTraceroute,
  determineNodeType,
  getTagsFromDiscovery,
  applyAutoTags,
  // LVM Storage
  runLvmDiscovery,
  runCommand,
  // Tiered monitoring
  startTieredMonitoring,
  stopTieredMonitoring,
  startAllMonitoring,
  stopAllMonitoring,
  getMonitoringStatus,
};

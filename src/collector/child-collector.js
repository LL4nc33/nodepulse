/**
 * Child Collector - Secure Command Execution in VMs/LXCs
 *
 * SECURITY FIRST - Implements Paul's Security Requirements:
 * 1. STRICT Command-Whitelist (NO dynamic commands!)
 * 2. VMID-Validation (100-999999, strict parseInt)
 * 3. Type explicitly checked ('lxc' or 'vm')
 * 4. Only unprivileged LXCs (optional check)
 * 5. Output length limited (DoS protection)
 *
 * Uses pct exec (LXC) and qm guest exec (VM) to run commands
 * inside guests via the Proxmox host - NO direct SSH needed!
 */

'use strict';

var ssh = require('../ssh');

// Maximum output size (DoS protection)
var MAX_OUTPUT_SIZE = 1024 * 1024;  // 1MB

// STRICT Command Whitelist - NO dynamic commands allowed!
// Each command is pre-defined and cannot be modified
var CHILD_COMMANDS = {
  // Docker commands
  'docker-ps': 'docker ps -a --format "{{json .}}" 2>/dev/null',
  'docker-stats': 'docker stats --no-stream --format "{{json .}}" 2>/dev/null',
  'docker-images': 'docker images --format "{{json .}}" 2>/dev/null',
  'docker-version': 'docker version --format "{{json .}}" 2>/dev/null || echo "{}"',
  'docker-check': 'which docker 2>/dev/null && echo "HAS_DOCKER" || echo ""',

  // System info commands (Discovery)
  'hostname': 'hostname 2>/dev/null',
  'uptime': 'uptime 2>/dev/null',
  'uname': 'uname -a 2>/dev/null',
  'os-release': 'cat /etc/os-release 2>/dev/null | head -20',
  'cpu-info': 'cat /proc/cpuinfo 2>/dev/null | head -50',
  'mem-info': 'cat /proc/meminfo 2>/dev/null | head -20',
  'systemd-check': 'which systemctl 2>/dev/null && echo "HAS_SYSTEMD" || echo ""',

  // Resource usage (Stats)
  'memory': 'free -b 2>/dev/null | head -3',
  'disk': 'df -B1 / 2>/dev/null | tail -1',
  'load': 'cat /proc/loadavg 2>/dev/null',
  'df': 'df -h 2>/dev/null',
  'df-root': 'df / --output=pcent 2>/dev/null | tail -1',
  'vmstat': 'vmstat 1 2 2>/dev/null | tail -1',

  // Process info
  'process-count': 'ps aux 2>/dev/null | wc -l',

  // Network info (basic)
  'ip-addr': 'ip -4 addr show 2>/dev/null | grep inet | head -5',
  'get-ip': 'hostname -I 2>/dev/null | awk \'{print $1}\' || ip -4 addr show 2>/dev/null | grep inet | grep -v 127.0.0.1 | head -1 | awk \'{print $2}\' | cut -d/ -f1',

  // Health check commands
  'systemctl-failed': 'systemctl --failed --no-pager 2>/dev/null | head -20',
  'reboot-required': 'test -f /var/run/reboot-required && echo "1" || echo "0"',
  'apt-updates': 'apt list --upgradable 2>/dev/null 2>&1 | tail -n +2 | wc -l',
  'kernel-version': 'uname -r 2>/dev/null',
  'last-boot': 'who -b 2>/dev/null | awk "{print $3, $4}"'
};

/**
 * Validate VMID strictly
 * Paul's Paranoia-Level validation:
 * - Must be integer between 100 and 999999
 * - String conversion must match exactly (no trailing chars)
 *
 * @param {number|string} vmid - VMID to validate
 * @returns {number} Valid VMID
 * @throws {Error} If VMID is invalid
 */
function validateVmid(vmid) {
  // Parse to integer
  var id = parseInt(vmid, 10);

  // Check if it's a valid number
  if (isNaN(id)) {
    throw new Error('Invalid VMID: not a number');
  }

  // Range check (Proxmox uses 100-999999)
  if (id < 100 || id > 999999) {
    throw new Error('Invalid VMID: out of range (100-999999)');
  }

  // Strict string comparison - prevents "100abc" from passing
  if (String(id) !== String(vmid).trim()) {
    throw new Error('Invalid VMID: contains non-numeric characters');
  }

  return id;
}

/**
 * Validate guest type
 * @param {string} type - Guest type ('vm' or 'lxc')
 * @returns {string} Valid type
 * @throws {Error} If type is invalid
 */
function validateType(type) {
  if (type !== 'vm' && type !== 'lxc') {
    throw new Error('Invalid guest type: must be "vm" or "lxc"');
  }
  return type;
}

/**
 * Get whitelisted command by key
 * @param {string} commandKey - Command key from CHILD_COMMANDS
 * @returns {string} Command string
 * @throws {Error} If command is not whitelisted
 */
function getWhitelistedCommand(commandKey) {
  var command = CHILD_COMMANDS[commandKey];
  if (!command) {
    throw new Error('Command not whitelisted: ' + commandKey);
  }
  return command;
}

/**
 * Build safe exec command for Proxmox
 * @param {number} vmid - Validated VMID
 * @param {string} type - Validated type ('vm' or 'lxc')
 * @param {string} command - Whitelisted command
 * @returns {string} Full exec command
 */
function buildExecCommand(vmid, type, command) {
  if (type === 'lxc') {
    // pct exec runs command in LXC container
    return 'pct exec ' + vmid + ' -- sh -c \'' + command.replace(/'/g, "'\\''") + '\'';
  } else {
    // qm guest exec requires QEMU Guest Agent
    // Note: qm guest exec has different syntax
    return 'qm guest exec ' + vmid + ' -- sh -c \'' + command.replace(/'/g, "'\\''") + '\'';
  }
}

/**
 * Execute a whitelisted command inside a VM/LXC
 *
 * @param {Object} hostNode - Proxmox host node (with SSH credentials)
 * @param {number|string} vmid - VM/CT ID (100-999999)
 * @param {string} type - Guest type ('vm' or 'lxc')
 * @param {string} commandKey - Key from CHILD_COMMANDS whitelist
 * @param {Object} options - Execution options
 * @param {number} options.timeout - Timeout in ms (default: 15000)
 * @returns {Promise<Object>} Result with stdout, stderr, exitCode
 */
async function execInChild(hostNode, vmid, type, commandKey, options) {
  options = options || {};
  var timeout = options.timeout || 15000;

  // 1. Validate VMID (Paul's paranoia-level check)
  var validVmid = validateVmid(vmid);

  // 2. Validate type
  var validType = validateType(type);

  // 3. Get whitelisted command (NO dynamic commands!)
  var command = getWhitelistedCommand(commandKey);

  // 4. Build safe exec command
  var fullCmd = buildExecCommand(validVmid, validType, command);

  // 5. Execute via SSH to Proxmox host
  try {
    var result = await ssh.controlMaster.execute(hostNode, fullCmd, {
      timeout: timeout,
      silent: true
    });

    // 6. Limit output size (DoS protection)
    if (result.stdout && result.stdout.length > MAX_OUTPUT_SIZE) {
      result.stdout = result.stdout.substring(0, MAX_OUTPUT_SIZE);
      result.truncated = true;
    }

    return {
      success: true,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode || 0,
      truncated: result.truncated || false
    };
  } catch (err) {
    return {
      success: false,
      stdout: '',
      stderr: err.message,
      exitCode: -1,
      error: err.message
    };
  }
}

/**
 * Execute multiple commands in a single SSH call (batched)
 * More efficient for collecting multiple data points
 *
 * @param {Object} hostNode - Proxmox host node
 * @param {number|string} vmid - VM/CT ID
 * @param {string} type - Guest type
 * @param {Array<string>} commandKeys - Array of command keys
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Results keyed by command
 */
async function execBatchInChild(hostNode, vmid, type, commandKeys, options) {
  options = options || {};
  var timeout = options.timeout || 30000;

  // Validate inputs
  var validVmid = validateVmid(vmid);
  var validType = validateType(type);

  // Build batch script with delimiters
  var parts = [];
  for (var i = 0; i < commandKeys.length; i++) {
    var key = commandKeys[i];
    var cmd = getWhitelistedCommand(key);
    parts.push('echo "---CMD:' + key + '---"; ' + cmd + ' 2>/dev/null || echo "ERROR"');
  }

  var batchCommand = parts.join('; ');
  var fullCmd = buildExecCommand(validVmid, validType, batchCommand);

  try {
    var result = await ssh.controlMaster.execute(hostNode, fullCmd, {
      timeout: timeout,
      silent: true
    });

    // Parse batch output
    var results = {};
    var sections = (result.stdout || '').split(/---CMD:(\w+[\-\w]*)---/);

    for (var j = 1; j < sections.length; j += 2) {
      var cmdKey = sections[j];
      var output = (sections[j + 1] || '').trim();
      results[cmdKey] = {
        success: output !== 'ERROR',
        stdout: output === 'ERROR' ? '' : output,
        error: output === 'ERROR' ? 'Command failed' : null
      };
    }

    return {
      success: true,
      results: results
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      results: {}
    };
  }
}

/**
 * Collect Docker data from a child VM/LXC
 * Convenience method for Docker-specific collection
 *
 * @param {Object} hostNode - Proxmox host node
 * @param {number|string} vmid - VM/CT ID
 * @param {string} type - Guest type
 * @returns {Promise<Object>} Docker data (containers, stats)
 */
async function collectDockerFromChild(hostNode, vmid, type) {
  var result = await execBatchInChild(
    hostNode,
    vmid,
    type,
    ['docker-ps', 'docker-stats', 'docker-version'],
    { timeout: 20000 }
  );

  if (!result.success) {
    return { success: false, error: result.error, containers: [] };
  }

  // Parse docker ps output (JSON per line)
  var containers = [];
  var psResult = result.results['docker-ps'];
  if (psResult && psResult.success && psResult.stdout) {
    var lines = psResult.stdout.split('\n').filter(function(l) { return l.trim(); });
    for (var i = 0; i < lines.length; i++) {
      try {
        containers.push(JSON.parse(lines[i]));
      } catch (e) {
        // Skip invalid JSON lines
      }
    }
  }

  return {
    success: true,
    containers: containers,
    containerCount: containers.length,
    hasDocker: containers.length > 0 || (psResult && psResult.success)
  };
}

/**
 * Check if LXC is unprivileged (security check)
 * Paul's recommendation: only allow unprivileged containers
 *
 * @param {Object} hostNode - Proxmox host node
 * @param {number|string} ctid - Container ID
 * @returns {Promise<boolean>} True if unprivileged
 */
async function isLxcUnprivileged(hostNode, ctid) {
  var validCtid = validateVmid(ctid);

  // This runs on host, not inside container
  var cmd = 'pct config ' + validCtid + ' 2>/dev/null | grep -i unprivileged';

  try {
    var result = await ssh.controlMaster.execute(hostNode, cmd, {
      timeout: 5000,
      silent: true
    });

    return result.stdout && result.stdout.indexOf('1') !== -1;
  } catch (err) {
    // If we can't check, assume privileged (fail-safe)
    return false;
  }
}

/**
 * Check if VM has QEMU Guest Agent installed
 * Required for qm guest exec to work
 *
 * @param {Object} hostNode - Proxmox host node
 * @param {number|string} vmid - VM ID
 * @returns {Promise<Object>} Agent status
 */
async function checkVmGuestAgent(hostNode, vmid) {
  var validVmid = validateVmid(vmid);

  // Check agent config and ping
  var cmd = 'qm agent ' + validVmid + ' ping 2>/dev/null && echo "AGENT_OK" || echo "AGENT_FAIL"';

  try {
    var result = await ssh.controlMaster.execute(hostNode, cmd, {
      timeout: 5000,
      silent: true
    });

    var hasAgent = result.stdout && result.stdout.indexOf('AGENT_OK') !== -1;

    return {
      installed: hasAgent,
      responsive: hasAgent,
      message: hasAgent ? 'Guest Agent responding' : 'Guest Agent not available'
    };
  } catch (err) {
    return {
      installed: false,
      responsive: false,
      message: err.message
    };
  }
}

/**
 * Get list of available (whitelisted) commands
 * @returns {Array<string>} Command keys
 */
function getAvailableCommands() {
  return Object.keys(CHILD_COMMANDS);
}

module.exports = {
  // Core execution
  execInChild: execInChild,
  execBatchInChild: execBatchInChild,

  // Convenience methods
  collectDockerFromChild: collectDockerFromChild,

  // Security checks
  isLxcUnprivileged: isLxcUnprivileged,
  checkVmGuestAgent: checkVmGuestAgent,

  // Utilities
  validateVmid: validateVmid,
  validateType: validateType,
  getAvailableCommands: getAvailableCommands,

  // Constants (read-only exposure)
  COMMANDS: Object.freeze(Object.assign({}, CHILD_COMMANDS)),
  MAX_OUTPUT_SIZE: MAX_OUTPUT_SIZE
};

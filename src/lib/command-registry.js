/**
 * =============================================================================
 * COMMAND REGISTRY - Tool → JSON Schema Mapping
 * =============================================================================
 *
 * Definiert alle Commands für Tiered Polling mit:
 * - Command-String (Bash)
 * - Polling-Tier (1/2/3)
 * - Capability-Requirements (docker, proxmox, sensors, etc.)
 * - Parse-Format (json, text, columns, csv, custom)
 * - Output-Schema (erwartete Felder)
 * - Fallback-Commands (optional)
 *
 * Usage:
 *   const { COMMAND_REGISTRY, getCommandsForTier } = require('./command-registry');
 *   const tier1Commands = getCommandsForTier(1, nodeCapabilities);
 * =============================================================================
 */

const COMMAND_REGISTRY = {
  // ===========================================================================
  // TIER 1: Live Metrics (5s interval)
  // ===========================================================================

  'system.uptime': {
    command: 'uptime',
    tier: 1,
    interval: 5000,
    requires: null,
    parseFormat: 'text',
    schema: {
      load_1m: 'float',
      load_5m: 'float',
      load_15m: 'float',
      uptime_seconds: 'int',
      users: 'int'
    },
    description: 'System load average and uptime'
  },

  'system.memory': {
    command: 'free -b',
    tier: 1,
    interval: 5000,
    requires: null,
    parseFormat: 'columns',
    schema: {
      mem_total: 'bytes',
      mem_used: 'bytes',
      mem_free: 'bytes',
      mem_available: 'bytes',
      swap_total: 'bytes',
      swap_used: 'bytes',
      swap_free: 'bytes'
    },
    description: 'Memory and swap usage'
  },

  'system.meminfo': {
    command: 'cat /proc/meminfo',
    tier: 1,
    interval: 5000,
    requires: null,
    parseFormat: 'custom',
    schema: {
      mem_total: 'bytes',
      mem_free: 'bytes',
      mem_available: 'bytes',
      buffers: 'bytes',
      cached: 'bytes',
      swap_total: 'bytes',
      swap_free: 'bytes'
    },
    description: 'Detailed memory information'
  },

  'docker.stats': {
    command: 'docker stats --no-stream --format json 2>/dev/null || echo "[]"',
    tier: 1,
    interval: 5000,
    requires: 'docker',
    parseFormat: 'json',
    schema: {
      container_id: 'string',
      name: 'string',
      cpu_percent: 'float',
      mem_usage: 'bytes',
      mem_limit: 'bytes',
      mem_percent: 'float',
      net_io: 'string',
      block_io: 'string',
      pids: 'int'
    },
    description: 'Docker container resource usage'
  },

  'proxmox.vms': {
    command: 'pvesh get /nodes/$(hostname)/qemu --output-format json 2>/dev/null || echo "[]"',
    tier: 1,
    interval: 5000,
    requires: 'proxmox',
    parseFormat: 'json',
    schema: {
      vmid: 'int',
      name: 'string',
      status: 'string',
      cpu: 'float',
      maxcpu: 'int',
      mem: 'bytes',
      maxmem: 'bytes',
      disk: 'bytes',
      maxdisk: 'bytes',
      uptime: 'int'
    },
    description: 'Proxmox VM status and metrics'
  },

  'proxmox.cts': {
    command: 'pvesh get /nodes/$(hostname)/lxc --output-format json 2>/dev/null || echo "[]"',
    tier: 1,
    interval: 5000,
    requires: 'proxmox',
    parseFormat: 'json',
    schema: {
      vmid: 'int',
      name: 'string',
      status: 'string',
      cpu: 'float',
      maxcpu: 'int',
      mem: 'bytes',
      maxmem: 'bytes',
      disk: 'bytes',
      maxdisk: 'bytes',
      uptime: 'int'
    },
    description: 'Proxmox LXC container status and metrics'
  },

  // ===========================================================================
  // TIER 2: Status & Health (30s interval)
  // ===========================================================================

  'storage.lsblk': {
    command: 'lsblk -b -o NAME,SIZE,FSUSED,FSAVAIL,MOUNTPOINT --json 2>/dev/null || echo "{}"',
    tier: 2,
    interval: 30000,
    requires: null,
    parseFormat: 'json',
    schema: {
      blockdevices: 'array'
    },
    description: 'Block device information'
  },

  'storage.df': {
    command: 'df -B1 2>/dev/null | grep -E "^/dev" | head -1',
    tier: 2,
    interval: 30000,
    requires: null,
    parseFormat: 'columns',
    schema: {
      filesystem: 'string',
      total: 'bytes',
      used: 'bytes',
      available: 'bytes',
      use_percent: 'int',
      mounted_on: 'string'
    },
    description: 'Disk free space'
  },

  'sensors.thermal': {
    command: 'sensors -u 2>/dev/null || echo ""',
    tier: 2,
    interval: 30000,
    requires: 'sensors',
    parseFormat: 'custom',
    fallback: 'cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo "0"',
    schema: {
      sensor_name: 'string',
      temp_input: 'float',
      temp_max: 'float',
      temp_crit: 'float',
      temp_alarm: 'int'
    },
    description: 'Thermal sensor readings'
  },

  'sensors.hwmon': {
    command: 'find /sys/class/hwmon -name "temp*_input" -exec cat {} \\; 2>/dev/null | head -5',
    tier: 2,
    interval: 30000,
    requires: null,
    parseFormat: 'custom',
    schema: {
      temps: 'array'
    },
    description: 'Hardware monitoring temperatures'
  },

  'network.interfaces': {
    command: 'ip -s link show 2>/dev/null',
    tier: 2,
    interval: 30000,
    requires: null,
    parseFormat: 'custom',
    schema: {
      interface: 'string',
      state: 'string',
      rx_bytes: 'bytes',
      tx_bytes: 'bytes',
      rx_packets: 'int',
      tx_packets: 'int'
    },
    description: 'Network interface statistics'
  },

  // ===========================================================================
  // TIER 3: Identity & Hardware (5m interval)
  // ===========================================================================

  'hardware.inxi': {
    command: 'inxi -Fzxxx --output json 2>/dev/null || echo "{}"',
    tier: 3,
    interval: 300000,
    requires: null,
    parseFormat: 'json',
    schema: {
      system: 'object',
      cpu: 'object',
      memory: 'object',
      machine: 'object',
      battery: 'object'
    },
    description: 'Full system hardware information'
  },

  'hardware.fastfetch': {
    command: 'fastfetch --json 2>/dev/null || echo "{}"',
    tier: 3,
    interval: 300000,
    requires: null,
    parseFormat: 'json',
    fallback: 'inxi -Fzxxx --output json 2>/dev/null || echo "{}"',
    schema: {
      CPU: 'object',
      Memory: 'object',
      OS: 'object',
      Kernel: 'object'
    },
    description: 'Fast system information (faster than inxi)'
  },

  'hardware.lspci': {
    command: 'lspci -mm 2>/dev/null || echo ""',
    tier: 3,
    interval: 300000,
    requires: null,
    parseFormat: 'custom',
    schema: {
      slot: 'string',
      class: 'string',
      vendor: 'string',
      device: 'string',
      subsystem_vendor: 'string',
      subsystem_device: 'string'
    },
    description: 'PCI device listing'
  },

  'hardware.lsusb': {
    command: 'lsusb 2>/dev/null || echo ""',
    tier: 3,
    interval: 300000,
    requires: null,
    parseFormat: 'custom',
    schema: {
      bus: 'string',
      device: 'string',
      id: 'string',
      description: 'string'
    },
    description: 'USB device listing'
  },

  'storage.smart': {
    command: 'smartctl -a /dev/sda 2>/dev/null || echo ""',
    tier: 3,
    interval: 300000,
    requires: 'smart',
    parseFormat: 'custom',
    schema: {
      device: 'string',
      model: 'string',
      serial: 'string',
      health_status: 'string',
      temperature: 'int',
      power_on_hours: 'int',
      power_cycle_count: 'int'
    },
    description: 'SMART disk health data'
  },

  'gpu.nvidia': {
    command: 'nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null || echo ""',
    tier: 2,
    interval: 30000,
    requires: 'gpu',
    parseFormat: 'csv',
    schema: {
      index: 'int',
      name: 'string',
      temp: 'float',
      utilization: 'float',
      mem_used: 'mb',
      mem_total: 'mb'
    },
    description: 'NVIDIA GPU metrics'
  },

  'zfs.pools': {
    command: 'zpool list -H -o name,size,alloc,free,health 2>/dev/null || echo ""',
    tier: 2,
    interval: 60000,
    requires: 'zfs',
    parseFormat: 'columns',
    schema: {
      name: 'string',
      size: 'string',
      alloc: 'string',
      free: 'string',
      health: 'string'
    },
    description: 'ZFS pool status'
  }
};

/**
 * Get all commands for a specific tier
 * @param {number} tier - Tier number (1, 2, or 3)
 * @param {Object} capabilities - Node capabilities object
 * @returns {Array} Array of command objects
 */
function getCommandsForTier(tier, capabilities) {
  capabilities = capabilities || {};
  const commands = [];

  for (const key in COMMAND_REGISTRY) {
    const cmd = COMMAND_REGISTRY[key];

    // Filter by tier
    if (cmd.tier !== tier) {
      continue;
    }

    // Check if capability requirement is met
    if (cmd.requires && !capabilities[cmd.requires]) {
      continue;
    }

    commands.push({
      key: key,
      ...cmd
    });
  }

  return commands;
}

/**
 * Get command by key
 * @param {string} key - Command key (e.g., "system.uptime")
 * @returns {Object|null} Command object or null
 */
function getCommand(key) {
  return COMMAND_REGISTRY[key] || null;
}

/**
 * Get all commands that require a specific capability
 * @param {string} capability - Capability name (e.g., "docker")
 * @returns {Array} Array of command objects
 */
function getCommandsByCapability(capability) {
  const commands = [];

  for (const key in COMMAND_REGISTRY) {
    const cmd = COMMAND_REGISTRY[key];
    if (cmd.requires === capability) {
      commands.push({
        key: key,
        ...cmd
      });
    }
  }

  return commands;
}

/**
 * Get interval for a tier
 * @param {number} tier - Tier number (1, 2, or 3)
 * @returns {number} Interval in milliseconds
 */
function getTierInterval(tier) {
  const intervals = {
    1: 5000,    // 5s
    2: 30000,   // 30s
    3: 300000   // 5m
  };
  return intervals[tier] || 5000;
}

module.exports = {
  COMMAND_REGISTRY,
  getCommandsForTier,
  getCommand,
  getCommandsByCapability,
  getTierInterval
};

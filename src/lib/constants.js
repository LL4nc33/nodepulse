/**
 * Application Constants
 * Central location for all magic numbers and configuration values
 *
 * This eliminates scattered magic numbers and provides a single source of truth.
 */

'use strict';

// =============================================================================
// TIMEOUTS (in milliseconds)
// =============================================================================

var TIMEOUTS = {
  // SSH Operations
  SSH_CONNECTION: 10000,        // SSH connection timeout
  SSH_COMMAND: 30000,           // Default command timeout
  SSH_SCRIPT: 60000,            // Default script timeout
  SSH_HARDWARE: 120000,         // Hardware collection (longer scripts)
  SSH_UPGRADE: 600000,          // System upgrade (10 minutes)

  // Script-specific timeouts
  STATS_SCRIPT: 30000,          // stats.sh
  DISCOVERY_SCRIPT: 60000,      // discovery.sh
  HARDWARE_SCRIPT: 120000,      // hardware.sh
  DOCKER_SCRIPT: 60000,         // docker.sh
  PROXMOX_SCRIPT: 120000,       // proxmox.sh
  NETWORK_SCRIPT: 60000,        // network-diagnostics.sh
  LVM_SCRIPT: 60000,            // lvm-discovery.sh
  BACKUP_SCRIPT: 120000,        // backup-discovery.sh
  TASK_SCRIPT: 120000,          // task-discovery.sh

  // Network tests
  PING_TEST: 30000,
  DNS_LOOKUP: 10000,
  TRACEROUTE: 60000,
};

// =============================================================================
// INTERVALS (in milliseconds)
// =============================================================================

var INTERVALS = {
  // Scheduler
  SCHEDULER_TICK: 5000,         // How often to check for nodes to collect
  SCHEDULER_MIN_INTERVAL: 10000, // Minimum time between node collections

  // Caching
  SSH_KEY_CACHE_TTL: 300000,    // SSH key cache (5 minutes)
  CONTROL_PERSIST: 60,          // SSH ControlMaster persist (seconds)

  // Cleanup
  STATS_HISTORY_CLEANUP: 3600000, // Cleanup old stats every hour
};

// =============================================================================
// LIMITS
// =============================================================================

var LIMITS = {
  // Concurrency
  MAX_CONCURRENT_COLLECTIONS: 5,  // Max parallel node collections
  MAX_PING_COUNT: 20,             // Maximum ping count allowed
  MAX_TRACEROUTE_HOPS: 64,        // Maximum traceroute hops

  // Sizes
  MAX_HOSTNAME_LENGTH: 253,       // DNS max hostname length
  ERROR_TRUNCATE_LENGTH: 500,     // Truncate errors for display

  // Counter reset detection
  COUNTER_RESET_THRESHOLD: 1073741824, // 1 GB - likely a reboot
};

// =============================================================================
// DEFAULTS
// =============================================================================

var DEFAULTS = {
  // SSH
  SSH_PORT: 22,

  // Monitoring
  MONITORING_INTERVAL: 30,        // Default node monitoring interval (seconds)
  STATS_RETENTION_HOURS: 168,     // 7 days
  DASHBOARD_REFRESH_INTERVAL: 5000, // 5 seconds

  // Alerts (moved from thresholds.js - kept there for backwards compatibility)
  CPU_WARNING: 80,
  CPU_CRITICAL: 95,
  RAM_WARNING: 85,
  RAM_CRITICAL: 95,
  DISK_WARNING: 80,
  DISK_CRITICAL: 95,
  TEMP_WARNING: 70,
  TEMP_CRITICAL: 85,

  // Agent
  AGENT_SERVER_PORT: 3001,

  // Network tests
  PING_COUNT: 4,
  TRACEROUTE_MAX_HOPS: 20,
};

// =============================================================================
// VALIDATION
// =============================================================================

var VALIDATION = {
  // Timestamp validation
  MIN_TIMESTAMP: new Date('2024-01-01').getTime(),

  // Network target regex (whitelist approach)
  NETWORK_TARGET_REGEX: /^[a-z0-9][a-z0-9.\-:]{0,252}$/,

  // Forbidden shell characters
  SHELL_INJECTION_REGEX: /[;&|`$()><\n\r]/,
};

// =============================================================================
// HTTP STATUS CODES
// =============================================================================

var HTTP = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  TIMEOUTS: TIMEOUTS,
  INTERVALS: INTERVALS,
  LIMITS: LIMITS,
  DEFAULTS: DEFAULTS,
  VALIDATION: VALIDATION,
  HTTP: HTTP
};

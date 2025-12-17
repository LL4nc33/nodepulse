/**
 * Zentrale Parameter-Parsing-Funktionen für nodepulse
 * Eliminiert Code-Duplikation für Query/Body-Parameter
 */

/**
 * Parst einen Integer-Parameter mit Default-Wert
 * @param {*} value - Zu parsender Wert
 * @param {number} defaultValue - Default wenn ungültig/leer
 * @returns {number}
 */
function parseIntParam(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  var parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parst einen Boolean-Parameter
 * @param {*} value - Zu parsender Wert
 * @param {boolean} defaultValue - Default wenn ungültig/leer
 * @returns {boolean}
 */
function parseBoolParam(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return defaultValue;
}

/**
 * Parst einen String-Parameter mit Default-Wert
 * @param {*} value - Zu parsender Wert
 * @param {string} defaultValue - Default wenn leer
 * @returns {string}
 */
function parseStringParam(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return String(value);
}

// ============================================================
// VM/CT Parameter-Parsing
// ============================================================

/**
 * Parst VM-Erstellungsparameter aus Request-Body
 * @param {object} body - Request body
 * @returns {object} Geparste VM-Parameter
 */
function parseVMParams(body) {
  return {
    cores: parseIntParam(body.cores, 2),
    sockets: parseIntParam(body.sockets, 1),
    memory: parseIntParam(body.memory, 2048),
    diskSize: parseIntParam(body.disk_size, 32),
    ostype: parseStringParam(body.ostype, 'l26'),
    bios: parseStringParam(body.bios, 'seabios'),
    netBridge: parseStringParam(body.net_bridge, 'vmbr0'),
    netModel: parseStringParam(body.net_model, 'virtio'),
    startOnBoot: parseBoolParam(body.start_on_boot, false),
    description: parseStringParam(body.description, '')
  };
}

/**
 * Parst CT-Erstellungsparameter aus Request-Body
 * @param {object} body - Request body
 * @returns {object} Geparste CT-Parameter
 */
function parseCTParams(body) {
  return {
    cores: parseIntParam(body.cores, 2),
    memory: parseIntParam(body.memory, 1024),
    diskSize: parseIntParam(body.disk_size, 8),
    swap: parseIntParam(body.swap, 512),
    netBridge: parseStringParam(body.net_bridge, 'vmbr0'),
    ipConfig: parseStringParam(body.ip_config, 'dhcp'),
    gateway: parseStringParam(body.gateway, ''),
    unprivileged: body.unprivileged !== false && body.unprivileged !== 'false',
    nesting: parseBoolParam(body.nesting, false),
    startOnBoot: parseBoolParam(body.start_on_boot, false),
    description: parseStringParam(body.description, '')
  };
}

// ============================================================
// Query-Parameter-Parsing
// ============================================================

/**
 * Standard Query-Parameter Defaults
 */
var QUERY_DEFAULTS = {
  hours: 24,
  limit: 50,
  tail: 100,
  maxHops: 20
};

/**
 * Parst hours-Parameter (für Stats/Charts)
 * @param {*} value - Query-Wert
 * @returns {number}
 */
function parseHoursParam(value) {
  return parseIntParam(value, QUERY_DEFAULTS.hours);
}

/**
 * Parst limit-Parameter (für Paginierung)
 * @param {*} value - Query-Wert
 * @param {number} defaultValue - Optional, default 50
 * @returns {number}
 */
function parseLimitParam(value, defaultValue) {
  return parseIntParam(value, defaultValue || QUERY_DEFAULTS.limit);
}

/**
 * Parst tail-Parameter (für Logs)
 * @param {*} value - Query-Wert
 * @returns {number}
 */
function parseTailParam(value) {
  return parseIntParam(value, QUERY_DEFAULTS.tail);
}

/**
 * Parst maxHops-Parameter (für Traceroute)
 * @param {*} value - Body-Wert
 * @returns {number}
 */
function parseMaxHopsParam(value) {
  return parseIntParam(value, QUERY_DEFAULTS.maxHops);
}

/**
 * Parst monitoring_interval mit Default aus Settings
 * @param {*} value - Interval-Wert
 * @param {number} defaultFromSettings - Default aus Settings
 * @returns {number}
 */
function parseMonitoringInterval(value, defaultFromSettings) {
  return parseIntParam(value, defaultFromSettings || 30);
}

module.exports = {
  // Basis-Parser
  parseIntParam: parseIntParam,
  parseBoolParam: parseBoolParam,
  parseStringParam: parseStringParam,

  // VM/CT Parameter
  parseVMParams: parseVMParams,
  parseCTParams: parseCTParams,

  // Query-Parameter
  parseHoursParam: parseHoursParam,
  parseLimitParam: parseLimitParam,
  parseTailParam: parseTailParam,
  parseMaxHopsParam: parseMaxHopsParam,
  parseMonitoringInterval: parseMonitoringInterval,

  // Defaults Export für Tests
  QUERY_DEFAULTS: QUERY_DEFAULTS
};

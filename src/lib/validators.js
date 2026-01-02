/**
 * Zentrale Validierungs-Funktionen für nodepulse
 * Eliminiert Code-Duplikation in web.js, api/*.js
 */

/**
 * Validiert ein Pflichtfeld
 * @param {*} value - Zu prüfender Wert
 * @param {string} fieldName - Feldname für Fehlermeldung
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateRequired(value, fieldName) {
  if (!value || !String(value).trim()) {
    return { valid: false, error: fieldName + ' ist erforderlich' };
  }
  return { valid: true, value: String(value).trim() };
}

/**
 * Validiert ein Pflichtfeld mit Längenbegrenzung
 * @param {*} value - Zu prüfender Wert
 * @param {string} fieldName - Feldname für Fehlermeldung
 * @param {number} maxLength - Maximale Länge
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateRequiredWithLength(value, fieldName, maxLength) {
  var result = validateRequired(value, fieldName);
  if (!result.valid) return result;

  if (result.value.length > maxLength) {
    return { valid: false, error: fieldName + ' darf maximal ' + maxLength + ' Zeichen lang sein' };
  }
  return result;
}

/**
 * Validiert einen Port (1-65535)
 * @param {*} value - Port-Wert
 * @param {number} defaultValue - Default-Wert wenn leer/ungültig
 * @returns {{ valid: boolean, value: number, error?: string }}
 */
function validatePort(value, defaultValue) {
  defaultValue = defaultValue || 22;

  if (value === undefined || value === null || value === '') {
    return { valid: true, value: defaultValue };
  }

  var port = parseInt(value, 10);
  if (isNaN(port)) {
    return { valid: true, value: defaultValue };
  }

  if (port < 1 || port > 65535) {
    return { valid: false, value: port, error: 'Port muss zwischen 1 und 65535 liegen' };
  }

  return { valid: true, value: port };
}

/**
 * Validiert Node-Input-Daten (name, host, ssh_user, ssh_port)
 * @param {object} data - Input-Daten
 * @returns {{ valid: boolean, errors: string[], data?: object }}
 */
function validateNodeInput(data) {
  var errors = [];
  var validated = {};

  // Name (erforderlich, max 255)
  var nameResult = validateRequiredWithLength(data.name, 'name', 255);
  if (!nameResult.valid) {
    errors.push(nameResult.error);
  } else {
    validated.name = nameResult.value;
  }

  // Host (erforderlich, max 255)
  var hostResult = validateRequiredWithLength(data.host, 'host', 255);
  if (!hostResult.valid) {
    errors.push(hostResult.error);
  } else {
    validated.host = hostResult.value;
  }

  // SSH User (erforderlich, max 64)
  var userResult = validateRequiredWithLength(data.ssh_user, 'ssh_user', 64);
  if (!userResult.valid) {
    errors.push(userResult.error);
  } else {
    validated.ssh_user = userResult.value;
  }

  // SSH Port (optional, default 22)
  var portResult = validatePort(data.ssh_port, 22);
  if (!portResult.valid) {
    errors.push('ssh_port ' + portResult.error);
  } else {
    validated.ssh_port = portResult.value;
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    data: validated
  };
}

/**
 * Validiert einen Command-String
 * @param {*} command - Command
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateCommand(command) {
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    return { valid: false, error: 'Command ist erforderlich' };
  }
  return { valid: true, value: command.trim() };
}

/**
 * Validiert Cores-Parameter (1-128)
 * @param {*} value - Cores-Wert
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateCores(value) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, value: undefined };
  }

  var cores = parseInt(value, 10);
  if (isNaN(cores) || cores < 1 || cores > 128) {
    return { valid: false, error: 'cores muss zwischen 1 und 128 liegen' };
  }
  return { valid: true, value: cores };
}

/**
 * Validiert Memory-Parameter (16 - 1048576 MB)
 * @param {*} value - Memory-Wert in MB
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateMemory(value) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, value: undefined };
  }

  var memory = parseInt(value, 10);
  if (isNaN(memory) || memory < 16 || memory > 1048576) {
    return { valid: false, error: 'memory muss zwischen 16 und 1048576 MB liegen' };
  }
  return { valid: true, value: memory };
}

/**
 * Validiert VM/CT Resize-Parameter (cores und/oder memory)
 * @param {object} data - { cores, memory }
 * @returns {{ valid: boolean, errors: string[], data?: object }}
 */
function validateResizeParams(data) {
  var errors = [];
  var validated = {};

  // Mindestens eines muss angegeben sein
  if (data.cores === undefined && data.memory === undefined) {
    return {
      valid: false,
      errors: ['Mindestens cores oder memory muss angegeben werden'],
      data: null
    };
  }

  if (data.cores !== undefined) {
    var coresResult = validateCores(data.cores);
    if (!coresResult.valid) {
      errors.push(coresResult.error);
    } else {
      validated.cores = coresResult.value;
    }
  }

  if (data.memory !== undefined) {
    var memoryResult = validateMemory(data.memory);
    if (!memoryResult.valid) {
      errors.push(memoryResult.error);
    } else {
      validated.memory = memoryResult.value;
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    data: validated
  };
}

/**
 * Validiert eine IPv4 oder IPv6 Adresse
 * @param {*} ip - IP-Adresse
 * @returns {boolean} true wenn valide IP
 */
function isValidIP(ip) {
  if (!ip || typeof ip !== 'string') return false;
  if (ip.length > 45) return false;  // IPv6 max length

  // IPv4 Pattern
  var ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(ip)) {
    var parts = ip.split('.');
    for (var i = 0; i < parts.length; i++) {
      var num = parseInt(parts[i], 10);
      if (num < 0 || num > 255) return false;
    }
    return true;
  }

  // IPv6 Pattern (vereinfacht - erlaubt :: Kompression)
  var ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Pattern.test(ip);
}

module.exports = {
  validateRequired: validateRequired,
  validateRequiredWithLength: validateRequiredWithLength,
  validatePort: validatePort,
  validateNodeInput: validateNodeInput,
  validateCommand: validateCommand,
  validateCores: validateCores,
  validateMemory: validateMemory,
  validateResizeParams: validateResizeParams,
  isValidIP: isValidIP
};

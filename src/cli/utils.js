/**
 * nodepulse CLI - Utility functions
 */

const http = require('http');
const https = require('https');
const { formatBytes } = require('../lib/utils');

// Default API configuration
const DEFAULT_HOST = process.env.NP_HOST || 'localhost';
const DEFAULT_PORT = process.env.NP_PORT || 3000;
const DEFAULT_PROTOCOL = process.env.NP_PROTOCOL || 'http';

/**
 * Make HTTP request to API
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {Object} [data] - Request body for POST/PUT
 * @param {Object} [options] - Override options
 * @returns {Promise<Object>}
 */
function apiRequest(method, path, data, options) {
  options = options || {};

  var host = options.host || DEFAULT_HOST;
  var port = options.port || DEFAULT_PORT;
  var protocol = options.protocol || DEFAULT_PROTOCOL;

  return new Promise(function(resolve, reject) {
    var requestOptions = {
      hostname: host,
      port: port,
      path: '/api' + path,
      method: method.toUpperCase(),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    var httpModule = protocol === 'https' ? https : http;

    var req = httpModule.request(requestOptions, function(res) {
      var body = '';

      res.on('data', function(chunk) {
        body += chunk;
      });

      res.on('end', function() {
        try {
          var parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({
              status: res.statusCode,
              error: parsed.error || { message: 'API Error' },
            });
          }
        } catch (e) {
          reject({
            status: res.statusCode,
            error: { message: 'Invalid JSON response' },
          });
        }
      });
    });

    req.on('error', function(err) {
      reject({
        status: 0,
        error: { message: 'Connection failed: ' + err.message },
      });
    });

    req.on('timeout', function() {
      req.destroy();
      reject({
        status: 0,
        error: { message: 'Request timeout' },
      });
    });

    if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// formatBytes is imported from ../lib/utils

/**
 * Format percentage
 * @param {number} value
 * @returns {string}
 */
function formatPercent(value) {
  if (value === null || value === undefined) return '-';
  return value.toFixed(1) + '%';
}

/**
 * Format uptime
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  if (!seconds) return '-';
  var days = Math.floor(seconds / 86400);
  var hours = Math.floor((seconds % 86400) / 3600);
  var mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return days + 'd ' + hours + 'h';
  } else if (hours > 0) {
    return hours + 'h ' + mins + 'm';
  } else {
    return mins + 'm';
  }
}

/**
 * Colorize text for terminal
 * @param {string} text
 * @param {string} color - red, green, yellow, blue, cyan, gray
 * @returns {string}
 */
function colorize(text, color) {
  var colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
  };

  if (!colors[color]) return text;
  return colors[color] + text + colors.reset;
}

/**
 * Print table to console
 * @param {Array} headers - Column headers
 * @param {Array} rows - Array of row arrays
 * @param {Object} [options] - Table options
 */
function printTable(headers, rows, options) {
  options = options || {};
  var padding = options.padding || 2;

  // Calculate column widths
  var widths = headers.map(function(h, i) {
    var maxWidth = String(h).length;
    rows.forEach(function(row) {
      var cellValue = String(row[i] || '');
      // Remove ANSI codes for width calculation
      var plainValue = cellValue.replace(/\x1b\[[0-9;]*m/g, '');
      if (plainValue.length > maxWidth) {
        maxWidth = plainValue.length;
      }
    });
    return maxWidth;
  });

  // Print header
  var headerLine = '';
  headers.forEach(function(h, i) {
    headerLine += padRight(String(h), widths[i] + padding);
  });
  console.log(colorize(headerLine, 'bold'));

  // Print separator
  var separator = '';
  widths.forEach(function(w) {
    separator += repeat('-', w + padding);
  });
  console.log(colorize(separator, 'gray'));

  // Print rows
  rows.forEach(function(row) {
    var line = '';
    row.forEach(function(cell, i) {
      var cellValue = String(cell || '');
      // Calculate padding based on plain text length
      var plainValue = cellValue.replace(/\x1b\[[0-9;]*m/g, '');
      var paddingNeeded = widths[i] - plainValue.length + padding;
      line += cellValue + repeat(' ', Math.max(paddingNeeded, 1));
    });
    console.log(line);
  });
}

/**
 * Pad string to right
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
function padRight(str, len) {
  while (str.length < len) {
    str += ' ';
  }
  return str;
}

/**
 * Repeat string
 * @param {string} str
 * @param {number} count
 * @returns {string}
 */
function repeat(str, count) {
  var result = '';
  for (var i = 0; i < count; i++) {
    result += str;
  }
  return result;
}

/**
 * Parse command line arguments
 * @param {Array} args
 * @returns {Object}
 */
function parseArgs(args) {
  var result = {
    command: null,
    subcommand: null,
    args: [],
    flags: {},
  };

  var i = 0;
  while (i < args.length) {
    var arg = args[i];

    if (arg.startsWith('--')) {
      // Long flag
      var parts = arg.substring(2).split('=');
      var key = parts[0];
      var value = parts[1] || true;
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      result.flags[key] = value;
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flag
      var shortKey = arg.substring(1);
      // Check if next arg is value
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.flags[shortKey] = args[i + 1];
        i++;
      } else {
        result.flags[shortKey] = true;
      }
    } else {
      // Positional argument
      if (!result.command) {
        result.command = arg;
      } else if (!result.subcommand) {
        result.subcommand = arg;
      } else {
        result.args.push(arg);
      }
    }
    i++;
  }

  return result;
}

/**
 * Print error message
 * @param {string} message
 */
function printError(message) {
  console.error(colorize('Error: ', 'red') + message);
}

/**
 * Print success message
 * @param {string} message
 */
function printSuccess(message) {
  console.log(colorize('✓ ', 'green') + message);
}

/**
 * Print warning message
 * @param {string} message
 */
function printWarning(message) {
  console.log(colorize('⚠ ', 'yellow') + message);
}

/**
 * Print info message
 * @param {string} message
 */
function printInfo(message) {
  console.log(colorize('ℹ ', 'blue') + message);
}

module.exports = {
  apiRequest: apiRequest,
  formatBytes: formatBytes,
  formatPercent: formatPercent,
  formatUptime: formatUptime,
  colorize: colorize,
  printTable: printTable,
  parseArgs: parseArgs,
  printError: printError,
  printSuccess: printSuccess,
  printWarning: printWarning,
  printInfo: printInfo,
  DEFAULT_HOST: DEFAULT_HOST,
  DEFAULT_PORT: DEFAULT_PORT,
};

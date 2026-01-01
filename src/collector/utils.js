/**
 * Collector Utilities
 * Shared helper functions for all collector modules
 */

'use strict';

var fs = require('fs');
var path = require('path');

// Scripts directory path
var scriptsDir = path.join(__dirname, '../../scripts');

/**
 * Get script content from scripts directory
 * @param {string} name - Script filename
 * @returns {string} Script content
 */
function getScript(name) {
  var scriptPath = path.join(scriptsDir, name);
  // Convert CRLF to LF for Linux compatibility
  return fs.readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Truncate string for error messages
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length (default: 500)
 * @returns {string} Truncated string
 */
function truncateForError(str, maxLen) {
  maxLen = maxLen || 500;
  if (!str) return '(empty)';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '... (truncated)';
}

/**
 * Parse JSON output from scripts (handles malformed JSON)
 * Uses balanced brace matching to find first complete JSON object
 * Includes raw output snippet in error for debugging
 * @param {string} output - Script output
 * @param {string} nodeName - Node name for error messages
 * @returns {Object} Parsed JSON object
 */
function parseScriptOutput(output, nodeName) {
  nodeName = nodeName || 'unknown';

  if (!output || typeof output !== 'string') {
    var error = new Error('Empty or invalid script output');
    error.rawOutput = '(no output)';
    throw error;
  }

  // Trim whitespace
  var trimmed = output.trim();

  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // Try to find JSON object - use balanced brace matching
    var braceCount = 0;
    var startIndex = -1;
    var endIndex = -1;

    for (var i = 0; i < trimmed.length; i++) {
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
      var jsonStr = trimmed.substring(startIndex, endIndex);
      try {
        return JSON.parse(jsonStr);
      } catch (e2) {
        // Include position info and raw output snippet
        var error2 = new Error('Invalid JSON in output: ' + e2.message);
        error2.rawOutput = truncateForError(jsonStr);
        error2.position = (e2.message.match(/position (\d+)/) || [])[1] || 'unknown';
        console.error('[COLLECTOR] JSON parse error for ' + nodeName + ':', e2.message);
        console.error('[COLLECTOR] Raw output (first 300 chars):', trimmed.substring(0, 300));
        // Show context around error position
        var pos = parseInt((e2.message.match(/position (\d+)/) || [])[1] || '0', 10);
        if (pos > 0) {
          console.error('[COLLECTOR] Context around position ' + pos + ':', jsonStr.substring(Math.max(0, pos - 50), pos + 50));
        }
        throw error2;
      }
    }

    // No valid JSON found
    var error3 = new Error('No valid JSON found in output: ' + e.message);
    error3.rawOutput = truncateForError(trimmed);
    console.error('[COLLECTOR] No JSON found for ' + nodeName + '. Output (first 300 chars):', trimmed.substring(0, 300));
    throw error3;
  }
}

module.exports = {
  getScript: getScript,
  truncateForError: truncateForError,
  parseScriptOutput: parseScriptOutput
};

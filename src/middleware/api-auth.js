/**
 * API Authentication Middleware
 * Validates API-Key header for protected routes
 *
 * Features:
 * - X-API-Key header validation
 * - Optional localhost whitelist
 * - Configurable via settings
 */

'use strict';

var crypto = require('crypto');

/**
 * Generate a new API key
 * @returns {string} 64-character hex string
 */
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if request is from localhost
 * @param {Object} req - Express request
 * @returns {boolean}
 */
function isLocalhost(req) {
  var ip = req.ip || req.connection.remoteAddress || '';
  // Handle IPv4 and IPv6 localhost
  return ip === '127.0.0.1' ||
         ip === '::1' ||
         ip === '::ffff:127.0.0.1' ||
         ip.startsWith('192.168.') ||  // Local network
         ip.startsWith('10.') ||        // Private network
         ip.startsWith('172.');         // Private network (partial check)
}

/**
 * Parse API keys from settings
 * @param {string} apiKeysJson - JSON string of API keys
 * @returns {Array} Array of API key objects
 */
function parseApiKeys(apiKeysJson) {
  if (!apiKeysJson) return [];
  try {
    var keys = JSON.parse(apiKeysJson);
    return Array.isArray(keys) ? keys : [];
  } catch (e) {
    console.error('[API Auth] Failed to parse api_keys:', e.message);
    return [];
  }
}

/**
 * Validate API key
 * @param {string} providedKey - Key from request header
 * @param {Array} validKeys - Array of valid key objects
 * @returns {Object|null} Matching key object or null
 */
function validateApiKey(providedKey, validKeys) {
  if (!providedKey || !validKeys.length) return null;

  for (var i = 0; i < validKeys.length; i++) {
    // Use timing-safe comparison to prevent timing attacks
    var keyBuffer = Buffer.from(validKeys[i].key || '', 'utf8');
    var providedBuffer = Buffer.from(providedKey, 'utf8');

    if (keyBuffer.length === providedBuffer.length) {
      try {
        if (crypto.timingSafeEqual(keyBuffer, providedBuffer)) {
          return validKeys[i];
        }
      } catch (e) {
        // Length mismatch caught by crypto.timingSafeEqual
      }
    }
  }
  return null;
}

/**
 * Middleware factory
 * @param {Object} db - Database instance
 * @returns {Function} Express middleware
 */
module.exports = function(db) {
  return function apiAuthMiddleware(req, res, next) {
    // Get settings
    var settings = db.settings.getAll();

    // Check if API auth is enabled
    if (settings.api_auth_enabled !== 'true') {
      // API auth disabled - allow all requests
      return next();
    }

    // Check localhost whitelist
    var whitelistLocal = settings.api_auth_whitelist_local !== 'false'; // Default true
    if (whitelistLocal && isLocalhost(req)) {
      req.apiAuthMethod = 'localhost';
      return next();
    }

    // Get API key from header
    var apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'API-Key required. Set X-API-Key header.'
        }
      });
    }

    // Validate API key
    var validKeys = parseApiKeys(settings.api_keys);
    var matchedKey = validateApiKey(apiKey, validKeys);

    if (!matchedKey) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'AUTH_INVALID',
          message: 'Invalid API-Key.'
        }
      });
    }

    // Attach key info to request for logging/auditing
    req.apiAuthMethod = 'api_key';
    req.apiKeyName = matchedKey.name || 'unnamed';

    next();
  };
};

// Export utilities for API key management
module.exports.generateApiKey = generateApiKey;
module.exports.parseApiKeys = parseApiKeys;

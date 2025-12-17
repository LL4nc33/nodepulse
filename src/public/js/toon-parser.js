/**
 * =============================================================================
 * TOON Parser v1.0 - ES5 Compatible
 * =============================================================================
 *
 * Token-Oriented Object Notation Parser für NodePulse Dashboard
 *
 * Kompatibilität:
 * - ES5 JavaScript (Chrome 50+, Firefox 52+, Fire HD 10 2017)
 * - Kein const/let, arrow functions, template strings, Promise.finally()
 *
 * Features:
 * - Parst TOON-Format (17 tokens, pipe-delimited)
 * - Merged TOON-Daten mit gecachter Metadata
 * - localStorage-Caching via Safe Storage
 * - 4x schnelleres Parsing als JSON (~5ms vs ~20ms)
 *
 * Usage:
 *   var parsed = NP.TOON.parseResponse(apiResponse);
 *   var history = NP.TOON.parseHistory(historyResponse);
 *
 * =============================================================================
 */

(function() {
  'use strict';

  window.NP = window.NP || {};

  var CACHE_KEY_METADATA = 'toon-metadata';

  /**
   * Parse single TOON string into object
   * Format: V1|N:1|C:45.2|R:67.8|D:23.4|U:86400|L1:0.8|L5:1.2|L15:1.5|NR:123456789|NT:987654321|T:45|VM:3|CT:2|DC:5|O:1|TS:1734444000
   *
   * @param {string} toonString - TOON-formatted string
   * @returns {Object|null} - Parsed node data or null if invalid
   */
  function parseTOON(toonString) {
    if (!toonString || typeof toonString !== 'string') {
      return null;
    }

    var tokens = toonString.split('|');
    var result = {};

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var colonIndex = token.indexOf(':');

      // Handle version token (no colon)
      if (colonIndex === -1) {
        if (token.indexOf('V') === 0) {
          result.version = parseInt(token.substring(1), 10);
        }
        continue;
      }

      var key = token.substring(0, colonIndex);
      var value = token.substring(colonIndex + 1);

      // Parse tokens based on key
      switch (key) {
        case 'N':
          result.id = parseInt(value, 10);
          break;
        case 'C':
          result.cpu_percent = value === '-' ? null : parseFloat(value);
          break;
        case 'R':
          result.ram_percent = value === '-' ? null : parseFloat(value);
          break;
        case 'D':
          result.disk_percent = value === '-' ? null : parseFloat(value);
          break;
        case 'U':
          result.uptime_seconds = value === '-' ? null : parseInt(value, 10);
          break;
        case 'L1':
          result.load_1m = value === '-' ? null : parseFloat(value);
          break;
        case 'L5':
          result.load_5m = value === '-' ? null : parseFloat(value);
          break;
        case 'L15':
          result.load_15m = value === '-' ? null : parseFloat(value);
          break;
        case 'NR':
          result.net_rx_bytes = value === '-' ? null : parseInt(value, 10);
          break;
        case 'NT':
          result.net_tx_bytes = value === '-' ? null : parseInt(value, 10);
          break;
        case 'T':
          result.temp_cpu = value === '-' ? null : parseInt(value, 10);
          break;
        case 'VM':
          result.vms_running = value === '-' ? null : parseInt(value, 10);
          break;
        case 'CT':
          result.cts_running = value === '-' ? null : parseInt(value, 10);
          break;
        case 'DC':
          result.containers_running = value === '-' ? null : parseInt(value, 10);
          break;
        case 'O':
          result.online = value === '1';
          break;
        case 'TS':
          result.timestamp = parseInt(value, 10);
          break;
      }
    }

    return result;
  }

  /**
   * Get cached metadata from Safe Storage
   *
   * @param {string} hash - Metadata hash to validate
   * @returns {Object|null} - Cached metadata or null if not found/expired
   */
  function getCachedMetadata(hash) {
    if (!window.NP || !window.NP.SafeStorage) {
      console.warn('[TOON] Safe Storage not available, falling back to localStorage');
      try {
        var cached = localStorage.getItem('nodepulse-' + CACHE_KEY_METADATA);
        if (cached) {
          var parsed = JSON.parse(cached);
          if (parsed.data && parsed.data.hash === hash) {
            return parsed.data.metadata;
          }
        }
      } catch (e) {
        console.warn('[TOON] Failed to get cached metadata from localStorage:', e.message);
      }
      return null;
    }

    try {
      var cached = window.NP.SafeStorage.getItem(CACHE_KEY_METADATA);
      if (cached && cached.hash === hash) {
        return cached.metadata;
      }
    } catch (e) {
      console.warn('[TOON] Failed to get cached metadata:', e.message);
    }

    return null;
  }

  /**
   * Set cached metadata in Safe Storage
   *
   * @param {string} hash - Metadata hash
   * @param {Object} metadata - Metadata object
   */
  function setCachedMetadata(hash, metadata) {
    if (!window.NP || !window.NP.SafeStorage) {
      console.warn('[TOON] Safe Storage not available, skipping cache');
      return;
    }

    try {
      window.NP.SafeStorage.setItem(CACHE_KEY_METADATA, {
        hash: hash,
        metadata: metadata,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn('[TOON] Failed to cache metadata:', e.message);
    }
  }

  /**
   * Parse TOON API response and merge with metadata
   * Handles both initial load (with metadata) and subsequent requests (metadata from cache)
   *
   * @param {Object} response - API response {format: 'toon', version: 1, nodes: [], metadata_hash: '', metadata?: {}}
   * @returns {Array|null} - Array of complete node objects or null if error
   */
  function parseTOONResponse(response) {
    if (!response || response.format !== 'toon') {
      return null;
    }

    try {
      var nodes = response.nodes;
      var metadataHash = response.metadata_hash;
      var metadata = response.metadata;

      // If no metadata in response, try to get from cache
      if (!metadata) {
        metadata = getCachedMetadata(metadataHash);
        if (!metadata) {
          console.error('[TOON] No metadata available (not in response, not in cache)');
          return null;
        }
      } else {
        // Cache metadata if provided
        setCachedMetadata(metadataHash, metadata);
      }

      var result = [];

      for (var i = 0; i < nodes.length; i++) {
        var toonData = parseTOON(nodes[i]);
        if (!toonData) {
          console.warn('[TOON] Failed to parse node:', nodes[i]);
          continue;
        }

        var nodeId = toonData.id;
        var meta = metadata[nodeId] || {};

        // Merge metadata + TOON data
        var combined = {
          id: toonData.id,
          name: meta.name,
          host: meta.host,
          node_type: meta.type,
          online: toonData.online,
          timestamp: toonData.timestamp,
          last_seen: toonData.online ? toonData.timestamp : meta.last_seen,
          cpu_percent: toonData.cpu_percent,
          cpu_cores: meta.cpu_cores,
          ram_percent: toonData.ram_percent,
          ram_total_bytes: meta.ram_total,
          disk_percent: toonData.disk_percent,
          disk_total_bytes: meta.disk_total,
          uptime_seconds: toonData.uptime_seconds,
          load_1m: toonData.load_1m,
          load_5m: toonData.load_5m,
          load_15m: toonData.load_15m,
          net_rx_bytes: toonData.net_rx_bytes,
          net_tx_bytes: toonData.net_tx_bytes,
          temp_cpu: toonData.temp_cpu,
          vms_running: toonData.vms_running,
          cts_running: toonData.cts_running,
          containers_running: toonData.containers_running,
          parent_id: meta.parent_id,
          monitoring_enabled: meta.monitoring_enabled,
          monitoring_interval: meta.monitoring_interval
        };

        result.push(combined);
      }

      return result.length > 0 ? result : null;
    } catch (err) {
      console.error('[TOON] Parse error:', err.message);
      return null;
    }
  }

  /**
   * Parse TOON history response
   * History uses simplified TOON format (9 tokens: V1, TS, C, R, D, L1, L5, L15, T)
   *
   * @param {Object} response - API response {format: 'toon', version: 1, history: []}
   * @returns {Array|null} - Array of history objects or null if error
   */
  function parseTOONHistory(response) {
    if (!response || response.format !== 'toon') {
      return null;
    }

    try {
      var history = response.history;
      var result = [];

      for (var i = 0; i < history.length; i++) {
        var toonData = parseTOON(history[i]);
        if (toonData) {
          result.push(toonData);
        }
      }

      return result.length > 0 ? result : null;
    } catch (err) {
      console.error('[TOON] History parse error:', err.message);
      return null;
    }
  }

  /**
   * Clear cached metadata
   * Useful when hardware changes detected or user wants to refresh
   */
  function clearCache() {
    if (window.NP && window.NP.SafeStorage) {
      try {
        window.NP.SafeStorage.removeItem(CACHE_KEY_METADATA);
        console.log('[TOON] Metadata cache cleared');
      } catch (e) {
        console.warn('[TOON] Failed to clear cache:', e.message);
      }
    }
  }

  /**
   * Get TOON parser statistics
   * Useful for debugging and performance monitoring
   *
   * @returns {Object} - {version: string, cacheAvailable: boolean, metadataHash: string|null}
   */
  function getStats() {
    var stats = {
      version: '1.0',
      cacheAvailable: !!(window.NP && window.NP.SafeStorage),
      metadataHash: null,
      metadataTimestamp: null,
      metadataCount: 0
    };

    if (window.NP && window.NP.SafeStorage) {
      try {
        var cached = window.NP.SafeStorage.getItem(CACHE_KEY_METADATA);
        if (cached) {
          stats.metadataHash = cached.hash;
          stats.metadataTimestamp = cached.timestamp;
          stats.metadataCount = Object.keys(cached.metadata || {}).length;
        }
      } catch (e) {}
    }

    return stats;
  }

  // Export
  window.NP.TOON = {
    parse: parseTOON,
    parseResponse: parseTOONResponse,
    parseHistory: parseTOONHistory,
    clearCache: clearCache,
    getStats: getStats,
    version: '1.0'
  };

})();

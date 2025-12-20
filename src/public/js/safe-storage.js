/**
 * =============================================================================
 * SAFE STORAGE WRAPPER - LRU Eviction for localStorage (TOON Integration)
 * =============================================================================
 *
 * Problem: Fire HD 10 (2017) has 5-10 MB localStorage quota
 * - TOON metadata (50 nodes × 500 bytes) + old data fills quota
 * - localStorage.setItem() throws QuotaExceededError
 * - Metadata not cached → every request loads metadata → no performance gain
 *
 * Solution: LRU (Least Recently Used) Eviction
 * - Track usage across all nodepulse-* keys
 * - Evict oldest 20% when quota approached
 * - 2 MB safe limit (leaves buffer for other apps)
 *
 * Features:
 * - Estimates storage size (UTF-16 = 2 bytes/char)
 * - LRU eviction based on timestamp
 * - Graceful degradation on quota errors
 * - ES5 compatible (Chrome 50+, Fire HD 10 2017)
 *
 * Usage:
 *   SafeStorage.setItem('toon-metadata', { hash: 'abc123', data: {...} });
 *   var cached = SafeStorage.getItem('toon-metadata');
 *
 * =============================================================================
 */

(function() {
  'use strict';

  window.NP = window.NP || {};

  var MAX_SIZE = 2 * 1024 * 1024; // 2 MB (Fire HD 10 safe limit)
  var CACHE_KEY_PREFIX = 'nodepulse-';
  var EVICTION_RATE = 0.2; // Remove oldest 20% when quota approached

  /**
   * Estimate total localStorage size for nodepulse keys
   * UTF-16 encoding = 2 bytes per character
   *
   * @returns {number} - Estimated size in bytes
   */
  function estimateSize() {
    var total = 0;

    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(CACHE_KEY_PREFIX) === 0) {
          var value = localStorage.getItem(key);
          if (value) {
            total += (key.length + value.length) * 2; // UTF-16 = 2 bytes/char
          }
        }
      }
    } catch (e) {
      console.warn('[SafeStorage] Failed to estimate size:', e.message);
    }

    return total;
  }

  /**
   * Get all nodepulse keys sorted by timestamp (oldest first)
   *
   * @returns {Array} - Array of {key: string, timestamp: number} sorted by timestamp
   */
  function getSortedKeys() {
    var keys = [];

    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(CACHE_KEY_PREFIX) === 0) {
          try {
            var value = localStorage.getItem(key);
            if (value) {
              var parsed = JSON.parse(value);
              keys.push({
                key: key,
                timestamp: parsed.timestamp || 0
              });
            }
          } catch (e) {
            // Invalid JSON or no timestamp - treat as very old
            keys.push({
              key: key,
              timestamp: 0
            });
          }
        }
      }
    } catch (e) {
      console.warn('[SafeStorage] Failed to get sorted keys:', e.message);
    }

    // Sort by timestamp (oldest first)
    keys.sort(function(a, b) {
      return a.timestamp - b.timestamp;
    });

    return keys;
  }

  /**
   * Evict oldest items (LRU eviction)
   * Removes oldest 20% of nodepulse items
   */
  function evictOldest() {
    var keys = getSortedKeys();
    var removeCount = Math.max(1, Math.floor(keys.length * EVICTION_RATE));

    console.log('[SafeStorage] Evicting oldest ' + removeCount + ' items (total: ' + keys.length + ')');

    for (var i = 0; i < removeCount && i < keys.length; i++) {
      try {
        localStorage.removeItem(keys[i].key);
      } catch (e) {
        console.warn('[SafeStorage] Failed to remove ' + keys[i].key + ':', e.message);
      }
    }
  }

  /**
   * Store item with automatic eviction if quota exceeded
   *
   * @param {string} key - Storage key (without prefix)
   * @param {*} value - Value to store (will be JSON.stringify'd with timestamp)
   * @returns {boolean} - True if stored, false if failed
   */
  function setItem(key, value) {
    var fullKey = CACHE_KEY_PREFIX + key;

    // Wrap value with timestamp for LRU tracking
    var wrappedValue = {
      timestamp: Date.now(),
      data: value
    };

    var valueStr = JSON.stringify(wrappedValue);
    var itemSize = (fullKey.length + valueStr.length) * 2; // UTF-16

    // Check if adding this item would exceed quota
    var currentSize = estimateSize();
    if (currentSize + itemSize > MAX_SIZE) {
      console.log('[SafeStorage] Approaching quota (' + currentSize + ' + ' + itemSize + ' > ' + MAX_SIZE + '), evicting...');
      evictOldest();
    }

    // Try to store
    try {
      localStorage.setItem(fullKey, valueStr);
      return true;
    } catch (e) {
      // Quota exceeded even after eviction
      if (e.name === 'QuotaExceededError') {
        console.warn('[SafeStorage] Quota exceeded, evicting more items...');
        evictOldest();

        // Retry once
        try {
          localStorage.setItem(fullKey, valueStr);
          return true;
        } catch (e2) {
          console.error('[SafeStorage] Storage full after eviction, item not saved');
          return false;
        }
      }

      console.error('[SafeStorage] Failed to store item:', e.message);
      return false;
    }
  }

  /**
   * Retrieve item from storage
   *
   * @param {string} key - Storage key (without prefix)
   * @returns {*} - Stored data or null if not found
   */
  function getItem(key) {
    var fullKey = CACHE_KEY_PREFIX + key;

    try {
      var valueStr = localStorage.getItem(fullKey);
      if (!valueStr) {
        return null;
      }

      var parsed = JSON.parse(valueStr);

      // Unwrap: return data, not wrapper
      return parsed.data !== undefined ? parsed.data : parsed;
    } catch (e) {
      console.warn('[SafeStorage] Failed to get item ' + key + ':', e.message);
      return null;
    }
  }

  /**
   * Remove item from storage
   *
   * @param {string} key - Storage key (without prefix)
   */
  function removeItem(key) {
    var fullKey = CACHE_KEY_PREFIX + key;

    try {
      localStorage.removeItem(fullKey);
    } catch (e) {
      console.warn('[SafeStorage] Failed to remove item ' + key + ':', e.message);
    }
  }

  /**
   * Clear all nodepulse items from storage
   */
  function clear() {
    var keys = [];

    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(CACHE_KEY_PREFIX) === 0) {
          keys.push(key);
        }
      }

      for (var j = 0; j < keys.length; j++) {
        localStorage.removeItem(keys[j]);
      }

      console.log('[SafeStorage] Cleared ' + keys.length + ' items');
    } catch (e) {
      console.error('[SafeStorage] Failed to clear storage:', e.message);
    }
  }

  /**
   * Get storage statistics
   *
   * @returns {Object} - {size: number, count: number, maxSize: number, percentUsed: number}
   */
  function getStats() {
    var size = estimateSize();
    var keys = getSortedKeys();

    return {
      size: size,
      count: keys.length,
      maxSize: MAX_SIZE,
      percentUsed: Math.round((size / MAX_SIZE) * 100),
      sizeFormatted: formatBytes(size),
      maxSizeFormatted: formatBytes(MAX_SIZE)
    };
  }

  /**
   * Format bytes to human-readable string
   *
   * @param {number} bytes - Bytes
   * @returns {string} - Formatted string (e.g., "1.5 MB")
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
  }

  // Export
  window.NP.SafeStorage = {
    setItem: setItem,
    getItem: getItem,
    removeItem: removeItem,
    clear: clear,
    getStats: getStats,
    estimateSize: estimateSize,
    version: '1.0'
  };

})();

'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

// Settings Cache für Performance (RPi 2B Optimierung)
let settingsCache = null;

const settings = {
  /**
   * Load all settings into cache
   * @private
   */
  _loadCache() {
    const stmt = getDb().prepare('SELECT * FROM settings');
    const rows = stmt.all();
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    settingsCache = result;
    return result;
  },

  /**
   * Invalidate cache (call after set())
   * @private
   */
  _invalidateCache() {
    settingsCache = null;
  },

  /**
   * Get a setting value (cached)
   */
  get(key, defaultValue = null) {
    if (!settingsCache) {
      this._loadCache();
    }
    return settingsCache[key] !== undefined ? settingsCache[key] : defaultValue;
  },

  /**
   * Set a setting value (invalidates cache)
   */
  set(key, value) {
    const stmt = getDb().prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const result = stmt.run(key, value);
    this._invalidateCache();
    return result;
  },

  /**
   * Get all settings (cached)
   */
  getAll() {
    if (!settingsCache) {
      this._loadCache();
    }
    // Return shallow copy to prevent external modifications
    return Object.assign({}, settingsCache);
  },
};

module.exports = { init, settings };

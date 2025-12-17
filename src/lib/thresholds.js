/**
 * Zentrale Threshold- und Settings-Konfiguration für nodepulse
 * Eliminiert Code-Duplikation für Alert-Thresholds und Settings-Keys
 */

/**
 * Standard-Threshold-Werte
 */
var DEFAULTS = {
  cpu_warning: 80,
  cpu_critical: 95,
  ram_warning: 85,
  ram_critical: 95,
  disk_warning: 80,
  disk_critical: 95,
  temp_warning: 70,
  temp_critical: 85
};

/**
 * Alle gültigen Settings-Keys (Single Source of Truth)
 */
var VALID_SETTINGS_KEYS = [
  // Auto-Discovery
  'auto_discovery_enabled',
  'rediscovery_on_connect',

  // Monitoring
  'monitoring_default_interval',
  'stats_retention_hours',
  'dashboard_refresh_interval',
  'chart_default_hours',

  // Alert Thresholds - CPU
  'alert_cpu_warning',
  'alert_cpu_critical',

  // Alert Thresholds - RAM
  'alert_ram_warning',
  'alert_ram_critical',

  // Alert Thresholds - Disk
  'alert_disk_warning',
  'alert_disk_critical',

  // Alert Thresholds - Temperature
  'alert_temp_warning',
  'alert_temp_critical',

  // UI Settings
  'toast_notifications_enabled',

  // Import Settings
  'import_inherit_credentials'
];

/**
 * Parst Thresholds aus Settings-Objekt
 * @param {object} settings - Settings-Objekt (aus db.settings.getAll())
 * @returns {object} Geparste Threshold-Werte
 */
function getThresholds(settings) {
  settings = settings || {};

  return {
    cpu_warning: parseThreshold(settings.alert_cpu_warning, DEFAULTS.cpu_warning),
    cpu_critical: parseThreshold(settings.alert_cpu_critical, DEFAULTS.cpu_critical),
    ram_warning: parseThreshold(settings.alert_ram_warning, DEFAULTS.ram_warning),
    ram_critical: parseThreshold(settings.alert_ram_critical, DEFAULTS.ram_critical),
    disk_warning: parseThreshold(settings.alert_disk_warning, DEFAULTS.disk_warning),
    disk_critical: parseThreshold(settings.alert_disk_critical, DEFAULTS.disk_critical),
    temp_warning: parseThreshold(settings.alert_temp_warning, DEFAULTS.temp_warning),
    temp_critical: parseThreshold(settings.alert_temp_critical, DEFAULTS.temp_critical)
  };
}

/**
 * Parst einen einzelnen Threshold-Wert
 * @param {*} value - Wert aus Settings
 * @param {number} defaultValue - Default wenn ungültig
 * @returns {number}
 */
function parseThreshold(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  var parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Prüft ob ein Settings-Key gültig ist
 * @param {string} key - Settings-Key
 * @returns {boolean}
 */
function isValidSettingsKey(key) {
  return VALID_SETTINGS_KEYS.indexOf(key) !== -1;
}

/**
 * Filtert ungültige Settings-Keys aus einem Objekt
 * @param {object} settings - Settings-Objekt
 * @returns {object} Gefiltertes Objekt nur mit gültigen Keys
 */
function filterValidSettings(settings) {
  var filtered = {};
  for (var key in settings) {
    if (settings.hasOwnProperty(key) && isValidSettingsKey(key)) {
      filtered[key] = settings[key];
    }
  }
  return filtered;
}

module.exports = {
  DEFAULTS: DEFAULTS,
  VALID_SETTINGS_KEYS: VALID_SETTINGS_KEYS,
  getThresholds: getThresholds,
  parseThreshold: parseThreshold,
  isValidSettingsKey: isValidSettingsKey,
  filterValidSettings: filterValidSettings
};

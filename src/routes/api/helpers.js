/**
 * API Helpers
 * Shared utilities for all API routes
 */

// Wrap async route handlers to catch errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Standard API response format
const apiResponse = (res, statusCode, data, error = null) => {
  if (error) {
    return res.status(statusCode).json({
      success: false,
      error: typeof error === 'string' ? { code: 'ERROR', message: error } : error,
    });
  }
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

// Validate node input
const validateNodeInput = (data) => {
  const errors = [];

  if (!data.name || !data.name.trim()) {
    errors.push('name ist erforderlich');
  } else if (data.name.length > 255) {
    errors.push('name darf maximal 255 Zeichen lang sein');
  }

  if (!data.host || !data.host.trim()) {
    errors.push('host ist erforderlich');
  } else if (data.host.length > 255) {
    errors.push('host darf maximal 255 Zeichen lang sein');
  }

  if (!data.ssh_user || !data.ssh_user.trim()) {
    errors.push('ssh_user ist erforderlich');
  } else if (data.ssh_user.length > 64) {
    errors.push('ssh_user darf maximal 64 Zeichen lang sein');
  }

  if (data.ssh_port !== undefined) {
    const port = parseInt(data.ssh_port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('ssh_port muss zwischen 1 und 65535 liegen');
    }
  }

  return errors;
};

// Valid settings keys (whitelist)
const VALID_SETTINGS_KEYS = [
  'auto_discovery_enabled',
  'rediscovery_on_connect',
  'monitoring_default_interval',
  'stats_retention_hours',
  'alert_cpu_warning',
  'alert_cpu_critical',
  'alert_ram_warning',
  'alert_ram_critical',
  'alert_disk_warning',
  'alert_disk_critical',
  'alert_temp_warning',
  'alert_temp_critical',
  'dashboard_refresh_interval',
  'chart_default_hours',
  'toast_notifications_enabled',
  'import_inherit_credentials',
];

module.exports = {
  asyncHandler,
  apiResponse,
  validateNodeInput,
  VALID_SETTINGS_KEYS,
};

/**
 * Alert Detection Service
 * Monitors node stats and creates alerts when thresholds are exceeded
 */

const db = require('../db');

/**
 * Check stats against thresholds and create/resolve alerts
 * @param {number} nodeId - Node ID
 * @param {Object} stats - Current stats object
 * @param {Object} thresholds - Threshold configuration
 * @returns {Object} Result with new alerts and resolved alerts
 */
function checkAlerts(nodeId, stats, thresholds) {
  const result = {
    newAlerts: [],
    resolvedAlerts: []
  };

  if (!stats || !thresholds) {
    return result;
  }

  // Check CPU
  if (stats.cpu_percent !== null && stats.cpu_percent !== undefined) {
    const cpuResult = checkMetric(
      nodeId,
      'cpu',
      stats.cpu_percent,
      thresholds.cpu_warning,
      thresholds.cpu_critical
    );
    if (cpuResult.newAlert) result.newAlerts.push(cpuResult.newAlert);
    if (cpuResult.resolvedAlert) result.resolvedAlerts.push(cpuResult.resolvedAlert);
  }

  // Check RAM
  if (stats.ram_percent !== null && stats.ram_percent !== undefined) {
    const ramResult = checkMetric(
      nodeId,
      'ram',
      stats.ram_percent,
      thresholds.ram_warning,
      thresholds.ram_critical
    );
    if (ramResult.newAlert) result.newAlerts.push(ramResult.newAlert);
    if (ramResult.resolvedAlert) result.resolvedAlerts.push(ramResult.resolvedAlert);
  }

  // Check Disk
  if (stats.disk_percent !== null && stats.disk_percent !== undefined) {
    const diskResult = checkMetric(
      nodeId,
      'disk',
      stats.disk_percent,
      thresholds.disk_warning,
      thresholds.disk_critical
    );
    if (diskResult.newAlert) result.newAlerts.push(diskResult.newAlert);
    if (diskResult.resolvedAlert) result.resolvedAlerts.push(diskResult.resolvedAlert);
  }

  // Check Temperature
  if (stats.temp_cpu !== null && stats.temp_cpu !== undefined) {
    const tempResult = checkMetric(
      nodeId,
      'temp',
      stats.temp_cpu,
      thresholds.temp_warning,
      thresholds.temp_critical
    );
    if (tempResult.newAlert) result.newAlerts.push(tempResult.newAlert);
    if (tempResult.resolvedAlert) result.resolvedAlerts.push(tempResult.resolvedAlert);
  }

  return result;
}

/**
 * Check a single metric against thresholds
 * @param {number} nodeId - Node ID
 * @param {string} alertType - Type of alert (cpu, ram, disk, temp)
 * @param {number} value - Current metric value
 * @param {number} warningThreshold - Warning threshold
 * @param {number} criticalThreshold - Critical threshold
 * @returns {Object} Result with newAlert and/or resolvedAlert
 */
function checkMetric(nodeId, alertType, value, warningThreshold, criticalThreshold) {
  const result = {
    newAlert: null,
    resolvedAlert: null
  };

  // Determine alert level based on current value
  let currentLevel = null;
  let threshold = null;

  if (criticalThreshold && value >= criticalThreshold) {
    currentLevel = 'critical';
    threshold = criticalThreshold;
  } else if (warningThreshold && value >= warningThreshold) {
    currentLevel = 'warning';
    threshold = warningThreshold;
  }

  // Check if there's an existing active alert for this metric
  const existingAlert = db.alerts.hasActiveAlert(nodeId, alertType);

  if (currentLevel) {
    // Threshold exceeded - create or update alert
    if (!existingAlert) {
      // Create new alert
      const message = generateAlertMessage(alertType, currentLevel, value, threshold);
      const alertId = db.alerts.create({
        node_id: nodeId,
        alert_type: alertType,
        alert_level: currentLevel,
        value: value,
        threshold: threshold,
        message: message
      });

      result.newAlert = {
        id: alertId,
        node_id: nodeId,
        alert_type: alertType,
        alert_level: currentLevel,
        value: value,
        threshold: threshold,
        message: message
      };
    } else if (existingAlert.alert_level !== currentLevel) {
      // Level changed (e.g., warning -> critical)
      // Resolve old alert and create new one
      db.alerts.resolve(existingAlert.id);
      result.resolvedAlert = existingAlert;

      const message = generateAlertMessage(alertType, currentLevel, value, threshold);
      const alertId = db.alerts.create({
        node_id: nodeId,
        alert_type: alertType,
        alert_level: currentLevel,
        value: value,
        threshold: threshold,
        message: message
      });

      result.newAlert = {
        id: alertId,
        node_id: nodeId,
        alert_type: alertType,
        alert_level: currentLevel,
        value: value,
        threshold: threshold,
        message: message
      };
    }
    // If same level, do nothing (alert already exists)
  } else {
    // Below all thresholds - resolve any existing alert
    if (existingAlert) {
      db.alerts.resolve(existingAlert.id);
      result.resolvedAlert = existingAlert;
    }
  }

  return result;
}

/**
 * Generate human-readable alert message
 */
function generateAlertMessage(alertType, level, value, threshold) {
  const typeNames = {
    cpu: 'CPU-Auslastung',
    ram: 'RAM-Auslastung',
    disk: 'Festplattenbelegung',
    temp: 'CPU-Temperatur'
  };

  const units = {
    cpu: '%',
    ram: '%',
    disk: '%',
    temp: '°C'
  };

  const levelNames = {
    warning: 'Warnung',
    critical: 'Kritisch'
  };

  const typeName = typeNames[alertType] || alertType;
  const unit = units[alertType] || '';
  const levelName = levelNames[level] || level;

  return `${levelName}: ${typeName} bei ${value.toFixed(1)}${unit} (Schwellwert: ${threshold}${unit})`;
}

/**
 * Check if a node is offline and create/resolve offline alert
 * @param {number} nodeId - Node ID
 * @param {boolean} isOnline - Current online status
 */
function checkOfflineAlert(nodeId, isOnline) {
  const existingAlert = db.alerts.hasActiveAlert(nodeId, 'offline');

  if (!isOnline) {
    // Node is offline
    if (!existingAlert) {
      db.alerts.create({
        node_id: nodeId,
        alert_type: 'offline',
        alert_level: 'critical',
        value: null,
        threshold: null,
        message: 'Node ist offline oder nicht erreichbar'
      });
    }
  } else {
    // Node is online - resolve any offline alert
    if (existingAlert) {
      db.alerts.resolve(existingAlert.id);
    }
  }
}

/**
 * Get all active alerts with node names
 * @returns {Array} Array of active alerts with node info
 */
function getActiveAlertsWithNodes() {
  const alerts = db.alerts.getActive();
  return alerts.map(alert => {
    const node = db.nodes.getById(alert.node_id);
    return {
      ...alert,
      node_name: node ? node.name : 'Unbekannt'
    };
  });
}

/**
 * Get active alert counts by level
 * @returns {Object} Counts by level
 */
function getAlertCounts() {
  return {
    warning: db.alerts.getActiveCountByLevel('warning'),
    critical: db.alerts.getActiveCountByLevel('critical'),
    total: db.alerts.getActiveCount()
  };
}

/**
 * Cleanup old alerts based on retention setting
 */
function cleanupOldAlerts() {
  const retentionDays = parseInt(db.settings.get('alert_retention_days') || '90', 10);
  const cutoffTime = Math.floor(Date.now() / 1000) - (retentionDays * 24 * 60 * 60);

  const result = db.alerts.cleanup(cutoffTime);
  return result.changes;
}

module.exports = {
  checkAlerts,
  checkMetric,
  checkOfflineAlert,
  getActiveAlertsWithNodes,
  getAlertCounts,
  cleanupOldAlerts
};

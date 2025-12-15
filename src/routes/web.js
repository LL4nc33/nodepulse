const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper function for byte formatting (used in templates)
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// =====================================================
// Helper: Wrap async route handlers
// =====================================================
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// =====================================================
// Dashboard
// =====================================================

router.get('/', asyncHandler(async (req, res) => {
  const nodes = db.nodes.getAll();
  const nodeTree = db.nodes.getHierarchyTree();
  const tags = db.tags.getAll();
  const onlineCount = nodes.filter(n => n.online).length;

  res.render('index', {
    title: 'Dashboard',
    currentPath: '/',
    nodes,
    nodeTree,
    tags,
    stats: {
      total: nodes.length,
      online: onlineCount,
      offline: nodes.length - onlineCount,
    },
  });
}));

// =====================================================
// Nodes
// =====================================================

// List all nodes
router.get('/nodes', asyncHandler(async (req, res) => {
  const nodes = db.nodes.getAll();
  res.render('nodes/list', {
    title: 'Nodes',
    currentPath: '/nodes',
    nodes,
  });
}));

// Add node form
router.get('/nodes/add', (req, res) => {
  res.render('nodes/add', {
    title: 'Node hinzufügen',
    currentPath: '/nodes',
    error: null,
    node: {},
  });
});

// Create node
router.post('/nodes/add', asyncHandler(async (req, res) => {
  const { name, host, ssh_port, ssh_user, ssh_password, ssh_key_path, notes } = req.body;

  // Validation
  if (!name || !name.trim()) {
    return res.render('nodes/add', {
      title: 'Node hinzufügen',
      currentPath: '/nodes',
      error: 'Name ist erforderlich.',
      node: req.body,
    });
  }

  if (!host || !host.trim()) {
    return res.render('nodes/add', {
      title: 'Node hinzufügen',
      currentPath: '/nodes',
      error: 'Host ist erforderlich.',
      node: req.body,
    });
  }

  if (!ssh_user || !ssh_user.trim()) {
    return res.render('nodes/add', {
      title: 'Node hinzufügen',
      currentPath: '/nodes',
      error: 'SSH User ist erforderlich.',
      node: req.body,
    });
  }

  // Validate port range
  const port = parseInt(ssh_port, 10) || 22;
  if (port < 1 || port > 65535) {
    return res.render('nodes/add', {
      title: 'Node hinzufügen',
      currentPath: '/nodes',
      error: 'SSH Port muss zwischen 1 und 65535 liegen.',
      node: req.body,
    });
  }

  // Check if name already exists
  const existing = db.nodes.getByName(name.trim());
  if (existing) {
    return res.render('nodes/add', {
      title: 'Node hinzufügen',
      currentPath: '/nodes',
      error: 'Ein Node mit diesem Namen existiert bereits.',
      node: req.body,
    });
  }

  try {
    const id = db.nodes.create({
      name: name.trim(),
      host: host.trim(),
      ssh_port: port,
      ssh_user: ssh_user.trim(),
      ssh_password: ssh_password ? ssh_password : null,
      ssh_key_path: ssh_key_path ? ssh_key_path.trim() : null,
      notes: notes ? notes.trim() : null,
    });

    res.redirect(`/nodes/${id}`);
  } catch (err) {
    res.render('nodes/add', {
      title: 'Node hinzufügen',
      currentPath: '/nodes',
      error: `Fehler beim Erstellen: ${err.message}`,
      node: req.body,
    });
  }
}));

// Node detail
router.get('/nodes/:id', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return res.status(404).render('error', {
      title: 'Node nicht gefunden',
      message: 'Der angeforderte Node existiert nicht.',
    });
  }

  const tags = db.tags.getForNode(node.id);
  const discovery = db.discovery.getForNode(node.id);
  const hardware = db.hardware.getForNode(node.id);
  const docker = discovery && discovery.has_docker ? db.docker.getAllForNode(node.id) : null;
  const proxmox = discovery && discovery.is_proxmox_host ? db.proxmox.getAllForNode(node.id) : null;

  res.render('nodes/detail', {
    title: node.name,
    currentPath: '/nodes',
    node,
    tags,
    discovery,
    hardware,
    docker,
    proxmox,
    formatBytes,
  });
}));

// Edit node form
router.get('/nodes/:id/edit', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return res.status(404).render('error', {
      title: 'Node nicht gefunden',
      message: 'Der angeforderte Node existiert nicht.',
    });
  }

  res.render('nodes/edit', {
    title: `${node.name} bearbeiten`,
    currentPath: '/nodes',
    node,
    error: null,
  });
}));

// Update node
router.post('/nodes/:id/edit', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return res.status(404).render('error', {
      title: 'Node nicht gefunden',
      message: 'Der angeforderte Node existiert nicht.',
    });
  }

  const { name, host, ssh_port, ssh_user, ssh_password, ssh_key_path, notes, monitoring_enabled, monitoring_interval } = req.body;

  // Validation
  if (!name || !name.trim()) {
    return res.render('nodes/edit', {
      title: `${node.name} bearbeiten`,
      currentPath: '/nodes',
      error: 'Name ist erforderlich.',
      node: { ...node, ...req.body },
    });
  }

  if (!host || !host.trim()) {
    return res.render('nodes/edit', {
      title: `${node.name} bearbeiten`,
      currentPath: '/nodes',
      error: 'Host ist erforderlich.',
      node: { ...node, ...req.body },
    });
  }

  if (!ssh_user || !ssh_user.trim()) {
    return res.render('nodes/edit', {
      title: `${node.name} bearbeiten`,
      currentPath: '/nodes',
      error: 'SSH User ist erforderlich.',
      node: { ...node, ...req.body },
    });
  }

  // Validate port range
  const port = parseInt(ssh_port, 10) || 22;
  if (port < 1 || port > 65535) {
    return res.render('nodes/edit', {
      title: `${node.name} bearbeiten`,
      currentPath: '/nodes',
      error: 'SSH Port muss zwischen 1 und 65535 liegen.',
      node: { ...node, ...req.body },
    });
  }

  // Validate monitoring interval
  const interval = parseInt(monitoring_interval, 10) || 30;
  if (interval < 5 || interval > 3600) {
    return res.render('nodes/edit', {
      title: `${node.name} bearbeiten`,
      currentPath: '/nodes',
      error: 'Monitoring Interval muss zwischen 5 und 3600 Sekunden liegen.',
      node: { ...node, ...req.body },
    });
  }

  // Check if name already exists (except current node)
  const existing = db.nodes.getByName(name.trim());
  if (existing && existing.id !== node.id) {
    return res.render('nodes/edit', {
      title: `${node.name} bearbeiten`,
      currentPath: '/nodes',
      error: 'Ein Node mit diesem Namen existiert bereits.',
      node: { ...node, ...req.body },
    });
  }

  try {
    const updateData = {
      name: name.trim(),
      host: host.trim(),
      ssh_port: port,
      ssh_user: ssh_user.trim(),
      ssh_key_path: ssh_key_path ? ssh_key_path.trim() : null,
      notes: notes ? notes.trim() : null,
      monitoring_enabled: monitoring_enabled === 'on' ? 1 : 0,
      monitoring_interval: interval,
    };

    // Only update password if a new one is provided
    if (ssh_password && ssh_password.trim()) {
      updateData.ssh_password = ssh_password;
    }

    db.nodes.update(node.id, updateData);

    res.redirect(`/nodes/${node.id}`);
  } catch (err) {
    res.render('nodes/edit', {
      title: `${node.name} bearbeiten`,
      currentPath: '/nodes',
      error: `Fehler beim Speichern: ${err.message}`,
      node: { ...node, ...req.body },
    });
  }
}));

// Delete node
router.post('/nodes/:id/delete', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return res.status(404).render('error', {
      title: 'Node nicht gefunden',
      message: 'Der angeforderte Node existiert nicht.',
    });
  }

  db.nodes.delete(node.id);
  res.redirect('/nodes');
}));

// =====================================================
// Monitoring
// =====================================================

// Monitoring overview (all nodes)
router.get('/monitoring', asyncHandler(async (req, res) => {
  const nodesWithStats = db.stats.getAllNodesWithStats();
  const settings = db.settings.getAll();

  // Get alert thresholds
  const thresholds = {
    cpu_warning: parseInt(settings.alert_cpu_warning, 10) || 80,
    cpu_critical: parseInt(settings.alert_cpu_critical, 10) || 95,
    ram_warning: parseInt(settings.alert_ram_warning, 10) || 85,
    ram_critical: parseInt(settings.alert_ram_critical, 10) || 95,
    disk_warning: parseInt(settings.alert_disk_warning, 10) || 80,
    disk_critical: parseInt(settings.alert_disk_critical, 10) || 95,
    temp_warning: parseInt(settings.alert_temp_warning, 10) || 70,
    temp_critical: parseInt(settings.alert_temp_critical, 10) || 85,
  };

  res.render('monitoring/overview', {
    title: 'Monitoring',
    currentPath: '/monitoring',
    nodes: nodesWithStats,
    thresholds,
    formatBytes,
  });
}));

// Monitoring detail for single node
router.get('/monitoring/:id', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  const node = db.nodes.getById(nodeId);
  if (!node) {
    return res.status(404).render('error', {
      title: 'Node nicht gefunden',
      message: 'Der angeforderte Node existiert nicht.',
    });
  }

  const currentStats = db.stats.getCurrent(nodeId);
  const history = db.stats.getHistory(nodeId, 24);
  const settings = db.settings.getAll();

  // Get alert thresholds
  const thresholds = {
    cpu_warning: parseInt(settings.alert_cpu_warning, 10) || 80,
    cpu_critical: parseInt(settings.alert_cpu_critical, 10) || 95,
    ram_warning: parseInt(settings.alert_ram_warning, 10) || 85,
    ram_critical: parseInt(settings.alert_ram_critical, 10) || 95,
    disk_warning: parseInt(settings.alert_disk_warning, 10) || 80,
    disk_critical: parseInt(settings.alert_disk_critical, 10) || 95,
    temp_warning: parseInt(settings.alert_temp_warning, 10) || 70,
    temp_critical: parseInt(settings.alert_temp_critical, 10) || 85,
  };

  res.render('monitoring/node', {
    title: `Monitoring - ${node.name}`,
    currentPath: '/monitoring',
    node,
    stats: currentStats,
    history,
    thresholds,
    formatBytes,
  });
}));

// =====================================================
// Settings
// =====================================================

router.get('/settings', asyncHandler(async (req, res) => {
  const settings = db.settings.getAll();
  res.render('settings/index', {
    title: 'Einstellungen',
    currentPath: '/settings',
    settings,
  });
}));

// Save settings
router.post('/settings', asyncHandler(async (req, res) => {
  const settingsToSave = [
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
  ];

  try {
    settingsToSave.forEach(function(key) {
      var value = req.body[key];
      // Checkboxes: convert to 'true'/'false'
      if (key === 'auto_discovery_enabled' || key === 'rediscovery_on_connect') {
        value = value === 'on' ? 'true' : 'false';
      }
      if (value !== undefined) {
        db.settings.set(key, String(value));
      }
    });

    const settings = db.settings.getAll();
    res.render('settings/index', {
      title: 'Einstellungen',
      currentPath: '/settings',
      settings,
      success: true,
    });
  } catch (err) {
    const settings = db.settings.getAll();
    res.render('settings/index', {
      title: 'Einstellungen',
      currentPath: '/settings',
      settings,
      error: 'Fehler beim Speichern: ' + err.message,
    });
  }
}));

// =====================================================
// About
// =====================================================

router.get('/about', asyncHandler(async (req, res) => {
  var pkg = require('../../package.json');
  var os = require('os');

  // Calculate uptime
  var uptimeSeconds = process.uptime();
  var days = Math.floor(uptimeSeconds / 86400);
  var hours = Math.floor((uptimeSeconds % 86400) / 3600);
  var minutes = Math.floor((uptimeSeconds % 3600) / 60);
  var uptime = '';
  if (days > 0) uptime += days + 'd ';
  if (hours > 0 || days > 0) uptime += hours + 'h ';
  uptime += minutes + 'm';

  // Memory usage
  var memUsed = process.memoryUsage();
  var memoryUsage = formatBytes(memUsed.heapUsed) + ' / ' + formatBytes(memUsed.heapTotal);

  // Database stats
  var dbStats = {
    nodes: db.nodes.getAll().length,
    tags: 0,
    statsHistory: 0,
    commandHistory: 0,
  };

  try {
    var allNodes = db.nodes.getAll();
    var tagCount = 0;
    allNodes.forEach(function(node) {
      tagCount += db.tags.getForNode(node.id).length;
    });
    dbStats.tags = tagCount;
  } catch (e) {
    // Ignore errors
  }

  try {
    var statsCount = db.getDb().prepare('SELECT COUNT(*) as count FROM node_stats_history').get();
    dbStats.statsHistory = statsCount ? statsCount.count : 0;
  } catch (e) {
    // Ignore errors
  }

  try {
    var cmdCount = db.getDb().prepare('SELECT COUNT(*) as count FROM command_history').get();
    dbStats.commandHistory = cmdCount ? cmdCount.count : 0;
  } catch (e) {
    // Ignore errors
  }

  res.render('about', {
    title: 'Über nodepulse',
    currentPath: '/about',
    version: pkg.version,
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    uptime: uptime,
    memoryUsage: memoryUsage,
    dbStats: dbStats,
  });
}));

module.exports = router;

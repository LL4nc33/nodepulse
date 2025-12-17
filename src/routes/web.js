const express = require('express');
const router = express.Router();
const db = require('../db');
const collector = require('../collector');
const { formatBytes } = require('../lib/utils');
const { validateRequired, validatePort } = require('../lib/validators');
const { getThresholds, VALID_SETTINGS_KEYS } = require('../lib/thresholds');
const { parseIntParam, parseMonitoringInterval } = require('../lib/params');
const sidebarMiddleware = require('../middleware/sidebar');

// =====================================================
// Helper: Wrap async route handlers
// =====================================================
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// =====================================================
// Middleware: Global Settings für alle Views
// =====================================================
router.use((req, res, next) => {
  const settings = db.settings.getAll();
  res.locals.toastNotificationsEnabled = settings.toast_notifications_enabled === 'true';
  next();
});

// =====================================================
// Middleware: Sidebar Data für alle Views
// =====================================================
router.use(sidebarMiddleware(db));

// =====================================================
// Dashboard
// =====================================================

router.get('/', asyncHandler(async (req, res) => {
  let nodes = db.nodes.getAll();
  let nodeTree = db.nodes.getHierarchyTree();
  const tags = db.tags.getAll();
  const settings = db.settings.getAll();

  // Tag filter from query
  const tagFilter = req.query.tag || null;

  // Filter nodes by tag if specified
  if (tagFilter) {
    nodes = nodes.filter(n => {
      if (!n.tags) return false;
      const nodeTags = n.tags.split(',').map(t => t.trim());
      return nodeTags.includes(tagFilter);
    });
    // For filtered view, show flat list instead of tree
    nodeTree = [];
  }

  const onlineCount = nodes.filter(n => n.online).length;

  // Load stats for each node (for monitoring cards view)
  let nodesWithStats = db.stats.getAllNodesWithStats();

  // Also filter stats by tag
  if (tagFilter) {
    const filteredNodeIds = nodes.map(n => n.id);
    nodesWithStats = nodesWithStats.filter(n => filteredNodeIds.includes(n.id));
  }

  // Alert thresholds (aus zentralem Modul)
  const thresholds = getThresholds(settings);

  res.render('index', {
    title: tagFilter ? `Dashboard - ${tagFilter}` : 'Dashboard',
    currentPath: '/',
    nodes,
    nodeTree,
    nodesWithStats,
    tags,
    tagFilter,
    thresholds,
    dashboardRefreshInterval: parseIntParam(settings.dashboard_refresh_interval, 5),
    stats: {
      total: nodes.length,
      online: onlineCount,
      offline: nodes.length - onlineCount,
    },
    formatBytes,
  });
}));

// =====================================================
// Nodes
// =====================================================

// Redirect /nodes to Dashboard (Node list is now integrated)
router.get('/nodes', (req, res) => {
  res.redirect('/');
});

// Add node form
router.get('/nodes/add', asyncHandler(async (req, res) => {
  // Sidebar data comes from middleware (res.locals)
  res.render('nodes/add', {
    title: 'Node hinzufügen',
    currentPath: '/nodes',
    error: null,
    node: {}
  });
}));

// Create node
router.post('/nodes/add', asyncHandler(async (req, res) => {
  const { name, host, ssh_port, ssh_user, ssh_password, ssh_key_path, notes } = req.body;

  // Helper to render with error (sidebar data from middleware)
  const renderWithError = (error) => {
    return res.render('nodes/add', {
      title: 'Node hinzufügen',
      currentPath: '/nodes',
      error,
      node: req.body
    });
  };

  // Validation (zentrale Validators)
  const nameCheck = validateRequired(name, 'Name');
  if (!nameCheck.valid) return renderWithError(nameCheck.error + '.');

  const hostCheck = validateRequired(host, 'Host');
  if (!hostCheck.valid) return renderWithError(hostCheck.error + '.');

  const userCheck = validateRequired(ssh_user, 'SSH User');
  if (!userCheck.valid) return renderWithError(userCheck.error + '.');

  const portCheck = validatePort(ssh_port, 22);
  if (!portCheck.valid) return renderWithError('SSH ' + portCheck.error + '.');
  const port = portCheck.value;

  // Check if name already exists
  const existing = db.nodes.getByName(name.trim());
  if (existing) {
    return renderWithError('Ein Node mit diesem Namen existiert bereits.');
  }

  try {
    // Settings für Defaults laden (gecacht, effizient)
    const settings = db.settings.getAll();
    const defaultMonitoringInterval = parseMonitoringInterval(settings.monitoring_default_interval, 30);

    const id = db.nodes.create({
      name: name.trim(),
      host: host.trim(),
      ssh_port: port,
      ssh_user: ssh_user.trim(),
      ssh_password: ssh_password ? ssh_password : null,
      ssh_key_path: ssh_key_path ? ssh_key_path.trim() : null,
      notes: notes ? notes.trim() : null,
      monitoring_interval: defaultMonitoringInterval,
    });

    // Auto-Discovery wenn aktiviert (non-blocking)
    if (settings.auto_discovery_enabled === 'true') {
      const node = db.nodes.getByIdWithCredentials(id);
      collector.runFullDiscovery(node).catch(err => {
        console.error(`Auto-Discovery für Node ${id} fehlgeschlagen:`, err.message);
        db.nodes.setOnline(id, false, err.message);
      });
    }

    res.redirect(`/nodes/${id}`);
  } catch (err) {
    return renderWithError(`Fehler beim Erstellen: ${err.message}`);
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

  const nodeTags = db.tags.getForNode(node.id);
  const discovery = db.discovery.getForNode(node.id);
  const hardware = db.hardware.getForNode(node.id);
  const docker = discovery && discovery.has_docker ? db.docker.getAllForNode(node.id) : null;
  const proxmox = discovery && discovery.is_proxmox_host ? db.proxmox.getAllForNode(node.id) : null;
  const currentStats = db.stats.getCurrent(node.id);
  const health = db.health.get(node.id);

  // Sidebar data comes from middleware
  res.render('nodes/detail', {
    title: node.name,
    currentPath: '/nodes',
    node,
    tags: nodeTags,
    discovery,
    hardware,
    docker,
    proxmox,
    currentStats,
    health,
    formatBytes
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

  // Sidebar data comes from middleware
  res.render('nodes/edit', {
    title: `${node.name} bearbeiten`,
    currentPath: '/nodes',
    node,
    error: null
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

  // Helper to render with error (sidebar data from middleware)
  const renderWithError = (error) => {
    return res.render('nodes/edit', {
      title: `${node.name} bearbeiten`,
      currentPath: '/nodes',
      error,
      node: { ...node, ...req.body }
    });
  };

  // Validation (zentrale Validators)
  const nameCheck = validateRequired(name, 'Name');
  if (!nameCheck.valid) return renderWithError(nameCheck.error + '.');

  const hostCheck = validateRequired(host, 'Host');
  if (!hostCheck.valid) return renderWithError(hostCheck.error + '.');

  const userCheck = validateRequired(ssh_user, 'SSH User');
  if (!userCheck.valid) return renderWithError(userCheck.error + '.');

  const portCheck = validatePort(ssh_port, 22);
  if (!portCheck.valid) return renderWithError('SSH ' + portCheck.error + '.');
  const port = portCheck.value;

  // Validate monitoring interval
  const interval = parseMonitoringInterval(monitoring_interval, 30);
  if (interval < 5 || interval > 3600) {
    return renderWithError('Monitoring Interval muss zwischen 5 und 3600 Sekunden liegen.');
  }

  // Check if name already exists (except current node)
  const existing = db.nodes.getByName(name.trim());
  if (existing && existing.id !== node.id) {
    return renderWithError('Ein Node mit diesem Namen existiert bereits.');
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
    return renderWithError(`Fehler beim Speichern: ${err.message}`);
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

// Redirect /monitoring to Dashboard with cards view hint
router.get('/monitoring', (req, res) => {
  res.redirect('/?view=cards');
});

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

  // Get alert thresholds (aus zentralem Modul)
  const thresholds = getThresholds(settings);

  res.render('monitoring/node', {
    title: `Monitoring - ${node.name}`,
    currentPath: '/monitoring',
    node,
    stats: currentStats,
    history,
    thresholds,
    chartDefaultHours: parseIntParam(settings.chart_default_hours, 24),
    formatBytes,
  });
}));

// =====================================================
// Settings
// =====================================================

router.get('/settings', asyncHandler(async (req, res) => {
  const settings = db.settings.getAll();

  // Sidebar data comes from middleware
  res.render('settings/index', {
    title: 'Einstellungen',
    currentPath: '/settings',
    settings
  });
}));

// Save settings
router.post('/settings', asyncHandler(async (req, res) => {
  const settingsToSave = [
    'auto_discovery_enabled',
    'rediscovery_on_connect',
    'monitoring_default_interval',
    'dashboard_refresh_interval',
    'stats_retention_hours',
    'alert_cpu_warning',
    'alert_cpu_critical',
    'alert_ram_warning',
    'alert_ram_critical',
    'alert_disk_warning',
    'alert_disk_critical',
    'alert_temp_warning',
    'alert_temp_critical',
    // Phase 3 Settings
    'chart_default_hours',
    'alert_retention_days',
    'toast_notifications_enabled',
    'import_inherit_credentials',
  ];

  const checkboxSettings = [
    'auto_discovery_enabled',
    'rediscovery_on_connect',
    'toast_notifications_enabled',
    'import_inherit_credentials',
  ];

  // Sidebar data comes from middleware
  try {
    settingsToSave.forEach(function(key) {
      var value = req.body[key];
      // Checkboxes: convert to 'true'/'false'
      if (checkboxSettings.indexOf(key) !== -1) {
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
      success: true
    });
  } catch (err) {
    const settings = db.settings.getAll();
    res.render('settings/index', {
      title: 'Einstellungen',
      currentPath: '/settings',
      settings,
      error: 'Fehler beim Speichern: ' + err.message
    });
  }
}));

// =====================================================
// Alerts
// =====================================================

router.get('/alerts', asyncHandler(async (req, res) => {
  const filter = req.query.filter || 'active'; // active, all, archived

  // Sidebar data comes from middleware

  // Get alerts (node_name already included via LEFT JOIN in db.alerts.getAll())
  let alerts = [];
  if (filter === 'active') {
    alerts = db.alerts.getActive();
  } else if (filter === 'archived') {
    alerts = db.alerts.getAll().filter(a => a.resolved_at !== null);
  } else {
    alerts = db.alerts.getAll();
  }

  // Get alert counts
  const alertCounts = {
    active: db.alerts.getActiveCount(),
    warning: db.alerts.getActiveCountByLevel('warning'),
    critical: db.alerts.getActiveCountByLevel('critical')
  };

  res.render('alerts/index', {
    title: 'Alerts',
    currentPath: '/alerts',
    alerts,
    alertCounts,
    filter
  });
}));

// Acknowledge an alert
router.post('/alerts/:id/acknowledge', asyncHandler(async (req, res) => {
  const alertId = parseInt(req.params.id, 10);
  if (isNaN(alertId)) {
    return res.redirect('/alerts');
  }

  db.alerts.acknowledge(alertId);
  res.redirect('/alerts?acknowledged=1');
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

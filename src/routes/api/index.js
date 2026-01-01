/**
 * API Routes - Main Router
 *
 * This file combines all API sub-routers into a single modular API.
 *
 * Route Structure:
 * - /api/metrics                    - System metrics
 * - /api/nodes                      - Node CRUD, hierarchy, discovery, network
 * - /api/nodes/:nodeId/docker       - Docker management (per node)
 * - /api/nodes/:nodeId/proxmox      - Proxmox VMs/CTs (per node)
 * - /api/nodes/:nodeId/services     - Systemd services (per node)
 * - /api/nodes/:nodeId/health       - Health checks, updates, repo management
 * - /api/nodes/:nodeId/storage      - LVM storage management (per node)
 * - /api/nodes/:nodeId/backup       - Backup management (per node)
 * - /api/nodes/:nodeId/tasks        - Task history & logs (per node)
 * - /api/nodes/:nodeId/agent        - Agent management (per node)
 * - /api/tags                       - Tag management
 * - /api/stats                      - Statistics collection
 * - /api/alerts                     - Alert management
 * - /api/commands                   - Command execution
 * - /api/settings                   - Application settings
 * - /api/agents                     - Agent overview (all nodes)
 */

const express = require('express');
const router = express.Router();
const db = require('../../db');
const apiAuthMiddleware = require('../../middleware/api-auth');

// Apply API authentication middleware to all API routes
// This validates X-API-Key header when api_auth_enabled is true in settings
// Localhost requests are whitelisted by default (configurable)
router.use(apiAuthMiddleware(db));

// Import sub-routers
const metricsRouter = require('./metrics');
const nodesRouter = require('./nodes');
const tagsRouter = require('./tags');
const statsRouter = require('./stats');
const dockerRouter = require('./docker');
const proxmoxRouter = require('./proxmox');
const alertsRouter = require('./alerts');
const commandsRouter = require('./commands');
const servicesRouter = require('./services');
const settingsRouter = require('./settings');
const healthRouter = require('./health');
const storageRouter = require('./storage');
const backupRouter = require('./backup');
const tasksRouter = require('./tasks');
const agentRouter = require('./agent');
const agentsRouter = require('./agents');

// Mount sub-routers
router.use('/metrics', metricsRouter);
router.use('/nodes', nodesRouter);
router.use('/tags', tagsRouter);
router.use('/stats', statsRouter);
router.use('/alerts', alertsRouter);
router.use('/commands', commandsRouter);
router.use('/settings', settingsRouter);
router.use('/agents', agentsRouter);

// Mount node-specific sub-routers (nested under /nodes/:nodeId)
// These use mergeParams: true to access :nodeId from parent route
router.use('/nodes/:nodeId/docker', dockerRouter);
router.use('/nodes/:nodeId/proxmox', proxmoxRouter);
router.use('/nodes/:nodeId/services', servicesRouter);
router.use('/nodes/:nodeId/health', healthRouter);
router.use('/nodes/:nodeId/storage', storageRouter);
router.use('/nodes/:nodeId/backup', backupRouter);
router.use('/nodes/:nodeId/tasks', tasksRouter);
router.use('/nodes/:nodeId/agent', agentRouter);

module.exports = router;

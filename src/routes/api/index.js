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
 * - /api/tags                       - Tag management
 * - /api/stats                      - Statistics collection
 * - /api/alerts                     - Alert management
 * - /api/commands                   - Command execution
 * - /api/settings                   - Application settings
 */

const express = require('express');
const router = express.Router();

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

// Mount sub-routers
router.use('/metrics', metricsRouter);
router.use('/nodes', nodesRouter);
router.use('/tags', tagsRouter);
router.use('/stats', statsRouter);
router.use('/alerts', alertsRouter);
router.use('/commands', commandsRouter);
router.use('/settings', settingsRouter);

// Mount node-specific sub-routers (nested under /nodes/:nodeId)
// These use mergeParams: true to access :nodeId from parent route
router.use('/nodes/:nodeId/docker', dockerRouter);
router.use('/nodes/:nodeId/proxmox', proxmoxRouter);
router.use('/nodes/:nodeId/services', servicesRouter);

module.exports = router;

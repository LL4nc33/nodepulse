const SqlJsWrapper = require('./sqljs-wrapper');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Import entity modules
const nodesModule = require('./entities/nodes');
const tagsModule = require('./entities/tags');
const settingsModule = require('./entities/settings');
const discoveryModule = require('./entities/discovery');
const hardwareModule = require('./entities/hardware');
const statsModule = require('./entities/stats');
const alertsModule = require('./entities/alerts');
const dockerModule = require('./entities/docker');
const proxmoxModule = require('./entities/proxmox');
const commandsModule = require('./entities/commands');
const healthModule = require('./entities/health');
const capabilitiesModule = require('./entities/capabilities');
const lvmModule = require('./entities/lvm');
const backupsModule = require('./entities/backups');
const tasksModule = require('./entities/tasks');

let db = null;
let initPromise = null;

/**
 * Initialize the database connection and create tables if needed
 * @returns {Promise<SqlJsWrapper>}
 */
async function init() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Create wrapper and initialize
    const wrapper = new SqlJsWrapper();
    db = await wrapper.init(config.dbPath);

    // Enable foreign keys (WAL mode ignored by wrapper - not needed for in-memory)
    db.pragma('foreign_keys = ON');

    // Run schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    // Migration: Add ssh_password column if it doesn't exist
    try {
      const columns = db.prepare("PRAGMA table_info(nodes)").all();
      const hasPassword = columns.some(col => col.name === 'ssh_password');
      if (!hasPassword) {
        db.exec('ALTER TABLE nodes ADD COLUMN ssh_password TEXT');
        console.log('[DB] Migration: Added ssh_password column');
      }
    } catch (err) {
      console.error('[DB] Migration error:', err.message);
      throw err;  // Re-throw to prevent app start with incomplete schema
    }

    // Migration: Add parent_id and auto_discovered_from columns for Node Hierarchy
    try {
      const columns = db.prepare("PRAGMA table_info(nodes)").all();
      const hasParentId = columns.some(col => col.name === 'parent_id');
      const hasAutoDiscovered = columns.some(col => col.name === 'auto_discovered_from');

      if (!hasParentId) {
        db.exec('ALTER TABLE nodes ADD COLUMN parent_id INTEGER REFERENCES nodes(id)');
        console.log('[DB] Migration: Added parent_id column');
      }
      if (!hasAutoDiscovered) {
        db.exec('ALTER TABLE nodes ADD COLUMN auto_discovered_from INTEGER REFERENCES nodes(id)');
        console.log('[DB] Migration: Added auto_discovered_from column');
      }
    } catch (err) {
      console.error('[DB] Migration error (hierarchy):', err.message);
      throw err;  // Re-throw to prevent app start with incomplete schema
    }

    // Migration: Add thermal_json column to node_hardware
    try {
      const columns = db.prepare("PRAGMA table_info(node_hardware)").all();
      const hasThermal = columns.some(col => col.name === 'thermal_json');
      if (!hasThermal) {
        db.exec('ALTER TABLE node_hardware ADD COLUMN thermal_json TEXT');
        console.log('[DB] Migration: Added thermal_json column');
      }
    } catch (err) {
      console.error('[DB] Migration error (thermal):', err.message);
      throw err;
    }

    // Migration: Add power_json column to node_hardware
    try {
      const columns = db.prepare("PRAGMA table_info(node_hardware)").all();
      const hasPower = columns.some(col => col.name === 'power_json');
      if (!hasPower) {
        db.exec('ALTER TABLE node_hardware ADD COLUMN power_json TEXT');
        console.log('[DB] Migration: Added power_json column');
      }
    } catch (err) {
      console.error('[DB] Migration error (power):', err.message);
      throw err;
    }

    // Migration: Create node_health table if not exists
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS node_health (
          node_id INTEGER PRIMARY KEY,
          kernel_version TEXT,
          last_boot TEXT,
          uptime_seconds INTEGER,
          reboot_required INTEGER DEFAULT 0,
          apt_updates INTEGER DEFAULT 0,
          apt_security INTEGER DEFAULT 0,
          apt_packages_json TEXT,
          pve_version TEXT,
          pve_repo TEXT,
          docker_images INTEGER DEFAULT 0,
          npm_outdated INTEGER DEFAULT 0,
          apt_cache_free_mb INTEGER DEFAULT 0,
          checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
      `);
    } catch (err) {
      console.error('[DB] Migration error (health):', err.message);
      throw err;
    }

    // Migration: Extended health metrics columns
    try {
      var healthCols = db.prepare("PRAGMA table_info(node_health)").all();
      var hasHealthScore = healthCols.some(function(col) { return col.name === 'health_score'; });
      if (!hasHealthScore) {
        console.log('[DB] Adding extended health columns...');
        db.exec(`
          ALTER TABLE node_health ADD COLUMN cpu_temp INTEGER DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN cpu_temp_status TEXT DEFAULT 'unknown';
          ALTER TABLE node_health ADD COLUMN load_1 REAL DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN load_5 REAL DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN load_15 REAL DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN load_status TEXT DEFAULT 'ok';
          ALTER TABLE node_health ADD COLUMN mem_percent INTEGER DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN mem_status TEXT DEFAULT 'ok';
          ALTER TABLE node_health ADD COLUMN swap_percent INTEGER DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN swap_status TEXT DEFAULT 'ok';
          ALTER TABLE node_health ADD COLUMN disk_percent INTEGER DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN disk_status TEXT DEFAULT 'ok';
          ALTER TABLE node_health ADD COLUMN failed_services INTEGER DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN failed_services_list TEXT;
          ALTER TABLE node_health ADD COLUMN services_status TEXT DEFAULT 'ok';
          ALTER TABLE node_health ADD COLUMN zombie_processes INTEGER DEFAULT 0;
          ALTER TABLE node_health ADD COLUMN zombie_status TEXT DEFAULT 'ok';
          ALTER TABLE node_health ADD COLUMN time_sync TEXT;
          ALTER TABLE node_health ADD COLUMN time_status TEXT DEFAULT 'unknown';
          ALTER TABLE node_health ADD COLUMN net_gateway TEXT;
          ALTER TABLE node_health ADD COLUMN net_status TEXT DEFAULT 'unknown';
          ALTER TABLE node_health ADD COLUMN health_score INTEGER DEFAULT 100;
          ALTER TABLE node_health ADD COLUMN health_status TEXT DEFAULT 'healthy';
          ALTER TABLE node_health ADD COLUMN health_issues TEXT;
          ALTER TABLE node_health ADD COLUMN apt_status TEXT DEFAULT 'ok';
        `);
        console.log('[DB] Extended health columns added');
      }
    } catch (err) {
      console.error('[DB] Migration error (extended health):', err.message);
    }

    // Migration 7: Tiered Polling Timestamps + Capabilities
    try {
      const statsCols = db.prepare("PRAGMA table_info(node_stats_current)").all();
      const hasTier1 = statsCols.some(col => col.name === 'tier1_last_update');
      const hasTier2 = statsCols.some(col => col.name === 'tier2_last_update');

      if (!hasTier1) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN tier1_last_update INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added tier1_last_update column to node_stats_current');
      }
      if (!hasTier2) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN tier2_last_update INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added tier2_last_update column to node_stats_current');
      }

      const hardwareCols = db.prepare("PRAGMA table_info(node_hardware)").all();
      const hasTier3 = hardwareCols.some(col => col.name === 'tier3_last_update');
      if (!hasTier3) {
        db.exec('ALTER TABLE node_hardware ADD COLUMN tier3_last_update INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added tier3_last_update column to node_hardware');
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS node_capabilities (
          node_id INTEGER PRIMARY KEY,
          capabilities_json TEXT NOT NULL,
          last_detected_at INTEGER NOT NULL,
          FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
      `);
      console.log('[DB] Migration: Created node_capabilities table');
    } catch (err) {
      console.error('[DB] Migration error (tiered timestamps):', err.message);
      throw err;
    }

    // Migration 8: VMs/Container Counts for TOON Format
    // Store counts in node_stats_current instead of SubQuery (30-50% performance gain)
    try {
      const statsCols = db.prepare("PRAGMA table_info(node_stats_current)").all();
      const hasVMs = statsCols.some(col => col.name === 'vms_running');
      const hasCTs = statsCols.some(col => col.name === 'cts_running');
      const hasContainers = statsCols.some(col => col.name === 'containers_running');

      if (!hasVMs) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN vms_running INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added vms_running column to node_stats_current');
      }
      if (!hasCTs) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN cts_running INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added cts_running column to node_stats_current');
      }
      if (!hasContainers) {
        db.exec('ALTER TABLE node_stats_current ADD COLUMN containers_running INTEGER DEFAULT 0');
        console.log('[DB] Migration: Added containers_running column to node_stats_current');
      }

      // Backfill NULL → 0 for consistency
      if (!hasVMs || !hasCTs || !hasContainers) {
        db.exec(`
          UPDATE node_stats_current
          SET vms_running = COALESCE(vms_running, 0),
              cts_running = COALESCE(cts_running, 0),
              containers_running = COALESCE(containers_running, 0)
          WHERE vms_running IS NULL OR cts_running IS NULL OR containers_running IS NULL
        `);
        console.log('[DB] Migration: Backfilled NULL → 0 for VM/Container counts');
      }
    } catch (err) {
      console.error('[DB] Migration error (vm/container counts):', err.message);
      throw err;
    }

    // Migration 9: Extended Hardware Details (CPU, RAM Slots, PCI Devices)
    try {
      const hwCols = db.prepare("PRAGMA table_info(node_hardware)").all();

      // CPU extended fields
      const hasCpuStepping = hwCols.some(col => col.name === 'cpu_stepping');
      if (!hasCpuStepping) {
        console.log('[DB] Migration: Adding extended hardware columns...');
        db.exec(`
          ALTER TABLE node_hardware ADD COLUMN cpu_stepping TEXT;
          ALTER TABLE node_hardware ADD COLUMN cpu_microcode TEXT;
          ALTER TABLE node_hardware ADD COLUMN cpu_min_mhz REAL;
          ALTER TABLE node_hardware ADD COLUMN cpu_cur_mhz REAL;
          ALTER TABLE node_hardware ADD COLUMN cpu_flags TEXT;
          ALTER TABLE node_hardware ADD COLUMN cpu_bugs TEXT;
        `);
        console.log('[DB] Migration: Added CPU extended columns');
      }

      // VM detection
      const hasIsVirtual = hwCols.some(col => col.name === 'is_virtual');
      if (!hasIsVirtual) {
        db.exec(`
          ALTER TABLE node_hardware ADD COLUMN is_virtual INTEGER DEFAULT 0;
          ALTER TABLE node_hardware ADD COLUMN virt_type TEXT;
        `);
        console.log('[DB] Migration: Added virtualization detection columns');
      }

      // RAM slots (JSON array with detailed slot info)
      const hasMemorySlots = hwCols.some(col => col.name === 'memory_slots_json');
      if (!hasMemorySlots) {
        db.exec('ALTER TABLE node_hardware ADD COLUMN memory_slots_json TEXT');
        console.log('[DB] Migration: Added memory_slots_json column');
      }

      // PCI devices (JSON array)
      const hasPciDevices = hwCols.some(col => col.name === 'pci_devices_json');
      if (!hasPciDevices) {
        db.exec('ALTER TABLE node_hardware ADD COLUMN pci_devices_json TEXT');
        console.log('[DB] Migration: Added pci_devices_json column');
      }
    } catch (err) {
      console.error('[DB] Migration error (extended hardware):', err.message);
      // Don't throw - allow app to continue with reduced functionality
    }

    // Run seed data
    const seedPath = path.join(__dirname, 'seed.sql');
    const seed = fs.readFileSync(seedPath, 'utf8');
    db.exec(seed);

    // Initialize all entity modules with getDb function
    nodesModule.init(getDb);
    tagsModule.init(getDb);
    settingsModule.init(getDb);
    discoveryModule.init(getDb);
    hardwareModule.init(getDb);
    statsModule.init(getDb);
    alertsModule.init(getDb);
    dockerModule.init(getDb);
    proxmoxModule.init(getDb);
    commandsModule.init(getDb);
    healthModule.init(getDb);
    capabilitiesModule.init(getDb);
    lvmModule.init(getDb);
    backupsModule.init(getDb);
    tasksModule.init(getDb);

    console.log('[DB] Database initialized at', config.dbPath);

    return db;
  })();

  return initPromise;
}

/**
 * Get the database instance (sync after init)
 * @returns {SqlJsWrapper}
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call await init() first.');
  }
  return db;
}

/**
 * Close the database connection (async)
 */
async function close() {
  if (db) {
    await db.close();
    db = null;
    initPromise = null;
    console.log('[DB] Database connection closed');
  }
}

module.exports = {
  init,
  getDb,
  close,
  nodes: nodesModule.nodes,
  tags: tagsModule.tags,
  settings: settingsModule.settings,
  discovery: discoveryModule.discovery,
  hardware: hardwareModule.hardware,
  stats: statsModule.stats,
  alerts: alertsModule.alerts,
  docker: dockerModule.docker,
  proxmox: proxmoxModule.proxmox,
  commands: commandsModule.commands,
  health: healthModule.health,
  capabilities: capabilitiesModule.capabilities,
  lvm: lvmModule.lvm,
  backups: backupsModule.backups,
  tasks: tasksModule.tasks,
};

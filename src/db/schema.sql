-- =====================================================
-- nodepulse Database Schema
-- =====================================================

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Nodes (Server/VMs/Container die wir managen)
CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    host TEXT NOT NULL,
    ssh_port INTEGER DEFAULT 22,
    ssh_user TEXT NOT NULL,
    ssh_password TEXT,
    ssh_key_path TEXT,

    -- Auto-detected, überschreibbar
    node_type TEXT DEFAULT 'unknown',
    -- Typen: proxmox-host, proxmox-vm, proxmox-ct, docker-host, bare-metal, raspberry-pi
    node_type_locked INTEGER DEFAULT 0,

    -- Hierarchy (Parent-Child Relationships)
    parent_id INTEGER REFERENCES nodes(id),
    auto_discovered_from INTEGER REFERENCES nodes(id),

    -- Settings
    auto_discovery INTEGER DEFAULT 1,
    monitoring_enabled INTEGER DEFAULT 1,
    monitoring_interval INTEGER DEFAULT 30,

    -- Status
    online INTEGER DEFAULT 0,
    last_seen DATETIME,
    last_error TEXT,

    -- Meta
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tags für Gruppierung
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    tag_type TEXT DEFAULT 'user',  -- 'system' oder 'user'
    color TEXT DEFAULT '#718096',
    description TEXT
);

-- Node-Tag Zuordnung (many-to-many)
CREATE TABLE IF NOT EXISTS node_tags (
    node_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (node_id, tag_id),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- =====================================================
-- DISCOVERY & HARDWARE
-- =====================================================

-- Discovery Ergebnisse (was wurde erkannt)
CREATE TABLE IF NOT EXISTS node_discovery (
    node_id INTEGER PRIMARY KEY,
    raw_json TEXT,

    -- Virtualisierung
    virtualization TEXT,  -- none, kvm, lxc, vmware, oracle

    -- Proxmox
    is_proxmox_host INTEGER DEFAULT 0,
    proxmox_version TEXT,
    is_proxmox_cluster INTEGER DEFAULT 0,
    proxmox_cluster_name TEXT,
    proxmox_cluster_nodes INTEGER,

    -- Container Runtimes
    has_docker INTEGER DEFAULT 0,
    docker_version TEXT,
    docker_containers INTEGER DEFAULT 0,
    has_podman INTEGER DEFAULT 0,
    podman_version TEXT,

    -- Hardware Type
    is_raspberry_pi INTEGER DEFAULT 0,
    raspberry_pi_model TEXT,

    -- System
    arch TEXT,
    os_id TEXT,
    os_name TEXT,
    hostname TEXT,
    has_systemd INTEGER DEFAULT 1,

    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Hardware Specs (statisch, ändert sich selten)
CREATE TABLE IF NOT EXISTS node_hardware (
    node_id INTEGER PRIMARY KEY,

    -- System
    system_manufacturer TEXT,
    system_product TEXT,
    system_serial TEXT,
    bios_version TEXT,
    boot_mode TEXT,  -- UEFI, Legacy

    -- CPU
    cpu_model TEXT,
    cpu_vendor TEXT,
    cpu_cores INTEGER,
    cpu_threads INTEGER,
    cpu_max_mhz REAL,
    cpu_arch TEXT,
    cpu_cache_l1 TEXT,
    cpu_cache_l2 TEXT,
    cpu_cache_l3 TEXT,
    cpu_virt_support TEXT,  -- vmx, svm, none

    -- Memory
    ram_total_bytes INTEGER,
    ram_type TEXT,
    ram_speed_mhz INTEGER,
    swap_total_bytes INTEGER,

    -- Storage (JSON array of disks)
    disks_json TEXT,

    -- Network (JSON array of interfaces)
    network_json TEXT,

    -- GPU (JSON array)
    gpu_json TEXT,

    -- Thermal sensors (JSON array)
    thermal_json TEXT,

    -- Power sensors (JSON array)
    power_json TEXT,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- =====================================================
-- MONITORING & STATS
-- =====================================================

-- Aktuelle Stats (Cache, wird oft überschrieben)
CREATE TABLE IF NOT EXISTS node_stats_current (
    node_id INTEGER PRIMARY KEY,

    timestamp INTEGER,  -- Unix timestamp

    -- CPU
    cpu_percent REAL,
    load_1m REAL,
    load_5m REAL,
    load_15m REAL,

    -- Memory
    ram_used_bytes INTEGER,
    ram_available_bytes INTEGER,
    ram_percent REAL,
    swap_used_bytes INTEGER,

    -- Disk (root partition)
    disk_used_bytes INTEGER,
    disk_available_bytes INTEGER,
    disk_percent REAL,

    -- Network (total across interfaces)
    net_rx_bytes INTEGER,
    net_tx_bytes INTEGER,

    -- Temperature
    temp_cpu REAL,

    -- System
    uptime_seconds INTEGER,
    processes INTEGER,

    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Stats History (für Graphen)
CREATE TABLE IF NOT EXISTS node_stats_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,

    cpu_percent REAL,
    load_1m REAL,
    ram_percent REAL,
    ram_used_bytes INTEGER,
    swap_used_bytes INTEGER,
    disk_percent REAL,
    net_rx_bytes INTEGER,
    net_tx_bytes INTEGER,
    temp_cpu REAL,

    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stats_history_node_time ON node_stats_history(node_id, timestamp);

-- =====================================================
-- ALERTS HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS alerts_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,        -- 'cpu', 'ram', 'disk', 'temp', 'offline'
    alert_level TEXT NOT NULL,       -- 'warning', 'critical'
    value REAL,                      -- aktueller Wert beim Alert
    threshold REAL,                  -- ueberschrittener Threshold
    message TEXT,                    -- beschreibende Nachricht
    created_at INTEGER NOT NULL,     -- Unix timestamp
    resolved_at INTEGER,             -- Unix timestamp wenn resolved, NULL wenn aktiv
    acknowledged INTEGER DEFAULT 0,  -- 0 = nicht bestaetigt, 1 = bestaetigt
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alerts_node ON alerts_history(node_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts_history(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts_history(created_at);

-- =====================================================
-- DOCKER OBJECTS
-- =====================================================

CREATE TABLE IF NOT EXISTS docker_containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    container_id TEXT NOT NULL,
    name TEXT,
    image TEXT,
    status TEXT,
    state TEXT,  -- running, exited, paused, created
    ports_json TEXT,
    created_at TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, container_id)
);

CREATE TABLE IF NOT EXISTS docker_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    image_id TEXT NOT NULL,
    repository TEXT,
    tag TEXT,
    size_bytes INTEGER,
    created_at TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, image_id)
);

CREATE TABLE IF NOT EXISTS docker_volumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    driver TEXT,
    mountpoint TEXT,
    size_bytes INTEGER,
    in_use INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, name)
);

CREATE TABLE IF NOT EXISTS docker_networks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    network_id TEXT NOT NULL,
    name TEXT,
    driver TEXT,
    scope TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, network_id)
);

-- =====================================================
-- PROXMOX OBJECTS
-- =====================================================

CREATE TABLE IF NOT EXISTS proxmox_vms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    vmid INTEGER NOT NULL,
    name TEXT,
    status TEXT,  -- running, stopped
    cpu_cores INTEGER,
    memory_bytes INTEGER,
    disk_bytes INTEGER,
    template INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, vmid)
);

CREATE TABLE IF NOT EXISTS proxmox_cts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    ctid INTEGER NOT NULL,
    name TEXT,
    status TEXT,  -- running, stopped
    cpu_cores INTEGER,
    memory_bytes INTEGER,
    disk_bytes INTEGER,
    template INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, ctid)
);

CREATE TABLE IF NOT EXISTS proxmox_storage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    storage_name TEXT NOT NULL,
    storage_type TEXT,
    total_bytes INTEGER,
    used_bytes INTEGER,
    available_bytes INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, storage_name)
);

CREATE TABLE IF NOT EXISTS proxmox_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    vmid INTEGER NOT NULL,
    vm_type TEXT NOT NULL,  -- 'vm' oder 'ct'
    snap_name TEXT NOT NULL,
    description TEXT,
    created_at TEXT,
    parent TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, vmid, vm_type, snap_name)
);

-- =====================================================
-- LVM STORAGE MANAGEMENT
-- =====================================================

-- Physical Volumes
CREATE TABLE IF NOT EXISTS node_lvm_pvs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    pv_name TEXT NOT NULL,           -- /dev/sda1
    vg_name TEXT,                    -- NULL wenn nicht zugewiesen
    pv_size_bytes INTEGER,
    pv_free_bytes INTEGER,
    pv_used_bytes INTEGER,
    pv_uuid TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, pv_name)
);

CREATE INDEX IF NOT EXISTS idx_lvm_pvs_node ON node_lvm_pvs(node_id);

-- Volume Groups
CREATE TABLE IF NOT EXISTS node_lvm_vgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    vg_name TEXT NOT NULL,
    vg_size_bytes INTEGER,
    vg_free_bytes INTEGER,
    vg_used_bytes INTEGER,
    pv_count INTEGER,
    lv_count INTEGER,
    vg_uuid TEXT,
    -- Proxmox Registration
    registered_storage_id TEXT,      -- NULL wenn nicht in Proxmox
    registered_storage_type TEXT,    -- 'lvm' oder NULL
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, vg_name)
);

CREATE INDEX IF NOT EXISTS idx_lvm_vgs_node ON node_lvm_vgs(node_id);

-- Logical Volumes (inkl. Thin Pools)
CREATE TABLE IF NOT EXISTS node_lvm_lvs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    lv_name TEXT NOT NULL,
    vg_name TEXT NOT NULL,
    lv_size_bytes INTEGER,
    lv_path TEXT,                    -- /dev/vg/lv
    lv_attr TEXT,                    -- z.B. "-wi-a-----" oder "twi-a-t---"
    is_thin_pool INTEGER DEFAULT 0,
    thin_pool_name TEXT,             -- Parent Thin Pool wenn Thin LV
    data_percent REAL,               -- Nur fuer Thin Pools
    -- Proxmox Registration
    registered_storage_id TEXT,
    registered_storage_type TEXT,    -- 'lvmthin' oder NULL
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, vg_name, lv_name)
);

CREATE INDEX IF NOT EXISTS idx_lvm_lvs_node ON node_lvm_lvs(node_id);
CREATE INDEX IF NOT EXISTS idx_lvm_lvs_vg ON node_lvm_lvs(node_id, vg_name);

-- Unformatierte Disks (fuer VG-Erstellung)
CREATE TABLE IF NOT EXISTS node_available_disks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    device_path TEXT NOT NULL,       -- /dev/sdb
    size_bytes INTEGER,
    model TEXT,
    serial TEXT,
    rotational INTEGER,              -- 1=HDD, 0=SSD/NVMe
    has_partitions INTEGER DEFAULT 0,
    in_use INTEGER DEFAULT 0,        -- Teil einer VG oder gemountet
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, device_path)
);

CREATE INDEX IF NOT EXISTS idx_available_disks_node ON node_available_disks(node_id);

-- =====================================================
-- SYSTEMD SERVICES
-- =====================================================

CREATE TABLE IF NOT EXISTS tracked_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    service_name TEXT NOT NULL,
    description TEXT,
    status TEXT,  -- active, inactive, failed
    sub_state TEXT,  -- running, dead, exited, failed
    enabled INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, service_name)
);

-- =====================================================
-- COMMANDS
-- =====================================================

-- Command Templates
CREATE TABLE IF NOT EXISTS command_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,  -- system, docker, proxmox, service
    node_types TEXT NOT NULL,  -- comma-separated: "proxmox-host,docker-host,bare-metal"
    template TEXT NOT NULL,
    requires_param TEXT,  -- NULL, "service", "container", "vmid", etc.
    dangerous INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
);

-- Command Execution History
CREATE TABLE IF NOT EXISTS command_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_template_id INTEGER,
    full_command TEXT NOT NULL,
    target_type TEXT NOT NULL,  -- 'single', 'type', 'tag', 'all'
    target_value TEXT,  -- node name, type, tag name
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (command_template_id) REFERENCES command_templates(id)
);

-- Command Results (pro Node)
CREATE TABLE IF NOT EXISTS command_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    status TEXT NOT NULL,  -- 'success', 'failed', 'timeout'
    exit_code INTEGER,
    output TEXT,
    error TEXT,
    started_at DATETIME,
    finished_at DATETIME,
    FOREIGN KEY (history_id) REFERENCES command_history(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- =====================================================
-- HEALTH CHECK
-- =====================================================

CREATE TABLE IF NOT EXISTS node_health (
    node_id INTEGER PRIMARY KEY,

    -- System
    kernel_version TEXT,
    last_boot TEXT,
    uptime_seconds INTEGER,
    reboot_required INTEGER DEFAULT 0,

    -- APT Updates
    apt_updates INTEGER DEFAULT 0,
    apt_security INTEGER DEFAULT 0,
    apt_packages_json TEXT,  -- JSON array of packages

    -- Proxmox specific
    pve_version TEXT,
    pve_repo TEXT,  -- 'enterprise', 'no-subscription', 'none'

    -- Other
    docker_images INTEGER DEFAULT 0,
    npm_outdated INTEGER DEFAULT 0,
    apt_cache_free_mb INTEGER DEFAULT 0,

    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- =====================================================
-- SETTINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TRIGGERS für updated_at
-- =====================================================

CREATE TRIGGER IF NOT EXISTS update_nodes_timestamp
AFTER UPDATE ON nodes
BEGIN
    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_settings_timestamp
AFTER UPDATE ON settings
BEGIN
    UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;

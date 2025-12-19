'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

const hardware = {
  /**
   * Get hardware data for a node
   */
  getForNode(nodeId) {
    const stmt = getDb().prepare('SELECT * FROM node_hardware WHERE node_id = ?');
    return stmt.get(nodeId);
  },

  /**
   * Save or update hardware data for a node
   */
  save(nodeId, data) {
    const stmt = getDb().prepare(`
      INSERT INTO node_hardware (
        node_id,
        system_manufacturer, system_product, system_serial, bios_version, boot_mode,
        cpu_model, cpu_vendor, cpu_cores, cpu_threads, cpu_max_mhz, cpu_arch,
        cpu_cache_l1, cpu_cache_l2, cpu_cache_l3, cpu_virt_support,
        cpu_stepping, cpu_microcode, cpu_min_mhz, cpu_cur_mhz, cpu_flags, cpu_bugs,
        ram_total_bytes, ram_type, ram_speed_mhz, swap_total_bytes,
        memory_slots_json, pci_devices_json,
        is_virtual, virt_type,
        disks_json, network_json, gpu_json, thermal_json, power_json,
        updated_at
      ) VALUES (
        @node_id,
        @system_manufacturer, @system_product, @system_serial, @bios_version, @boot_mode,
        @cpu_model, @cpu_vendor, @cpu_cores, @cpu_threads, @cpu_max_mhz, @cpu_arch,
        @cpu_cache_l1, @cpu_cache_l2, @cpu_cache_l3, @cpu_virt_support,
        @cpu_stepping, @cpu_microcode, @cpu_min_mhz, @cpu_cur_mhz, @cpu_flags, @cpu_bugs,
        @ram_total_bytes, @ram_type, @ram_speed_mhz, @swap_total_bytes,
        @memory_slots_json, @pci_devices_json,
        @is_virtual, @virt_type,
        @disks_json, @network_json, @gpu_json, @thermal_json, @power_json,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(node_id) DO UPDATE SET
        system_manufacturer = excluded.system_manufacturer,
        system_product = excluded.system_product,
        system_serial = excluded.system_serial,
        bios_version = excluded.bios_version,
        boot_mode = excluded.boot_mode,
        cpu_model = excluded.cpu_model,
        cpu_vendor = excluded.cpu_vendor,
        cpu_cores = excluded.cpu_cores,
        cpu_threads = excluded.cpu_threads,
        cpu_max_mhz = excluded.cpu_max_mhz,
        cpu_arch = excluded.cpu_arch,
        cpu_cache_l1 = excluded.cpu_cache_l1,
        cpu_cache_l2 = excluded.cpu_cache_l2,
        cpu_cache_l3 = excluded.cpu_cache_l3,
        cpu_virt_support = excluded.cpu_virt_support,
        cpu_stepping = excluded.cpu_stepping,
        cpu_microcode = excluded.cpu_microcode,
        cpu_min_mhz = excluded.cpu_min_mhz,
        cpu_cur_mhz = excluded.cpu_cur_mhz,
        cpu_flags = excluded.cpu_flags,
        cpu_bugs = excluded.cpu_bugs,
        ram_total_bytes = excluded.ram_total_bytes,
        ram_type = excluded.ram_type,
        ram_speed_mhz = excluded.ram_speed_mhz,
        swap_total_bytes = excluded.swap_total_bytes,
        memory_slots_json = excluded.memory_slots_json,
        pci_devices_json = excluded.pci_devices_json,
        is_virtual = excluded.is_virtual,
        virt_type = excluded.virt_type,
        disks_json = excluded.disks_json,
        network_json = excluded.network_json,
        gpu_json = excluded.gpu_json,
        thermal_json = excluded.thermal_json,
        power_json = excluded.power_json,
        updated_at = CURRENT_TIMESTAMP
    `);

    const system = data.system || {};
    const cpu = data.cpu || {};
    const memory = data.memory || {};
    const virt = data.virtualization || {};

    return stmt.run({
      node_id: nodeId,
      system_manufacturer: system.manufacturer || null,
      system_product: system.product || null,
      system_serial: system.serial || null,
      bios_version: system.bios_version || null,
      boot_mode: system.boot_mode || null,
      cpu_model: cpu.model || null,
      cpu_vendor: cpu.vendor || null,
      cpu_cores: cpu.cores || null,
      cpu_threads: cpu.threads || null,
      cpu_max_mhz: cpu.max_mhz || null,
      cpu_arch: cpu.arch || null,
      cpu_cache_l1: cpu.cache_l1 || null,
      cpu_cache_l2: cpu.cache_l2 || null,
      cpu_cache_l3: cpu.cache_l3 || null,
      cpu_virt_support: cpu.virt_support || null,
      // Extended CPU fields
      cpu_stepping: cpu.stepping || null,
      cpu_microcode: cpu.microcode || null,
      cpu_min_mhz: cpu.min_mhz || null,
      cpu_cur_mhz: cpu.cur_mhz || null,
      cpu_flags: cpu.flags || null,
      cpu_bugs: cpu.bugs || null,
      ram_total_bytes: memory.total_bytes || null,
      ram_type: memory.type || null,
      ram_speed_mhz: memory.speed_mhz || null,
      swap_total_bytes: memory.swap_total_bytes || null,
      // Extended RAM slots
      memory_slots_json: JSON.stringify(data.memory_slots || []),
      // PCI devices
      pci_devices_json: JSON.stringify(data.pci_devices || []),
      // Virtualization
      is_virtual: virt.is_virtual ? 1 : 0,
      virt_type: virt.type || null,
      disks_json: JSON.stringify(data.disks || []),
      network_json: JSON.stringify(data.network || []),
      gpu_json: JSON.stringify(data.gpu || []),
      thermal_json: JSON.stringify(data.thermal || []),
      power_json: JSON.stringify(data.power || []),
    });
  },

  /**
   * Delete hardware data for a node
   */
  delete(nodeId) {
    const stmt = getDb().prepare('DELETE FROM node_hardware WHERE node_id = ?');
    return stmt.run(nodeId);
  },
};

module.exports = { init, hardware };

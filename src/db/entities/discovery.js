'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

const discovery = {
  /**
   * Get discovery data for a node
   */
  getForNode(nodeId) {
    const stmt = getDb().prepare('SELECT * FROM node_discovery WHERE node_id = ?');
    return stmt.get(nodeId);
  },

  /**
   * Save or update discovery data for a node
   */
  save(nodeId, data) {
    const stmt = getDb().prepare(`
      INSERT INTO node_discovery (
        node_id, raw_json, virtualization,
        is_proxmox_host, proxmox_version, is_proxmox_cluster,
        proxmox_cluster_name, proxmox_cluster_nodes,
        has_docker, docker_version, docker_containers,
        has_podman, podman_version,
        is_raspberry_pi, raspberry_pi_model,
        arch, os_id, os_name, hostname, has_systemd,
        discovered_at
      ) VALUES (
        @node_id, @raw_json, @virtualization,
        @is_proxmox_host, @proxmox_version, @is_proxmox_cluster,
        @proxmox_cluster_name, @proxmox_cluster_nodes,
        @has_docker, @docker_version, @docker_containers,
        @has_podman, @podman_version,
        @is_raspberry_pi, @raspberry_pi_model,
        @arch, @os_id, @os_name, @hostname, @has_systemd,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(node_id) DO UPDATE SET
        raw_json = excluded.raw_json,
        virtualization = excluded.virtualization,
        is_proxmox_host = excluded.is_proxmox_host,
        proxmox_version = excluded.proxmox_version,
        is_proxmox_cluster = excluded.is_proxmox_cluster,
        proxmox_cluster_name = excluded.proxmox_cluster_name,
        proxmox_cluster_nodes = excluded.proxmox_cluster_nodes,
        has_docker = excluded.has_docker,
        docker_version = excluded.docker_version,
        docker_containers = excluded.docker_containers,
        has_podman = excluded.has_podman,
        podman_version = excluded.podman_version,
        is_raspberry_pi = excluded.is_raspberry_pi,
        raspberry_pi_model = excluded.raspberry_pi_model,
        arch = excluded.arch,
        os_id = excluded.os_id,
        os_name = excluded.os_name,
        hostname = excluded.hostname,
        has_systemd = excluded.has_systemd,
        discovered_at = CURRENT_TIMESTAMP
    `);

    return stmt.run({
      node_id: nodeId,
      raw_json: JSON.stringify(data),
      virtualization: data.virtualization || null,
      is_proxmox_host: data.is_proxmox_host ? 1 : 0,
      proxmox_version: data.proxmox_version || null,
      is_proxmox_cluster: data.is_proxmox_cluster ? 1 : 0,
      proxmox_cluster_name: data.proxmox_cluster_name || null,
      proxmox_cluster_nodes: data.proxmox_cluster_nodes || null,
      has_docker: data.has_docker ? 1 : 0,
      docker_version: data.docker_version || null,
      docker_containers: data.docker_containers || 0,
      has_podman: data.has_podman ? 1 : 0,
      podman_version: data.podman_version || null,
      is_raspberry_pi: data.is_raspberry_pi ? 1 : 0,
      raspberry_pi_model: data.raspberry_pi_model || null,
      arch: data.arch || null,
      os_id: data.os_id || null,
      os_name: data.os_name || null,
      hostname: data.hostname || null,
      has_systemd: data.has_systemd ? 1 : 0,
    });
  },

  /**
   * Delete discovery data for a node
   */
  delete(nodeId) {
    const stmt = getDb().prepare('DELETE FROM node_discovery WHERE node_id = ?');
    return stmt.run(nodeId);
  },
};

module.exports = { init, discovery };

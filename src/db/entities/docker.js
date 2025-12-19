'use strict';

// getDb wird als Parameter übergeben
let getDb = null;

function init(getDbFn) {
  getDb = getDbFn;
}

const docker = {
  /**
   * Get all Docker data for a node
   */
  getAllForNode(nodeId) {
    return {
      containers: this.getContainers(nodeId),
      images: this.getImages(nodeId),
      volumes: this.getVolumes(nodeId),
      networks: this.getNetworks(nodeId),
    };
  },

  /**
   * Get containers for a node
   */
  getContainers(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_containers WHERE node_id = ? ORDER BY name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Get a single container
   */
  getContainer(nodeId, containerId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_containers WHERE node_id = ? AND container_id = ?
    `);
    return stmt.get(nodeId, containerId);
  },

  /**
   * Save containers for a node (replaces all existing)
   */
  saveContainers(nodeId, containers) {
    const deleteStmt = getDb().prepare('DELETE FROM docker_containers WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO docker_containers (node_id, container_id, name, image, status, state, ports_json, created_at)
      VALUES (@node_id, @container_id, @name, @image, @status, @state, @ports_json, @created_at)
    `);

    const transaction = getDb().transaction(function(containers) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < containers.length; i++) {
        var c = containers[i];
        insertStmt.run({
          node_id: nodeId,
          container_id: c.id,
          name: c.name,
          image: c.image,
          status: c.status,
          state: c.state,
          ports_json: c.ports || null,
          created_at: c.created || null,
        });
      }
    });

    transaction(containers);
  },

  /**
   * Get images for a node
   */
  getImages(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_images WHERE node_id = ? ORDER BY repository, tag
    `);
    return stmt.all(nodeId);
  },

  /**
   * Save images for a node (replaces all existing)
   */
  saveImages(nodeId, images) {
    const deleteStmt = getDb().prepare('DELETE FROM docker_images WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO docker_images (node_id, image_id, repository, tag, size_bytes, created_at)
      VALUES (@node_id, @image_id, @repository, @tag, @size_bytes, @created_at)
    `);

    const transaction = getDb().transaction(function(images) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < images.length; i++) {
        var img = images[i];
        insertStmt.run({
          node_id: nodeId,
          image_id: img.id,
          repository: img.repository,
          tag: img.tag,
          size_bytes: img.size_bytes || 0,
          created_at: img.created || null,
        });
      }
    });

    transaction(images);
  },

  /**
   * Get volumes for a node
   */
  getVolumes(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_volumes WHERE node_id = ? ORDER BY name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Save volumes for a node (replaces all existing)
   */
  saveVolumes(nodeId, volumes) {
    const deleteStmt = getDb().prepare('DELETE FROM docker_volumes WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO docker_volumes (node_id, name, driver, mountpoint, in_use)
      VALUES (@node_id, @name, @driver, @mountpoint, @in_use)
    `);

    const transaction = getDb().transaction(function(volumes) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < volumes.length; i++) {
        var v = volumes[i];
        insertStmt.run({
          node_id: nodeId,
          name: v.name,
          driver: v.driver || 'local',
          mountpoint: v.mountpoint || null,
          in_use: v.in_use ? 1 : 0,
        });
      }
    });

    transaction(volumes);
  },

  /**
   * Get networks for a node
   */
  getNetworks(nodeId) {
    const stmt = getDb().prepare(`
      SELECT * FROM docker_networks WHERE node_id = ? ORDER BY name
    `);
    return stmt.all(nodeId);
  },

  /**
   * Save networks for a node (replaces all existing)
   */
  saveNetworks(nodeId, networks) {
    const deleteStmt = getDb().prepare('DELETE FROM docker_networks WHERE node_id = ?');
    const insertStmt = getDb().prepare(`
      INSERT OR REPLACE INTO docker_networks (node_id, network_id, name, driver, scope)
      VALUES (@node_id, @network_id, @name, @driver, @scope)
    `);

    const transaction = getDb().transaction(function(networks) {
      deleteStmt.run(nodeId);
      for (var i = 0; i < networks.length; i++) {
        var n = networks[i];
        insertStmt.run({
          node_id: nodeId,
          network_id: n.id,
          name: n.name,
          driver: n.driver || 'bridge',
          scope: n.scope || 'local',
        });
      }
    });

    transaction(networks);
  },

  /**
   * Save all Docker data for a node
   */
  saveAll(nodeId, data) {
    if (data.containers) {
      this.saveContainers(nodeId, data.containers);
    }
    if (data.images) {
      this.saveImages(nodeId, data.images);
    }
    if (data.volumes) {
      this.saveVolumes(nodeId, data.volumes);
    }
    if (data.networks) {
      this.saveNetworks(nodeId, data.networks);
    }
  },

  /**
   * Delete all Docker data for a node
   */
  deleteForNode(nodeId) {
    getDb().prepare('DELETE FROM docker_containers WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM docker_images WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM docker_volumes WHERE node_id = ?').run(nodeId);
    getDb().prepare('DELETE FROM docker_networks WHERE node_id = ?').run(nodeId);
  },

  /**
   * Get summary counts for a node
   */
  getSummary(nodeId) {
    const containers = getDb().prepare('SELECT COUNT(*) as count FROM docker_containers WHERE node_id = ?').get(nodeId);
    const running = getDb().prepare("SELECT COUNT(*) as count FROM docker_containers WHERE node_id = ? AND state = 'running'").get(nodeId);
    const images = getDb().prepare('SELECT COUNT(*) as count FROM docker_images WHERE node_id = ?').get(nodeId);
    const volumes = getDb().prepare('SELECT COUNT(*) as count FROM docker_volumes WHERE node_id = ?').get(nodeId);
    const networks = getDb().prepare('SELECT COUNT(*) as count FROM docker_networks WHERE node_id = ?').get(nodeId);

    return {
      containers_total: containers.count,
      containers_running: running.count,
      images: images.count,
      volumes: volumes.count,
      networks: networks.count,
    };
  },
};

module.exports = { init, docker };

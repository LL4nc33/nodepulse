/**
 * Health API Routes
 * System health checks, updates, and Proxmox repository management
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../db');
const ssh = require('../../ssh');
const { asyncHandler, apiResponse } = require('./helpers');
const path = require('path');
const fs = require('fs');

// Script paths
const SCRIPTS_DIR = path.join(__dirname, '..', '..', '..', 'scripts');
const HEALTH_CHECK_SCRIPT = fs.readFileSync(path.join(SCRIPTS_DIR, 'health-check.sh'), 'utf8');
const PROXMOX_REPO_SCRIPT = fs.readFileSync(path.join(SCRIPTS_DIR, 'proxmox-repo.sh'), 'utf8');

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * GET /api/nodes/:nodeId/health
 * Get cached health data for a node
 */
router.get('/', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.nodeId, 10);
  const node = db.nodes.getById(nodeId);

  if (!node) {
    return apiResponse(res, 404, null, 'Node nicht gefunden');
  }

  const health = db.health.get(nodeId);

  if (!health) {
    return apiResponse(res, 200, {
      node_id: nodeId,
      node_name: node.name,
      checked: false,
      message: 'Noch kein Health-Check durchgefuehrt',
    });
  }

  // Parse packages JSON
  let packages = [];
  if (health.apt_packages_json) {
    try {
      packages = JSON.parse(health.apt_packages_json);
    } catch (e) {
      packages = [];
    }
  }

  return apiResponse(res, 200, {
    ...health,
    node_name: node.name,
    apt_packages: packages,
    checked: true,
  });
}));

/**
 * POST /api/nodes/:nodeId/health/check
 * Run a health check on the node
 */
router.post('/check', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.nodeId, 10);
  // Use getByIdWithCredentials for SSH operations!
  const node = db.nodes.getByIdWithCredentials(nodeId);

  if (!node) {
    return apiResponse(res, 404, null, 'Node nicht gefunden');
  }

  if (!node.online) {
    return apiResponse(res, 400, null, 'Node ist offline');
  }

  try {
    // Run health check script via SSH (120s timeout for apt update)
    const result = await ssh.executeScript(node, HEALTH_CHECK_SCRIPT, 120000);

    // Parse JSON output
    let healthData;
    try {
      healthData = JSON.parse(result.stdout);
    } catch (e) {
      console.error('[Health] Parse error:', result.stdout);
      return apiResponse(res, 500, null, 'Ungültige Antwort vom Health-Check Script');
    }

    // Save to database (Extended health metrics)
    db.health.save(nodeId, {
      kernel_version: healthData.kernel_version,
      last_boot: healthData.last_boot,
      uptime_seconds: healthData.uptime_seconds,
      reboot_required: healthData.reboot_required,
      // Extended metrics
      cpu_temp: healthData.cpu_temp,
      cpu_temp_status: healthData.cpu_temp_status,
      load_1: healthData.load_1,
      load_5: healthData.load_5,
      load_15: healthData.load_15,
      load_status: healthData.load_status,
      mem_percent: healthData.mem_percent,
      mem_status: healthData.mem_status,
      swap_percent: healthData.swap_percent,
      swap_status: healthData.swap_status,
      disk_percent: healthData.disk_percent,
      disk_status: healthData.disk_status,
      failed_services: healthData.failed_services,
      failed_services_list: healthData.failed_services_list,
      services_status: healthData.services_status,
      zombie_processes: healthData.zombie_processes,
      zombie_status: healthData.zombie_status,
      time_sync: healthData.time_sync,
      time_status: healthData.time_status,
      net_gateway: healthData.net_gateway,
      net_status: healthData.net_status,
      health_score: healthData.health_score,
      health_status: healthData.health_status,
      health_issues: healthData.health_issues,
      // APT
      apt_updates: healthData.apt_updates,
      apt_security: healthData.apt_security,
      apt_status: healthData.apt_status,
      apt_packages_json: JSON.stringify(healthData.apt_packages || []),
      // Proxmox & Other
      pve_version: healthData.pve_version,
      pve_repo: healthData.pve_repo,
      docker_images: healthData.docker_images,
      npm_outdated: healthData.npm_outdated,
      apt_cache_free_mb: healthData.apt_cache_free_mb,
    });

    // Return fresh data
    return apiResponse(res, 200, {
      node_id: nodeId,
      node_name: node.name,
      ...healthData,
      checked: true,
    });
  } catch (err) {
    console.error('[Health] Check error:', err);

    // Provide better error messages for common SSH issues
    let errorMessage = err.message;
    if (err.message.includes('authentication methods failed')) {
      errorMessage = 'SSH-Authentifizierung fehlgeschlagen. Bitte SSH-Passwort oder SSH-Key in den Node-Einstellungen konfigurieren.';
    } else if (err.message.includes('ECONNREFUSED')) {
      errorMessage = 'Verbindung abgelehnt. SSH-Dienst auf dem Node nicht erreichbar.';
    } else if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
      errorMessage = 'Verbindungs-Timeout. Node ist möglicherweise nicht erreichbar.';
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      errorMessage = 'Host nicht gefunden. Bitte Hostname/IP in den Node-Einstellungen prüfen.';
    }

    return apiResponse(res, 500, null, errorMessage);
  }
}));

// =============================================================================
// PROXMOX REPOSITORY
// =============================================================================

/**
 * GET /api/nodes/:nodeId/health/repo
 * Get Proxmox repository status
 */
router.get('/repo', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.nodeId, 10);
  const node = db.nodes.getById(nodeId);

  if (!node) {
    return apiResponse(res, 404, null, 'Node nicht gefunden');
  }

  // Check if node is Proxmox
  const discovery = db.discovery.get(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, 'Kein Proxmox-Host');
  }

  if (!node.online) {
    return apiResponse(res, 400, null, 'Node ist offline');
  }

  try {
    // Create script with ACTION set
    const script = 'ACTION="status"\n' + PROXMOX_REPO_SCRIPT;
    const result = await ssh.executeScript(node, script, 30000);

    const data = JSON.parse(result.stdout);
    return apiResponse(res, 200, data);
  } catch (err) {
    console.error('[Health] Repo status error:', err);
    return apiResponse(res, 500, null, err.message);
  }
}));

/**
 * POST /api/nodes/:nodeId/health/repo
 * Switch Proxmox repository
 * Body: { mode: "enterprise" | "no-subscription" }
 */
router.post('/repo', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.nodeId, 10);
  const { mode } = req.body;
  // Use getByIdWithCredentials for SSH operations!
  const node = db.nodes.getByIdWithCredentials(nodeId);

  if (!node) {
    return apiResponse(res, 404, null, 'Node nicht gefunden');
  }

  if (!['enterprise', 'no-subscription'].includes(mode)) {
    return apiResponse(res, 400, null, 'Ungültiger Modus. Verwende "enterprise" oder "no-subscription"');
  }

  // Check if node is Proxmox
  const discovery = db.discovery.get(nodeId);
  if (!discovery || !discovery.is_proxmox_host) {
    return apiResponse(res, 400, null, 'Kein Proxmox-Host');
  }

  if (!node.online) {
    return apiResponse(res, 400, null, 'Node ist offline');
  }

  try {
    // Create script with ACTION set
    const script = `ACTION="${mode}"\n` + PROXMOX_REPO_SCRIPT;
    const result = await ssh.executeScript(node, script, 120000);

    const data = JSON.parse(result.stdout);

    // Update health data with new repo
    const health = db.health.get(nodeId);
    if (health) {
      db.health.save(nodeId, {
        ...health,
        pve_repo: mode,
      });
    }

    return apiResponse(res, 200, data);
  } catch (err) {
    console.error('[Health] Repo switch error:', err);
    return apiResponse(res, 500, null, err.message);
  }
}));

/**
 * POST /api/nodes/:nodeId/health/upgrade
 * Run apt upgrade on the node
 */
router.post('/upgrade', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.nodeId, 10);
  // Use getByIdWithCredentials for SSH operations!
  const node = db.nodes.getByIdWithCredentials(nodeId);

  if (!node) {
    return apiResponse(res, 404, null, 'Node nicht gefunden');
  }

  if (!node.online) {
    return apiResponse(res, 400, null, 'Node ist offline');
  }

  // Check if node is Proxmox (use specialized script) or general Linux
  const discovery = db.discovery.get(nodeId);
  const isProxmox = discovery && discovery.is_proxmox_host;

  try {
    let result;
    if (isProxmox) {
      // Use proxmox-repo.sh upgrade
      const script = 'ACTION="upgrade"\n' + PROXMOX_REPO_SCRIPT;
      result = await ssh.executeScript(node, script, 600000); // 10 min timeout
    } else {
      // Generic apt upgrade script - fully non-interactive
      // Uses sudo with password for non-root users
      // Escape password for shell (single quotes, escape existing single quotes)
      const escapedPassword = node.ssh_password
        ? node.ssh_password.replace(/'/g, "'\\''")
        : '';

      const upgradeScript = `#!/bin/bash
# Vollständig nicht-interaktiv
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
export APT_LISTCHANGES_FRONTEND=none
export UCF_FORCE_CONFFOLD=1

# Sudo helper function - uses password if available
do_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif [ -n '${escapedPassword}' ]; then
    echo '${escapedPassword}' | sudo -S -E "$@" 2>/dev/null
  else
    sudo -E "$@"
  fi
}

# Update package lists
do_sudo apt-get update -qq 2>&1

# Count upgradable packages
UPGRADABLE=$(apt list --upgradable 2>/dev/null | grep -c "upgradable" || echo "0")
if [ "$UPGRADABLE" -eq 0 ]; then
  echo '{"success": true, "message": "System ist bereits aktuell", "packages_upgraded": 0}'
  exit 0
fi

# Run upgrade with all non-interactive options
yes | do_sudo apt-get -y -qq \\
  -o Dpkg::Options::="--force-confdef" \\
  -o Dpkg::Options::="--force-confold" \\
  -o Dpkg::Options::="--force-confnew" \\
  --allow-downgrades \\
  --allow-remove-essential \\
  --allow-change-held-packages \\
  dist-upgrade 2>&1

# Cleanup
yes | do_sudo apt-get -y -qq autoremove 2>&1
do_sudo apt-get -y -qq autoclean 2>&1

# Check if reboot required
REBOOT="false"
[ -f /var/run/reboot-required ] && REBOOT="true"
echo "{\\"success\\": true, \\"packages_upgraded\\": $UPGRADABLE, \\"reboot_required\\": $REBOOT}"
`;
      result = await ssh.executeScript(node, upgradeScript, 600000); // 10 min timeout
    }

    // Try to parse JSON from last line
    const lines = result.stdout.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    let data;
    try {
      data = JSON.parse(lastLine);
    } catch (e) {
      data = { success: true, message: 'Upgrade durchgefuehrt', raw: result.stdout };
    }

    // Refresh health data after upgrade
    setTimeout(async () => {
      try {
        const healthResult = await ssh.executeScript(node, HEALTH_CHECK_SCRIPT, 120000);
        const healthData = JSON.parse(healthResult.stdout);
        db.health.save(nodeId, {
          kernel_version: healthData.kernel_version,
          last_boot: healthData.last_boot,
          uptime_seconds: healthData.uptime_seconds,
          reboot_required: healthData.reboot_required,
          apt_updates: healthData.apt_updates,
          apt_security: healthData.apt_security,
          apt_packages_json: JSON.stringify(healthData.apt_packages || []),
          pve_version: healthData.pve_version,
          pve_repo: healthData.pve_repo,
          docker_images: healthData.docker_images,
          npm_outdated: healthData.npm_outdated,
          apt_cache_free_mb: healthData.apt_cache_free_mb,
        });
      } catch (e) {
        console.error('[Health] Post-upgrade refresh failed:', e);
      }
    }, 2000);

    return apiResponse(res, 200, data);
  } catch (err) {
    console.error('[Health] Upgrade error:', err);
    return apiResponse(res, 500, null, err.message);
  }
}));

module.exports = router;

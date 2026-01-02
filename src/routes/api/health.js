/**
 * Health API Routes
 * System health checks, updates, and Proxmox repository management
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../db');
const ssh = require('../../ssh');
const childCollector = require('../../collector/child-collector');
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
    let healthData;

    // Check if this is a child node (VM/LXC)
    if (node.guest_type && node.parent_id) {
      // Child-Node: Health check via pct/qm exec through parent
      const parent = db.nodes.getByIdWithCredentials(node.parent_id);
      if (!parent) {
        return apiResponse(res, 400, null, 'Parent-Node nicht gefunden');
      }
      if (!parent.online) {
        return apiResponse(res, 400, null, 'Parent-Node ist offline');
      }

      console.log('[Health] Running child health check for ' + node.name +
                  ' (' + node.guest_type + ' ' + node.guest_vmid + ') via ' + parent.name);

      // Run health commands via pct/qm exec
      const commands = ['kernel-version', 'uptime', 'load', 'memory', 'df-root',
                        'systemctl-failed', 'reboot-required', 'apt-updates'];

      const batchResult = await childCollector.execBatchInChild(
        parent,
        node.guest_vmid,
        node.guest_type,
        commands,
        { timeout: 60000 }
      );

      if (!batchResult.success) {
        return apiResponse(res, 500, null, 'Health-Check fehlgeschlagen: ' + batchResult.error);
      }

      // Parse child health results
      healthData = parseChildHealthResults(batchResult.results, node);
    } else {
      // Normal node: Run health check script via SSH (120s timeout for apt update)
      const result = await ssh.controlMaster.executeScript(node, HEALTH_CHECK_SCRIPT, 120000);

      // Parse JSON output
      try {
        healthData = JSON.parse(result.stdout);
      } catch (e) {
        console.error('[Health] Parse error:', result.stdout);
        return apiResponse(res, 500, null, 'Ungültige Antwort vom Health-Check Script');
      }
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

/**
 * Parse health results from child node batch commands
 */
function parseChildHealthResults(results, childNode) {
  var healthData = {
    kernel_version: '',
    last_boot: '',
    uptime_seconds: 0,
    reboot_required: 0,
    cpu_temp: 0,
    cpu_temp_status: 'unknown',
    load_1: 0,
    load_5: 0,
    load_15: 0,
    load_status: 'ok',
    mem_percent: 0,
    mem_status: 'ok',
    swap_percent: 0,
    swap_status: 'ok',
    disk_percent: 0,
    disk_status: 'ok',
    failed_services: 0,
    failed_services_list: '',
    services_status: 'ok',
    zombie_processes: 0,
    zombie_status: 'ok',
    time_sync: '',
    time_status: 'unknown',
    net_gateway: '',
    net_status: 'ok',
    health_score: 100,
    health_status: 'healthy',
    health_issues: '',
    apt_updates: 0,
    apt_security: 0,
    apt_status: 'ok',
    apt_packages: [],
    pve_version: '',
    pve_repo: '',
    docker_images: 0,
    npm_outdated: 0,
    apt_cache_free_mb: 0,
  };

  var issues = [];

  // Parse kernel version
  if (results['kernel-version'] && results['kernel-version'].success) {
    healthData.kernel_version = results['kernel-version'].stdout.trim();
  }

  // Parse uptime
  if (results.uptime && results.uptime.success) {
    var uptimeOutput = results.uptime.stdout.trim();
    var upMatch = uptimeOutput.match(/up\s+(\d+)\s+day/i);
    var hourMatch = uptimeOutput.match(/up\s+(?:\d+\s+days?,\s+)?(\d+):(\d+)/);
    var seconds = 0;
    if (upMatch) {
      seconds += parseInt(upMatch[1], 10) * 86400;
    }
    if (hourMatch) {
      seconds += parseInt(hourMatch[1], 10) * 3600;
      seconds += parseInt(hourMatch[2], 10) * 60;
    }
    healthData.uptime_seconds = seconds;
  }

  // Parse load average
  if (results.load && results.load.success) {
    var loadParts = results.load.stdout.trim().split(/\s+/);
    if (loadParts.length >= 3) {
      healthData.load_1 = parseFloat(loadParts[0]) || 0;
      healthData.load_5 = parseFloat(loadParts[1]) || 0;
      healthData.load_15 = parseFloat(loadParts[2]) || 0;

      // Get CPU cores from discovery to calculate load status
      var discovery = db.discovery.getByNodeId(childNode.id);
      var cores = (discovery && discovery.cpu_cores) || 1;
      var loadPercent = Math.round((healthData.load_1 / cores) * 100);

      if (loadPercent > 100) {
        healthData.load_status = 'critical';
        issues.push('Load critical (' + loadPercent + '%)');
      } else if (loadPercent > 80) {
        healthData.load_status = 'warning';
        issues.push('Load warning (' + loadPercent + '%)');
      }
    }
  }

  // Parse memory
  if (results.memory && results.memory.success) {
    var memLines = results.memory.stdout.trim().split('\n');
    for (var i = 0; i < memLines.length; i++) {
      var line = memLines[i];
      if (line.indexOf('Mem:') === 0) {
        var memParts = line.split(/\s+/);
        if (memParts.length >= 3) {
          var totalBytes = parseInt(memParts[1], 10) || 0;
          var usedBytes = parseInt(memParts[2], 10) || 0;
          if (totalBytes > 0) {
            healthData.mem_percent = Math.round((usedBytes / totalBytes) * 100);
            if (healthData.mem_percent > 90) {
              healthData.mem_status = 'critical';
              issues.push('Memory critical (' + healthData.mem_percent + '%)');
            } else if (healthData.mem_percent > 80) {
              healthData.mem_status = 'warning';
              issues.push('Memory warning (' + healthData.mem_percent + '%)');
            }
          }
        }
        break;
      }
    }
  }

  // Parse disk usage
  if (results['df-root'] && results['df-root'].success) {
    var diskStr = results['df-root'].stdout.trim().replace('%', '');
    healthData.disk_percent = parseInt(diskStr, 10) || 0;
    if (healthData.disk_percent > 90) {
      healthData.disk_status = 'critical';
      issues.push('Disk critical (' + healthData.disk_percent + '%)');
    } else if (healthData.disk_percent > 80) {
      healthData.disk_status = 'warning';
      issues.push('Disk warning (' + healthData.disk_percent + '%)');
    }
  }

  // Parse systemctl failed
  if (results['systemctl-failed'] && results['systemctl-failed'].success) {
    var failedOutput = results['systemctl-failed'].stdout.trim();
    var failedMatch = failedOutput.match(/(\d+)\s+loaded\s+units/i);
    if (failedMatch) {
      healthData.failed_services = parseInt(failedMatch[1], 10) || 0;
    }
    if (failedOutput.indexOf('failed') !== -1 && failedOutput.indexOf('0 loaded') === -1) {
      healthData.services_status = 'warning';
      issues.push('Failed services detected');
    }
  }

  // Parse reboot required
  if (results['reboot-required'] && results['reboot-required'].success) {
    healthData.reboot_required = results['reboot-required'].stdout.trim() === '1' ? 1 : 0;
    if (healthData.reboot_required) {
      issues.push('Reboot required');
    }
  }

  // Parse apt updates
  if (results['apt-updates'] && results['apt-updates'].success) {
    healthData.apt_updates = parseInt(results['apt-updates'].stdout.trim(), 10) || 0;
    if (healthData.apt_updates > 0) {
      healthData.apt_status = 'warning';
      issues.push(healthData.apt_updates + ' updates available');
    }
  }

  // Calculate health score
  var deductions = 0;
  if (healthData.load_status === 'critical') deductions += 20;
  else if (healthData.load_status === 'warning') deductions += 10;

  if (healthData.mem_status === 'critical') deductions += 20;
  else if (healthData.mem_status === 'warning') deductions += 10;

  if (healthData.disk_status === 'critical') deductions += 20;
  else if (healthData.disk_status === 'warning') deductions += 10;

  if (healthData.services_status === 'warning') deductions += 10;
  if (healthData.reboot_required) deductions += 5;
  if (healthData.apt_updates > 10) deductions += 5;

  healthData.health_score = Math.max(0, 100 - deductions);

  if (healthData.health_score >= 90) {
    healthData.health_status = 'healthy';
  } else if (healthData.health_score >= 70) {
    healthData.health_status = 'warning';
  } else {
    healthData.health_status = 'critical';
  }

  healthData.health_issues = issues.join(', ');

  return healthData;
}

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
    const result = await ssh.controlMaster.executeScript(node, script, 30000);

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
    const result = await ssh.controlMaster.executeScript(node, script, 120000);

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
      result = await ssh.controlMaster.executeScript(node, script, 600000); // 10 min timeout
    } else {
      // Generic apt upgrade script - fully non-interactive
      // Uses sudo with password for non-root users
      // SECURITY: Password is stored in a shell variable and passed via printf
      // This prevents the password from appearing in process listings (ps aux)
      // because only "$_NP_PASS" appears instead of the actual password
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

# SECURITY: Store password in variable - only variable name visible in ps
_NP_PASS='${escapedPassword}'

# Sudo helper function - uses password if available
# Uses printf instead of echo to avoid password appearing in process list
do_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif [ -n "$_NP_PASS" ]; then
    printf '%s\\n' "$_NP_PASS" | sudo -S -E "$@" 2>/dev/null
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
      result = await ssh.controlMaster.executeScript(node, upgradeScript, 600000); // 10 min timeout
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
        const healthResult = await ssh.controlMaster.executeScript(node, HEALTH_CHECK_SCRIPT, 120000);
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

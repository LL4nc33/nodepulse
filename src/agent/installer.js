/**
 * Agent Installer
 *
 * Installs NodePulse agent on remote nodes via SSH.
 * Features:
 * - Architecture detection (x86_64, aarch64, armv7l, armv6l)
 * - Binary download from GitHub releases
 * - Config file generation
 * - systemd service setup
 */

'use strict';

var db = require('../db');
var ssh = require('../ssh');

// Architecture mapping
var ARCH_MAP = {
  'x86_64': 'amd64',
  'amd64': 'amd64',
  'aarch64': 'arm64',
  'arm64': 'arm64',
  'armv7l': 'armv7',
  'armv6l': 'armv6'
};

// Installation paths
var INSTALL_DIR = '/opt/nodepulse-agent';
var BINARY_NAME = 'nodepulse-agent';
var CONFIG_FILE = 'config.json';
var SERVICE_NAME = 'nodepulse-agent';

/**
 * Detect architecture of remote node
 * @param {Object} node - Node object with credentials
 * @returns {Promise<string>} Architecture (amd64, arm64, armv7, armv6)
 */
async function detectArch(node) {
  var result = await ssh.execute(node, 'uname -m', 10000);
  var rawArch = result.stdout.trim();

  var arch = ARCH_MAP[rawArch];
  if (!arch) {
    throw new Error('Unsupported architecture: ' + rawArch);
  }

  return arch;
}

/**
 * Build download URL for agent binary
 * @param {string} arch - Target architecture
 * @param {Object} settings - App settings
 * @returns {string} Download URL
 */
function getBinaryUrl(arch, settings) {
  var source = settings.agent_binary_source || 'github';

  if (source === 'github') {
    var repo = settings.agent_github_repo || 'oidanice/nodepulse-agent';
    return 'https://github.com/' + repo + '/releases/latest/download/nodepulse-agent-linux-' + arch;
  }

  // Local source - URL must be provided in settings
  return settings.agent_binary_url || '';
}

/**
 * Generate agent configuration
 * @param {Object} node - Node object
 * @param {string} apiKey - Agent API key
 * @param {Object} settings - App settings
 * @returns {string} JSON config content
 */
function generateConfig(node, apiKey, settings) {
  var serverPort = settings.agent_server_port || 3001;

  // Determine server URL
  // In production, this should be the external URL of the NodePulse server
  // For now, we use the node's perspective (reverse connection)
  var serverUrl = settings.agent_server_url || ('ws://localhost:' + serverPort);

  var config = {
    server_url: serverUrl,
    api_key: apiKey,
    node_id: node.id,
    push_interval: 5,  // seconds
    log_level: 'info'
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate systemd service unit
 * @returns {string} systemd unit file content
 */
function generateSystemdUnit() {
  return [
    '[Unit]',
    'Description=NodePulse Monitoring Agent',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    'ExecStart=' + INSTALL_DIR + '/' + BINARY_NAME,
    'WorkingDirectory=' + INSTALL_DIR,
    'Restart=always',
    'RestartSec=10',
    'StandardOutput=journal',
    'StandardError=journal',
    'SyslogIdentifier=nodepulse-agent',
    '',
    '# Security hardening',
    'NoNewPrivileges=yes',
    'ProtectSystem=strict',
    'ProtectHome=yes',
    'PrivateTmp=yes',
    'ReadWritePaths=' + INSTALL_DIR,
    '',
    '[Install]',
    'WantedBy=multi-user.target'
  ].join('\n');
}

/**
 * Install agent on a node
 * @param {Object} node - Node object with credentials
 * @param {Object} options - Installation options
 * @returns {Promise<Object>} Installation result
 */
async function install(node, options) {
  options = options || {};

  var settings = db.settings.getAll();

  // Step 1: Detect architecture
  console.log('[Installer] Detecting architecture for node ' + node.id);
  var arch = await detectArch(node);
  console.log('[Installer] Detected architecture: ' + arch);

  // Step 2: Generate API key
  var apiKey = db.agents.enable(node.id);
  console.log('[Installer] Generated API key for node ' + node.id);

  // Step 3: Create installation directory
  var createDirScript = [
    'sudo mkdir -p ' + INSTALL_DIR,
    'sudo chown $(whoami):$(whoami) ' + INSTALL_DIR
  ].join(' && ');

  await ssh.execute(node, createDirScript, 30000);
  console.log('[Installer] Created installation directory');

  // Step 4: Download binary
  var binaryUrl = getBinaryUrl(arch, settings);
  if (!binaryUrl) {
    throw new Error('No binary URL configured');
  }

  var downloadScript = [
    'curl -fsSL -o ' + INSTALL_DIR + '/' + BINARY_NAME + ' "' + binaryUrl + '"',
    'chmod +x ' + INSTALL_DIR + '/' + BINARY_NAME
  ].join(' && ');

  console.log('[Installer] Downloading binary from ' + binaryUrl);
  await ssh.execute(node, downloadScript, 120000);
  console.log('[Installer] Binary downloaded and made executable');

  // Step 5: Create config file
  var configContent = generateConfig(node, apiKey, settings);
  var configScript = "cat > " + INSTALL_DIR + "/" + CONFIG_FILE + " << 'EOFCONFIG'\n" + configContent + "\nEOFCONFIG";

  await ssh.execute(node, configScript, 10000);
  console.log('[Installer] Config file created');

  // Step 6: Create systemd service
  var unitContent = generateSystemdUnit();
  var unitPath = '/etc/systemd/system/' + SERVICE_NAME + '.service';
  var serviceScript = "sudo tee " + unitPath + " > /dev/null << 'EOFUNIT'\n" + unitContent + "\nEOFUNIT";

  await ssh.execute(node, serviceScript, 10000);
  console.log('[Installer] systemd service created');

  // Step 7: Enable and start service
  var startScript = [
    'sudo systemctl daemon-reload',
    'sudo systemctl enable ' + SERVICE_NAME,
    'sudo systemctl start ' + SERVICE_NAME
  ].join(' && ');

  await ssh.execute(node, startScript, 30000);
  console.log('[Installer] Service enabled and started');

  // Step 8: Get agent version
  var version = 'unknown';
  try {
    var versionResult = await ssh.execute(node, INSTALL_DIR + '/' + BINARY_NAME + ' --version 2>/dev/null || echo unknown', 5000);
    version = versionResult.stdout.trim() || 'unknown';
  } catch (err) {
    // Ignore version detection errors
  }

  // Step 9: Update database
  db.agents.setInstalled(node.id, {
    version: version,
    arch: arch,
    method: 'ssh'
  });

  return {
    success: true,
    node_id: node.id,
    arch: arch,
    version: version,
    api_key: apiKey
  };
}

/**
 * Update agent on a node
 * @param {Object} node - Node object with credentials
 * @returns {Promise<Object>} Update result
 */
async function update(node) {
  var settings = db.settings.getAll();

  // Get current arch from database
  var agentInfo = db.agents.get(node.id);
  var arch = agentInfo ? agentInfo.agent_arch : null;

  if (!arch) {
    // Detect if not known
    arch = await detectArch(node);
  }

  // Stop service
  await ssh.execute(node, 'sudo systemctl stop ' + SERVICE_NAME + ' || true', 30000);

  // Download new binary
  var binaryUrl = getBinaryUrl(arch, settings);
  var downloadScript = [
    'curl -fsSL -o ' + INSTALL_DIR + '/' + BINARY_NAME + '.new "' + binaryUrl + '"',
    'chmod +x ' + INSTALL_DIR + '/' + BINARY_NAME + '.new',
    'mv ' + INSTALL_DIR + '/' + BINARY_NAME + '.new ' + INSTALL_DIR + '/' + BINARY_NAME
  ].join(' && ');

  await ssh.execute(node, downloadScript, 120000);

  // Get new version
  var version = 'unknown';
  try {
    var versionResult = await ssh.execute(node, INSTALL_DIR + '/' + BINARY_NAME + ' --version 2>/dev/null || echo unknown', 5000);
    version = versionResult.stdout.trim() || 'unknown';
  } catch (err) {
    // Ignore
  }

  // Start service
  await ssh.execute(node, 'sudo systemctl start ' + SERVICE_NAME, 30000);

  // Update database
  db.agents.setInstalled(node.id, {
    version: version,
    arch: arch,
    method: 'ssh'
  });

  return {
    success: true,
    node_id: node.id,
    version: version
  };
}

/**
 * Uninstall agent from a node
 * @param {Object} node - Node object with credentials
 * @returns {Promise<Object>} Uninstall result
 */
async function uninstall(node) {
  var uninstallScript = [
    'sudo systemctl stop ' + SERVICE_NAME + ' || true',
    'sudo systemctl disable ' + SERVICE_NAME + ' || true',
    'sudo rm -f /etc/systemd/system/' + SERVICE_NAME + '.service',
    'sudo systemctl daemon-reload',
    'sudo rm -rf ' + INSTALL_DIR
  ].join(' && ');

  await ssh.execute(node, uninstallScript, 60000);

  // Update database
  db.agents.disable(node.id);

  return {
    success: true,
    node_id: node.id
  };
}

/**
 * Check agent service status
 * @param {Object} node - Node object with credentials
 * @returns {Promise<Object>} Service status
 */
async function getStatus(node) {
  var result = await ssh.execute(node, 'systemctl is-active ' + SERVICE_NAME + ' 2>/dev/null || echo inactive', 10000);
  var status = result.stdout.trim();

  return {
    node_id: node.id,
    service_status: status,
    running: status === 'active'
  };
}

module.exports = {
  detectArch: detectArch,
  install: install,
  update: update,
  uninstall: uninstall,
  getStatus: getStatus,
  ARCH_MAP: ARCH_MAP
};

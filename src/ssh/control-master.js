const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// SSH CONTROL MASTER CONFIGURATION
// =============================================================================
//
// ControlMaster enables SSH connection multiplexing:
// - First connection creates a master socket
// - Subsequent connections reuse the master socket
// - ControlPersist keeps the master alive for 60 seconds after last use
//
// Performance Impact:
// - First connection: ~200ms (full SSH handshake)
// - Subsequent connections: ~10-20ms (socket reuse)
// - ~90% latency reduction for repeated commands
// =============================================================================

const CONTROL_PATH_DIR = path.join(os.tmpdir(), 'nodepulse-ssh');
const CONTROL_PERSIST = '60'; // seconds

// Ensure control path directory exists
if (!fs.existsSync(CONTROL_PATH_DIR)) {
  fs.mkdirSync(CONTROL_PATH_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Get SSH options for connection multiplexing
 * @param {Object} node - Node object with host, ssh_port, ssh_user
 * @returns {Array<string>} SSH command options
 */
function getSSHOptions(node) {
  const controlPath = path.join(
    CONTROL_PATH_DIR,
    `ssh-${node.ssh_user}@${node.host}:${node.ssh_port || 22}`
  );

  return [
    '-o', 'ControlMaster=auto',
    '-o', `ControlPath=${controlPath}`,
    '-o', `ControlPersist=${CONTROL_PERSIST}`,
    '-o', 'Compression=yes',
    '-o', 'CompressionLevel=6',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
  ];
}

/**
 * Build SSH command arguments
 * @param {Object} node - Node object
 * @param {string} command - Command to execute
 * @returns {Array<string>} SSH command arguments
 */
function buildSSHCommand(node, command) {
  const args = [
    ...getSSHOptions(node),
    '-p', String(node.ssh_port || 22),
    '-l', node.ssh_user,
  ];

  // Add identity file if using key authentication
  if (!node.ssh_password && node.ssh_key_path) {
    if (fs.existsSync(node.ssh_key_path)) {
      args.push('-i', node.ssh_key_path);
    }
  }

  // Add host
  args.push(node.host);

  // Add command (wrapped in bash -l -c for login shell)
  args.push(`bash -l -c '${command.replace(/'/g, "'\\''")}'`);

  return args;
}

/**
 * Execute command via SSH with ControlMaster
 * @param {Object} node - Node object
 * @param {string} command - Command to execute
 * @param {Object} [options] - Execution options
 * @param {number} [options.timeout=30000] - Command timeout in ms
 * @param {boolean} [options.silent=false] - Suppress errors
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function execute(node, command, options = {}) {
  const timeout = options.timeout || 30000;
  const silent = options.silent || false;

  return new Promise((resolve, reject) => {
    // Handle password-based authentication
    if (node.ssh_password) {
      // sshpass is required for password authentication with native SSH
      const sshpassCheck = spawn('which', ['sshpass']);
      sshpassCheck.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(
            'sshpass not installed. Password authentication requires sshpass. ' +
            'Install with: apt install sshpass'
          ));
        }

        // Execute with sshpass
        // SECURITY: Use -e flag to read password from SSHPASS env var
        // instead of -p which exposes password in process list (ps aux)
        const sshArgs = buildSSHCommand(node, command);
        const proc = spawn('sshpass', [
          '-e',  // Read password from SSHPASS environment variable
          'ssh',
          ...sshArgs
        ], {
          env: {
            ...process.env,
            SSHPASS: node.ssh_password
          }
        });

        executeProcess(proc, timeout, silent, resolve, reject);
      });
    } else {
      // Key-based authentication
      const sshArgs = buildSSHCommand(node, command);
      const proc = spawn('ssh', sshArgs);

      executeProcess(proc, timeout, silent, resolve, reject);
    }
  });
}

/**
 * Handle process execution with timeout
 * @private
 */
function executeProcess(proc, timeout, silent, resolve, reject) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let timedOut = false;
  let resolved = false;

  // Named handlers for proper cleanup
  const onStdoutData = (data) => {
    stdout += data.toString();
  };

  const onStderrData = (data) => {
    stderr += data.toString();
  };

  const cleanup = () => {
    clearTimeout(timeoutHandle);
    // Remove event listeners to prevent memory leaks
    proc.stdout.removeListener('data', onStdoutData);
    proc.stderr.removeListener('data', onStderrData);
    proc.removeListener('close', onClose);
    proc.removeListener('error', onError);
  };

  const onClose = (code) => {
    if (resolved) return;
    resolved = true;
    cleanup();
    exitCode = code;

    if (timedOut) {
      reject(new Error('Command timeout'));
    } else if (exitCode !== 0 && !silent) {
      reject(new Error(`Command failed with exit code ${exitCode}: ${stderr.trim()}`));
    } else {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
      });
    }
  };

  const onError = (err) => {
    if (resolved) return;
    resolved = true;
    cleanup();
    reject(new Error(`SSH process error: ${err.message}`));
  };

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 5000);
  }, timeout);

  proc.stdout.on('data', onStdoutData);
  proc.stderr.on('data', onStderrData);
  proc.on('close', onClose);
  proc.on('error', onError);
}

/**
 * Execute multiple commands in parallel (reuses master connection)
 * @param {Object} node - Node object
 * @param {Array<string>} commands - Commands to execute
 * @param {Object} [options] - Execution options
 * @returns {Promise<Array<{stdout: string, stderr: string, exitCode: number}>>}
 */
async function executeMultiple(node, commands, options = {}) {
  return Promise.all(
    commands.map(cmd => execute(node, cmd, options))
  );
}

/**
 * Execute a script on a node via ControlMaster
 * Uses base64 encoding to safely transmit script content and avoid injection
 * @param {Object} node - Node object
 * @param {string} scriptContent - Script content to execute
 * @param {number} [timeout=60000] - Script timeout in ms
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function executeScript(node, scriptContent, timeout = 60000) {
  // Base64 encode the script to prevent any injection attacks
  const base64Script = Buffer.from(scriptContent, 'utf8').toString('base64');
  // Validate base64 contains only safe characters (A-Z, a-z, 0-9, +, /, =)
  if (!/^[A-Za-z0-9+/=]*$/.test(base64Script)) {
    throw new Error('Invalid base64 encoding');
  }
  // Decode on remote and pipe to bash - use printf for safety
  const command = `printf '%s' '${base64Script}' | base64 -d | bash`;
  return execute(node, command, { timeout: timeout });
}

/**
 * Close SSH ControlMaster connection for a node
 * @param {Object} node - Node object
 * @returns {Promise<void>}
 */
async function closeConnection(node) {
  const controlPath = path.join(
    CONTROL_PATH_DIR,
    `ssh-${node.ssh_user}@${node.host}:${node.ssh_port || 22}`
  );

  return new Promise((resolve) => {
    if (fs.existsSync(controlPath)) {
      const args = [
        '-O', 'exit',
        '-o', `ControlPath=${controlPath}`,
        `${node.ssh_user}@${node.host}`
      ];

      const proc = spawn('ssh', args);
      proc.on('close', () => {
        // Try to remove socket file
        try {
          if (fs.existsSync(controlPath)) {
            fs.unlinkSync(controlPath);
          }
        } catch (err) {
          // Ignore cleanup errors
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Clean up all ControlMaster connections
 * @returns {Promise<void>}
 */
async function cleanup() {
  return new Promise((resolve) => {
    if (fs.existsSync(CONTROL_PATH_DIR)) {
      const files = fs.readdirSync(CONTROL_PATH_DIR);
      const closePromises = files
        .filter(f => f.startsWith('ssh-'))
        .map(f => {
          const socketPath = path.join(CONTROL_PATH_DIR, f);
          return new Promise((res) => {
            try {
              fs.unlinkSync(socketPath);
            } catch (err) {
              // Ignore errors
            }
            res();
          });
        });

      Promise.all(closePromises).then(() => resolve());
    } else {
      resolve();
    }
  });
}

module.exports = {
  execute,
  executeScript,
  executeMultiple,
  closeConnection,
  cleanup,
  getSSHOptions,
};

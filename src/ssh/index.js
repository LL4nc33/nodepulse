const { Client } = require('ssh2');
const fs = require('fs');
const config = require('../config');

// Command timeout in ms (separate from connection timeout)
const COMMAND_TIMEOUT = 30000;

/**
 * Wrap command for login shell execution
 * Non-interactive SSH doesn't load profile, so programs like neofetch aren't found
 * @param {string} command - Command to wrap
 * @returns {string} - Wrapped command
 */
function wrapForLoginShell(command) {
  // Escape single quotes: ' becomes '\''
  const escaped = command.replace(/'/g, "'\\''");
  return `bash -l -c '${escaped}'`;
}

/**
 * Test SSH connection to a node
 * @param {Object} node - Node object with host, ssh_port, ssh_user, ssh_key_path
 * @returns {Promise<{hostname: string}>}
 */
async function testConnection(node) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let resolved = false;
    let commandTimeout = null;

    const cleanup = () => {
      if (commandTimeout) {
        clearTimeout(commandTimeout);
        commandTimeout = null;
      }
      try {
        // Remove all event listeners to prevent memory leaks
        conn.removeAllListeners();
        conn.end();
      } catch (e) {
        // Ignore cleanup errors
      }
    };

    const connectionConfig = {
      host: node.host,
      port: node.ssh_port || 22,
      username: node.ssh_user,
      readyTimeout: config.ssh.connectionTimeout,
      keepaliveInterval: config.ssh.keepaliveInterval,
    };

    // Priority: Password > Key
    if (node.ssh_password) {
      connectionConfig.password = node.ssh_password;
    } else {
      // Use key if specified and exists
      const keyPath = node.ssh_key_path || config.ssh.defaultKeyPath;
      if (keyPath) {
        try {
          if (fs.existsSync(keyPath)) {
            connectionConfig.privateKey = fs.readFileSync(keyPath);
          }
        } catch (err) {
          cleanup();
          return reject(new Error(`SSH Key nicht lesbar: ${err.message}`));
        }
      }
    }

    conn.on('ready', () => {
      // Set command timeout
      commandTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Command timeout'));
        }
      }, COMMAND_TIMEOUT);

      conn.exec(wrapForLoginShell('hostname'), (err, stream) => {
        if (err) {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(err);
          }
          return;
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          // Ignore stderr for hostname command
        });

        stream.on('close', (code) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve({ hostname: output.trim() });
          }
        });

        stream.on('error', (err) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(err);
          }
        });
      });
    });

    conn.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`SSH Verbindung fehlgeschlagen: ${err.message}`));
      }
    });

    conn.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error('SSH Verbindung Timeout'));
      }
    });

    try {
      conn.connect(connectionConfig);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(err);
      }
    }
  });
}

/**
 * Execute a command on a node
 * @param {Object} node - Node object
 * @param {string} command - Command to execute
 * @param {number} [timeout=30000] - Command timeout in ms
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function execute(node, command, timeout = COMMAND_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let resolved = false;
    let commandTimeout = null;

    const cleanup = () => {
      if (commandTimeout) {
        clearTimeout(commandTimeout);
        commandTimeout = null;
      }
      try {
        // Remove all event listeners to prevent memory leaks
        conn.removeAllListeners();
        conn.end();
      } catch (e) {
        // Ignore cleanup errors
      }
    };

    const connectionConfig = {
      host: node.host,
      port: node.ssh_port || 22,
      username: node.ssh_user,
      readyTimeout: config.ssh.connectionTimeout,
      keepaliveInterval: config.ssh.keepaliveInterval,
    };

    // Priority: Password > Key
    if (node.ssh_password) {
      connectionConfig.password = node.ssh_password;
    } else {
      // Use key if specified and exists
      const keyPath = node.ssh_key_path || config.ssh.defaultKeyPath;
      if (keyPath) {
        try {
          if (fs.existsSync(keyPath)) {
            connectionConfig.privateKey = fs.readFileSync(keyPath);
          }
        } catch (err) {
          cleanup();
          return reject(new Error(`SSH Key nicht lesbar: ${err.message}`));
        }
      }
    }

    conn.on('ready', () => {
      // Set command timeout
      commandTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Command timeout'));
        }
      }, timeout);

      conn.exec(wrapForLoginShell(command), (err, stream) => {
        if (err) {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(err);
          }
          return;
        }

        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        stream.on('close', (code) => {
          exitCode = code;
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode,
            });
          }
        });

        stream.on('error', (err) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(err);
          }
        });
      });
    });

    conn.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`SSH Verbindung fehlgeschlagen: ${err.message}`));
      }
    });

    conn.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error('SSH Verbindung Timeout'));
      }
    });

    try {
      conn.connect(connectionConfig);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(err);
      }
    }
  });
}

/**
 * Execute a script on a node (send script content via stdin)
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
  return execute(node, command, timeout);
}

// SSH ControlMaster for performance-critical operations
const controlMaster = require('./control-master');

module.exports = {
  testConnection,
  execute,
  executeScript,
  COMMAND_TIMEOUT,
  controlMaster, // High-performance SSH with connection pooling
};

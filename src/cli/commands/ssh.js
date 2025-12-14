/**
 * nodepulse CLI - ssh command
 * Open SSH connection to node
 */

var utils = require('../utils');
var spawn = require('child_process').spawn;

/**
 * Print SSH help
 */
function printHelp() {
  console.log('');
  console.log(utils.colorize('np ssh', 'bold') + ' - Open SSH connection to node');
  console.log('');
  console.log(utils.colorize('Usage:', 'bold'));
  console.log('  np ssh <node> [options]');
  console.log('');
  console.log(utils.colorize('Options:', 'bold'));
  console.log('  -p, --port    Override SSH port');
  console.log('  -u, --user    Override SSH user');
  console.log('  -i, --identity SSH key file');
  console.log('');
  console.log(utils.colorize('Examples:', 'bold'));
  console.log('  np ssh myserver');
  console.log('  np ssh myserver -u admin');
  console.log('  np ssh myserver -p 2222');
  console.log('');
}

/**
 * Open SSH connection
 * @param {string} nodeName
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function openSSH(nodeName, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes', null, apiOptions)
    .then(function(response) {
      var nodes = response.data || [];
      var node = nodes.find(function(n) {
        return n.name === nodeName;
      });

      if (!node) {
        utils.printError('Node not found: ' + nodeName);
        return 1;
      }

      // Build SSH command
      var sshArgs = [];

      // User
      var user = flags.u || flags.user || node.ssh_user || 'root';

      // Port
      var port = flags.p || flags.port || node.ssh_port || 22;
      sshArgs.push('-p', String(port));

      // Identity file
      if (flags.i || flags.identity) {
        sshArgs.push('-i', flags.i || flags.identity);
      } else if (node.ssh_key_path) {
        sshArgs.push('-i', node.ssh_key_path);
      }

      // Target
      sshArgs.push(user + '@' + node.host);

      utils.printInfo('Connecting to ' + node.name + ' (' + user + '@' + node.host + ':' + port + ')...');
      console.log('');

      // Spawn SSH
      return new Promise(function(resolve) {
        var ssh = spawn('ssh', sshArgs, {
          stdio: 'inherit',
          shell: false,
        });

        ssh.on('close', function(code) {
          if (code !== 0) {
            utils.printError('SSH exited with code ' + code);
          }
          resolve(code || 0);
        });

        ssh.on('error', function(err) {
          utils.printError('Failed to start SSH: ' + err.message);
          resolve(1);
        });
      });
    });
}

/**
 * Main SSH command handler
 * @param {Object} parsed - Parsed arguments
 * @param {Object} apiOptions - API options
 */
function sshCommand(parsed, apiOptions) {
  var flags = parsed.flags;

  // Handle help
  if (flags.h || flags.help) {
    printHelp();
    return Promise.resolve(0);
  }

  // Need node name
  if (!parsed.subcommand) {
    utils.printError('Node name required');
    console.log('Usage: np ssh <node>');
    return Promise.resolve(1);
  }

  return openSSH(parsed.subcommand, flags, apiOptions);
}

module.exports = sshCommand;

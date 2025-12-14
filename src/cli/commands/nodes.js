/**
 * nodepulse CLI - nodes command
 * List and manage nodes
 */

var utils = require('../utils');

/**
 * Print nodes help
 */
function printHelp() {
  console.log('');
  console.log(utils.colorize('np nodes', 'bold') + ' - List and manage nodes');
  console.log('');
  console.log(utils.colorize('Usage:', 'bold'));
  console.log('  np nodes [subcommand] [options]');
  console.log('');
  console.log(utils.colorize('Subcommands:', 'bold'));
  console.log('  list          List all nodes (default)');
  console.log('  show <name>   Show node details');
  console.log('  test <name>   Test SSH connection');
  console.log('  discover <name>  Run discovery on node');
  console.log('');
  console.log(utils.colorize('Options:', 'bold'));
  console.log('  -t, --type    Filter by node type');
  console.log('  --tag         Filter by tag');
  console.log('  --online      Show only online nodes');
  console.log('  --offline     Show only offline nodes');
  console.log('  -q, --quiet   Show only node names');
  console.log('');
  console.log(utils.colorize('Examples:', 'bold'));
  console.log('  np nodes');
  console.log('  np nodes -t docker-host');
  console.log('  np nodes --online');
  console.log('  np nodes show myserver');
  console.log('  np nodes test myserver');
  console.log('');
}

/**
 * List nodes
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listNodes(flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes', null, apiOptions)
    .then(function(response) {
      var nodes = response.data || [];

      // Apply filters
      if (flags.type || flags.t) {
        var filterType = flags.type || flags.t;
        nodes = nodes.filter(function(n) {
          return n.node_type === filterType;
        });
      }

      if (flags.online) {
        nodes = nodes.filter(function(n) {
          return n.online === 1;
        });
      }

      if (flags.offline) {
        nodes = nodes.filter(function(n) {
          return n.online === 0;
        });
      }

      if (nodes.length === 0) {
        utils.printInfo('No nodes found.');
        return 0;
      }

      // Quiet mode - just names
      if (flags.q || flags.quiet) {
        nodes.forEach(function(node) {
          console.log(node.name);
        });
        return 0;
      }

      // Table output
      var headers = ['NAME', 'HOST', 'TYPE', 'STATUS'];
      var rows = nodes.map(function(node) {
        var status = node.online ?
          utils.colorize('online', 'green') :
          utils.colorize('offline', 'red');

        return [
          node.name,
          node.host,
          node.node_type || '-',
          status,
        ];
      });

      utils.printTable(headers, rows);
      console.log('');
      console.log(utils.colorize(nodes.length + ' node(s)', 'gray'));

      return 0;
    });
}

/**
 * Show node details
 * @param {string} nodeName
 * @param {Object} apiOptions
 */
function showNode(nodeName, apiOptions) {
  // First get node by name
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

      // Get full node details
      return utils.apiRequest('GET', '/nodes/' + node.id, null, apiOptions)
        .then(function(detailResponse) {
          var detail = detailResponse.data;

          console.log('');
          console.log(utils.colorize('Node: ' + detail.name, 'bold'));
          console.log(utils.colorize('─'.repeat(40), 'gray'));
          console.log('');

          console.log(utils.colorize('Connection:', 'bold'));
          console.log('  Host:      ' + detail.host);
          console.log('  SSH Port:  ' + detail.ssh_port);
          console.log('  SSH User:  ' + detail.ssh_user);
          console.log('  Status:    ' + (detail.online ?
            utils.colorize('online', 'green') :
            utils.colorize('offline', 'red')));
          console.log('');

          console.log(utils.colorize('Classification:', 'bold'));
          console.log('  Type:      ' + (detail.node_type || '-'));
          console.log('');

          if (detail.last_seen) {
            console.log(utils.colorize('Activity:', 'bold'));
            console.log('  Last Seen: ' + detail.last_seen);
            if (detail.last_error) {
              console.log('  Last Error: ' + utils.colorize(detail.last_error, 'red'));
            }
            console.log('');
          }

          if (detail.notes) {
            console.log(utils.colorize('Notes:', 'bold'));
            console.log('  ' + detail.notes);
            console.log('');
          }

          return 0;
        });
    });
}

/**
 * Test SSH connection
 * @param {string} nodeName
 * @param {Object} apiOptions
 */
function testNode(nodeName, apiOptions) {
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

      utils.printInfo('Testing connection to ' + nodeName + '...');

      return utils.apiRequest('POST', '/nodes/' + node.id + '/test', null, apiOptions)
        .then(function(testResponse) {
          utils.printSuccess('Connection successful!');
          console.log('  Hostname: ' + testResponse.data.hostname);
          return 0;
        })
        .catch(function(err) {
          utils.printError('Connection failed: ' + (err.error ? err.error.message : 'Unknown error'));
          return 1;
        });
    });
}

/**
 * Run discovery on node
 * @param {string} nodeName
 * @param {Object} apiOptions
 */
function discoverNode(nodeName, apiOptions) {
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

      utils.printInfo('Running discovery on ' + nodeName + '...');

      return utils.apiRequest('POST', '/nodes/' + node.id + '/discover', null, apiOptions)
        .then(function(discoverResponse) {
          var data = discoverResponse.data;

          utils.printSuccess('Discovery completed!');
          console.log('');

          if (data.discovery) {
            console.log(utils.colorize('Discovery Results:', 'bold'));
            console.log('  Hostname:     ' + (data.discovery.hostname || '-'));
            console.log('  OS:           ' + (data.discovery.os_name || '-'));
            console.log('  Architecture: ' + (data.discovery.arch || '-'));
            console.log('  Docker:       ' + (data.discovery.has_docker ? 'Yes' : 'No'));
            console.log('  Proxmox:      ' + (data.discovery.is_proxmox_host ? 'Yes' : 'No'));

            if (data.discovery.is_raspberry_pi) {
              console.log('  Raspberry Pi: ' + data.discovery.raspberry_pi_model);
            }
          }

          if (data.nodeType) {
            console.log('');
            console.log('  Detected Type: ' + utils.colorize(data.nodeType, 'cyan'));
          }

          if (data.tags && data.tags.length > 0) {
            console.log('  Tags: ' + data.tags.join(', '));
          }

          return 0;
        });
    });
}

/**
 * Main nodes command handler
 * @param {Object} parsed - Parsed arguments
 * @param {Object} apiOptions - API options
 */
function nodesCommand(parsed, apiOptions) {
  var subcommand = parsed.subcommand || 'list';
  var flags = parsed.flags;

  // Handle help
  if (flags.h || flags.help) {
    printHelp();
    return Promise.resolve(0);
  }

  switch (subcommand) {
    case 'list':
      return listNodes(flags, apiOptions);

    case 'show':
    case 'get':
    case 'info':
      if (!parsed.args[0]) {
        utils.printError('Node name required');
        console.log('Usage: np nodes show <name>');
        return Promise.resolve(1);
      }
      return showNode(parsed.args[0], apiOptions);

    case 'test':
      if (!parsed.args[0]) {
        utils.printError('Node name required');
        console.log('Usage: np nodes test <name>');
        return Promise.resolve(1);
      }
      return testNode(parsed.args[0], apiOptions);

    case 'discover':
      if (!parsed.args[0]) {
        utils.printError('Node name required');
        console.log('Usage: np nodes discover <name>');
        return Promise.resolve(1);
      }
      return discoverNode(parsed.args[0], apiOptions);

    default:
      // Assume subcommand is node name for show
      return showNode(subcommand, apiOptions);
  }
}

module.exports = nodesCommand;

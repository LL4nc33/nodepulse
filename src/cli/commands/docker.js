/**
 * nodepulse CLI - docker command
 * Docker management commands
 */

var utils = require('../utils');

/**
 * Print docker help
 */
function printHelp() {
  console.log('');
  console.log(utils.colorize('np docker', 'bold') + ' - Docker management commands');
  console.log('');
  console.log(utils.colorize('Usage:', 'bold'));
  console.log('  np docker <node> <subcommand> [options]');
  console.log('');
  console.log(utils.colorize('Subcommands:', 'bold'));
  console.log('  ps             List containers');
  console.log('  images         List images');
  console.log('  volumes        List volumes');
  console.log('  networks       List networks');
  console.log('  start <id>     Start container');
  console.log('  stop <id>      Stop container');
  console.log('  restart <id>   Restart container');
  console.log('  logs <id>      Show container logs');
  console.log('  refresh        Refresh Docker data');
  console.log('');
  console.log(utils.colorize('Options:', 'bold'));
  console.log('  -a, --all      Show all containers (not just running)');
  console.log('  -n, --lines    Number of log lines (default: 100)');
  console.log('  -q, --quiet    Quiet output');
  console.log('');
  console.log(utils.colorize('Examples:', 'bold'));
  console.log('  np docker myserver ps');
  console.log('  np docker myserver ps -a');
  console.log('  np docker myserver logs mycontainer');
  console.log('  np docker myserver restart mycontainer');
  console.log('');
}

/**
 * Get node by name
 * @param {string} nodeName
 * @param {Object} apiOptions
 */
function getNode(nodeName, apiOptions) {
  return utils.apiRequest('GET', '/nodes', null, apiOptions)
    .then(function(response) {
      var nodes = response.data || [];
      var node = nodes.find(function(n) {
        return n.name === nodeName;
      });

      if (!node) {
        return Promise.reject({ error: { message: 'Node not found: ' + nodeName } });
      }

      return node;
    });
}

/**
 * List containers
 * @param {number} nodeId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listContainers(nodeId, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes/' + nodeId + '/docker/containers', null, apiOptions)
    .then(function(response) {
      var containers = response.data || [];

      // Filter running by default
      if (!flags.a && !flags.all) {
        containers = containers.filter(function(c) {
          return c.state === 'running';
        });
      }

      if (containers.length === 0) {
        utils.printInfo('No containers found.');
        return 0;
      }

      // Quiet mode
      if (flags.q || flags.quiet) {
        containers.forEach(function(c) {
          console.log(c.container_id.substring(0, 12));
        });
        return 0;
      }

      var headers = ['CONTAINER ID', 'NAME', 'IMAGE', 'STATUS', 'STATE'];
      var rows = containers.map(function(c) {
        var stateColor = c.state === 'running' ? 'green' :
          c.state === 'exited' ? 'red' :
          c.state === 'paused' ? 'yellow' : 'gray';

        return [
          c.container_id.substring(0, 12),
          c.name || '-',
          c.image || '-',
          c.status || '-',
          utils.colorize(c.state || '-', stateColor),
        ];
      });

      utils.printTable(headers, rows);
      return 0;
    });
}

/**
 * List images
 * @param {number} nodeId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listImages(nodeId, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes/' + nodeId + '/docker/images', null, apiOptions)
    .then(function(response) {
      var images = response.data || [];

      if (images.length === 0) {
        utils.printInfo('No images found.');
        return 0;
      }

      if (flags.q || flags.quiet) {
        images.forEach(function(i) {
          console.log(i.image_id.substring(0, 12));
        });
        return 0;
      }

      var headers = ['IMAGE ID', 'REPOSITORY', 'TAG', 'SIZE'];
      var rows = images.map(function(i) {
        return [
          i.image_id.substring(0, 12),
          i.repository || '<none>',
          i.tag || '<none>',
          utils.formatBytes(i.size_bytes),
        ];
      });

      utils.printTable(headers, rows);
      return 0;
    });
}

/**
 * List volumes
 * @param {number} nodeId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listVolumes(nodeId, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes/' + nodeId + '/docker/volumes', null, apiOptions)
    .then(function(response) {
      var volumes = response.data || [];

      if (volumes.length === 0) {
        utils.printInfo('No volumes found.');
        return 0;
      }

      if (flags.q || flags.quiet) {
        volumes.forEach(function(v) {
          console.log(v.name);
        });
        return 0;
      }

      var headers = ['NAME', 'DRIVER', 'IN USE'];
      var rows = volumes.map(function(v) {
        return [
          v.name.length > 30 ? v.name.substring(0, 27) + '...' : v.name,
          v.driver || '-',
          v.in_use ? utils.colorize('yes', 'green') : utils.colorize('no', 'gray'),
        ];
      });

      utils.printTable(headers, rows);
      return 0;
    });
}

/**
 * List networks
 * @param {number} nodeId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listNetworks(nodeId, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes/' + nodeId + '/docker/networks', null, apiOptions)
    .then(function(response) {
      var networks = response.data || [];

      if (networks.length === 0) {
        utils.printInfo('No networks found.');
        return 0;
      }

      if (flags.q || flags.quiet) {
        networks.forEach(function(n) {
          console.log(n.name);
        });
        return 0;
      }

      var headers = ['NETWORK ID', 'NAME', 'DRIVER', 'SCOPE'];
      var rows = networks.map(function(n) {
        return [
          n.network_id.substring(0, 12),
          n.name || '-',
          n.driver || '-',
          n.scope || '-',
        ];
      });

      utils.printTable(headers, rows);
      return 0;
    });
}

/**
 * Container action
 * @param {number} nodeId
 * @param {string} containerId
 * @param {string} action
 * @param {Object} apiOptions
 */
function containerAction(nodeId, containerId, action, apiOptions) {
  utils.printInfo(action.charAt(0).toUpperCase() + action.slice(1) + 'ing container ' + containerId + '...');

  return utils.apiRequest('POST', '/nodes/' + nodeId + '/docker/containers/' + containerId + '/' + action, null, apiOptions)
    .then(function() {
      utils.printSuccess('Container ' + action + ' successful');
      return 0;
    });
}

/**
 * Show container logs
 * @param {number} nodeId
 * @param {string} containerId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function showLogs(nodeId, containerId, flags, apiOptions) {
  var lines = flags.n || flags.lines || 100;

  return utils.apiRequest('GET', '/nodes/' + nodeId + '/docker/containers/' + containerId + '/logs?tail=' + lines, null, apiOptions)
    .then(function(response) {
      var logs = response.data && response.data.logs;

      if (logs) {
        console.log(logs);
      } else {
        utils.printInfo('No logs available.');
      }

      return 0;
    });
}

/**
 * Refresh Docker data
 * @param {number} nodeId
 * @param {Object} apiOptions
 */
function refreshDocker(nodeId, apiOptions) {
  utils.printInfo('Refreshing Docker data...');

  return utils.apiRequest('POST', '/nodes/' + nodeId + '/docker', null, apiOptions)
    .then(function(response) {
      var summary = response.data && response.data.summary;

      utils.printSuccess('Docker data refreshed');

      if (summary) {
        console.log('');
        console.log('  Containers: ' + (summary.containers || 0));
        console.log('  Running:    ' + (summary.running || 0));
        console.log('  Images:     ' + (summary.images || 0));
        console.log('  Volumes:    ' + (summary.volumes || 0));
        console.log('  Networks:   ' + (summary.networks || 0));
      }

      return 0;
    });
}

/**
 * Main docker command handler
 * @param {Object} parsed - Parsed arguments
 * @param {Object} apiOptions - API options
 */
function dockerCommand(parsed, apiOptions) {
  var flags = parsed.flags;

  // Handle help
  if (flags.h || flags.help) {
    printHelp();
    return Promise.resolve(0);
  }

  // Need node name
  if (!parsed.subcommand) {
    utils.printError('Node name required');
    printHelp();
    return Promise.resolve(1);
  }

  var nodeName = parsed.subcommand;
  var subcommand = parsed.args[0] || 'ps';
  var arg = parsed.args[1];

  return getNode(nodeName, apiOptions)
    .then(function(node) {
      switch (subcommand) {
        case 'ps':
        case 'containers':
          return listContainers(node.id, flags, apiOptions);

        case 'images':
          return listImages(node.id, flags, apiOptions);

        case 'volumes':
          return listVolumes(node.id, flags, apiOptions);

        case 'networks':
          return listNetworks(node.id, flags, apiOptions);

        case 'start':
        case 'stop':
        case 'restart':
        case 'pause':
        case 'unpause':
          if (!arg) {
            utils.printError('Container ID required');
            return 1;
          }
          return containerAction(node.id, arg, subcommand, apiOptions);

        case 'logs':
          if (!arg) {
            utils.printError('Container ID required');
            return 1;
          }
          return showLogs(node.id, arg, flags, apiOptions);

        case 'refresh':
          return refreshDocker(node.id, apiOptions);

        default:
          utils.printError('Unknown subcommand: ' + subcommand);
          printHelp();
          return 1;
      }
    });
}

module.exports = dockerCommand;

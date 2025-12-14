/**
 * nodepulse CLI - exec command
 * Execute commands on nodes
 */

var utils = require('../utils');

/**
 * Print exec help
 */
function printHelp() {
  console.log('');
  console.log(utils.colorize('np exec', 'bold') + ' - Execute command on nodes');
  console.log('');
  console.log(utils.colorize('Usage:', 'bold'));
  console.log('  np exec <node> "<command>"');
  console.log('  np exec -t <type> "<command>"');
  console.log('  np exec --tag <tag> "<command>"');
  console.log('');
  console.log(utils.colorize('Options:', 'bold'));
  console.log('  -t, --type    Execute on all nodes of type');
  console.log('  --tag         Execute on all nodes with tag');
  console.log('  --all         Execute on all nodes');
  console.log('  --timeout     Command timeout in seconds (default: 120)');
  console.log('  -q, --quiet   Suppress status messages');
  console.log('');
  console.log(utils.colorize('Examples:', 'bold'));
  console.log('  np exec myserver "df -h"');
  console.log('  np exec myserver "uptime"');
  console.log('  np exec -t docker-host "docker ps"');
  console.log('  np exec --all "hostname"');
  console.log('');
}

/**
 * Execute command on single node
 * @param {string} nodeName
 * @param {string} command
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function execOnNode(nodeName, command, flags, apiOptions) {
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

      if (!flags.quiet && !flags.q) {
        utils.printInfo('Executing on ' + nodeName + '...');
      }

      return utils.apiRequest('POST', '/nodes/' + node.id + '/commands', {
        command: command,
      }, apiOptions)
        .then(function(execResponse) {
          var result = execResponse.data;

          if (!flags.quiet && !flags.q) {
            console.log('');
          }

          // Print output
          if (result.output) {
            console.log(result.output);
          }

          if (result.error) {
            console.error(utils.colorize(result.error, 'red'));
          }

          if (!flags.quiet && !flags.q) {
            console.log('');
            var statusText = result.status === 'success' ?
              utils.colorize('Success', 'green') :
              utils.colorize('Failed', 'red');
            console.log(statusText + ' (exit code: ' + result.exitCode + ')');
          }

          return result.status === 'success' ? 0 : 1;
        });
    });
}

/**
 * Execute command on multiple nodes
 * @param {Array} nodes
 * @param {string} command
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function execOnMultiple(nodes, command, flags, apiOptions) {
  if (!flags.quiet && !flags.q) {
    utils.printInfo('Executing on ' + nodes.length + ' node(s)...');
    console.log('');
  }

  var results = [];
  var executeSequentially = function(index) {
    if (index >= nodes.length) {
      return Promise.resolve();
    }

    var node = nodes[index];

    console.log(utils.colorize('─'.repeat(60), 'gray'));
    console.log(utils.colorize('Node: ' + node.name, 'bold'));
    console.log('');

    return utils.apiRequest('POST', '/nodes/' + node.id + '/commands', {
      command: command,
    }, apiOptions)
      .then(function(execResponse) {
        var result = execResponse.data;
        results.push({
          node: node.name,
          status: result.status,
          exitCode: result.exitCode,
        });

        if (result.output) {
          console.log(result.output);
        }

        if (result.error) {
          console.error(utils.colorize(result.error, 'red'));
        }

        console.log('');
        var statusText = result.status === 'success' ?
          utils.colorize('✓', 'green') :
          utils.colorize('✗', 'red');
        console.log(statusText + ' Exit: ' + result.exitCode);
        console.log('');

        return executeSequentially(index + 1);
      })
      .catch(function(err) {
        results.push({
          node: node.name,
          status: 'failed',
          exitCode: -1,
          error: err.error ? err.error.message : 'Unknown error',
        });

        console.log(utils.colorize('Error: ' + (err.error ? err.error.message : 'Unknown'), 'red'));
        console.log('');

        return executeSequentially(index + 1);
      });
  };

  return executeSequentially(0).then(function() {
    // Summary
    console.log(utils.colorize('═'.repeat(60), 'gray'));
    console.log(utils.colorize('Summary:', 'bold'));
    console.log('');

    var success = results.filter(function(r) { return r.status === 'success'; }).length;
    var failed = results.length - success;

    console.log('  Total:   ' + results.length);
    console.log('  Success: ' + utils.colorize(String(success), success > 0 ? 'green' : 'gray'));
    console.log('  Failed:  ' + utils.colorize(String(failed), failed > 0 ? 'red' : 'gray'));
    console.log('');

    return failed > 0 ? 1 : 0;
  });
}

/**
 * Main exec command handler
 * @param {Object} parsed - Parsed arguments
 * @param {Object} apiOptions - API options
 */
function execCommand(parsed, apiOptions) {
  var flags = parsed.flags;

  // Handle help
  if (flags.h || flags.help) {
    printHelp();
    return Promise.resolve(0);
  }

  // Multi-node by type
  if (flags.t || flags.type) {
    var filterType = flags.t || flags.type;
    var command = parsed.subcommand;

    if (!command) {
      utils.printError('Command required');
      console.log('Usage: np exec -t <type> "<command>"');
      return Promise.resolve(1);
    }

    return utils.apiRequest('GET', '/nodes', null, apiOptions)
      .then(function(response) {
        var nodes = (response.data || []).filter(function(n) {
          return n.node_type === filterType && n.online;
        });

        if (nodes.length === 0) {
          utils.printError('No online nodes found with type: ' + filterType);
          return 1;
        }

        return execOnMultiple(nodes, command, flags, apiOptions);
      });
  }

  // Multi-node by tag
  if (flags.tag) {
    var tagName = flags.tag;
    var tagCommand = parsed.subcommand;

    if (!tagCommand) {
      utils.printError('Command required');
      console.log('Usage: np exec --tag <tag> "<command>"');
      return Promise.resolve(1);
    }

    // Note: Would need tag filtering API - for now just execute on all
    utils.printWarning('Tag filtering not yet implemented');
    return Promise.resolve(1);
  }

  // All nodes
  if (flags.all) {
    var allCommand = parsed.subcommand;

    if (!allCommand) {
      utils.printError('Command required');
      console.log('Usage: np exec --all "<command>"');
      return Promise.resolve(1);
    }

    return utils.apiRequest('GET', '/nodes', null, apiOptions)
      .then(function(response) {
        var nodes = (response.data || []).filter(function(n) {
          return n.online;
        });

        if (nodes.length === 0) {
          utils.printError('No online nodes found');
          return 1;
        }

        return execOnMultiple(nodes, allCommand, flags, apiOptions);
      });
  }

  // Single node
  if (!parsed.subcommand) {
    utils.printError('Node name or option required');
    printHelp();
    return Promise.resolve(1);
  }

  var nodeName = parsed.subcommand;
  var nodeCommand = parsed.args[0];

  if (!nodeCommand) {
    utils.printError('Command required');
    console.log('Usage: np exec <node> "<command>"');
    return Promise.resolve(1);
  }

  return execOnNode(nodeName, nodeCommand, flags, apiOptions);
}

module.exports = execCommand;

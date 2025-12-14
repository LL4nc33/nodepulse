/**
 * nodepulse CLI - status command
 * Show monitoring status overview
 */

var utils = require('../utils');

/**
 * Print status help
 */
function printHelp() {
  console.log('');
  console.log(utils.colorize('np status', 'bold') + ' - Show monitoring status');
  console.log('');
  console.log(utils.colorize('Usage:', 'bold'));
  console.log('  np status [node] [options]');
  console.log('');
  console.log(utils.colorize('Options:', 'bold'));
  console.log('  -t, --type    Filter by node type');
  console.log('  --tag         Filter by tag');
  console.log('  --compact     Compact output');
  console.log('  -q, --quiet   Minimal output');
  console.log('');
  console.log(utils.colorize('Examples:', 'bold'));
  console.log('  np status                 All nodes');
  console.log('  np status myserver        Single node');
  console.log('  np status -t docker-host  Docker hosts only');
  console.log('  np status --compact       Compact view');
  console.log('');
}

/**
 * Get status color based on value and thresholds
 * @param {number} value
 * @param {number} warning
 * @param {number} critical
 * @returns {string}
 */
function getStatusColor(value, warning, critical) {
  if (value === null || value === undefined) return 'gray';
  if (value >= critical) return 'red';
  if (value >= warning) return 'yellow';
  return 'green';
}

/**
 * Format status value with color
 * @param {number} value
 * @param {number} warning
 * @param {number} critical
 * @returns {string}
 */
function formatStatusValue(value, warning, critical) {
  if (value === null || value === undefined) return utils.colorize('-', 'gray');
  var color = getStatusColor(value, warning, critical);
  return utils.colorize(value.toFixed(1) + '%', color);
}

/**
 * Show status overview
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function showOverview(flags, apiOptions) {
  return utils.apiRequest('GET', '/stats', null, apiOptions)
    .then(function(response) {
      var data = response.data || {};
      var nodesWithStats = data.nodes || [];

      // Apply filters
      if (flags.type || flags.t) {
        var filterType = flags.type || flags.t;
        nodesWithStats = nodesWithStats.filter(function(n) {
          return n.node_type === filterType;
        });
      }

      if (nodesWithStats.length === 0) {
        utils.printInfo('No nodes with stats found.');
        return 0;
      }

      // Quiet mode
      if (flags.q || flags.quiet) {
        nodesWithStats.forEach(function(node) {
          var status = node.online ? 'online' : 'offline';
          console.log(node.name + '\t' + status);
        });
        return 0;
      }

      // Compact mode
      if (flags.compact) {
        nodesWithStats.forEach(function(node) {
          var status = node.online ?
            utils.colorize('●', 'green') :
            utils.colorize('●', 'red');

          var cpu = node.stats && node.stats.cpu_percent !== null ?
            utils.formatPercent(node.stats.cpu_percent) : '-';
          var ram = node.stats && node.stats.ram_percent !== null ?
            utils.formatPercent(node.stats.ram_percent) : '-';
          var disk = node.stats && node.stats.disk_percent !== null ?
            utils.formatPercent(node.stats.disk_percent) : '-';

          console.log(status + ' ' + node.name + '\tCPU: ' + cpu + '\tRAM: ' + ram + '\tDisk: ' + disk);
        });
        return 0;
      }

      // Full table output
      console.log('');
      console.log(utils.colorize('Monitoring Status', 'bold'));
      console.log('');

      var headers = ['NODE', 'STATUS', 'CPU', 'RAM', 'DISK', 'TEMP', 'UPTIME'];
      var rows = nodesWithStats.map(function(node) {
        var online = node.online ?
          utils.colorize('online', 'green') :
          utils.colorize('offline', 'red');

        if (!node.stats || !node.online) {
          return [
            node.name,
            online,
            utils.colorize('-', 'gray'),
            utils.colorize('-', 'gray'),
            utils.colorize('-', 'gray'),
            utils.colorize('-', 'gray'),
            utils.colorize('-', 'gray'),
          ];
        }

        var stats = node.stats;

        return [
          node.name,
          online,
          formatStatusValue(stats.cpu_percent, 80, 95),
          formatStatusValue(stats.ram_percent, 85, 95),
          formatStatusValue(stats.disk_percent, 80, 95),
          stats.temp_cpu ? stats.temp_cpu.toFixed(1) + '°C' : '-',
          utils.formatUptime(stats.uptime_seconds),
        ];
      });

      utils.printTable(headers, rows);

      // Summary
      var online = nodesWithStats.filter(function(n) { return n.online; }).length;
      var offline = nodesWithStats.length - online;

      console.log('');
      console.log(utils.colorize('Summary:', 'bold') + ' ' +
        utils.colorize(online + ' online', 'green') + ', ' +
        (offline > 0 ? utils.colorize(offline + ' offline', 'red') : offline + ' offline'));

      return 0;
    });
}

/**
 * Show single node status
 * @param {string} nodeName
 * @param {Object} apiOptions
 */
function showNodeStatus(nodeName, apiOptions) {
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

      return utils.apiRequest('GET', '/nodes/' + node.id + '/stats', null, apiOptions)
        .then(function(statsResponse) {
          var stats = statsResponse.data;

          console.log('');
          console.log(utils.colorize('Status: ' + nodeName, 'bold'));
          console.log(utils.colorize('─'.repeat(40), 'gray'));
          console.log('');

          if (!node.online) {
            console.log(utils.colorize('Node is OFFLINE', 'red'));
            return 0;
          }

          if (!stats) {
            utils.printWarning('No stats available');
            return 0;
          }

          // CPU
          console.log(utils.colorize('CPU:', 'bold'));
          console.log('  Usage:    ' + formatStatusValue(stats.cpu_percent, 80, 95));
          console.log('  Load:     ' + stats.load_1m + ' / ' + stats.load_5m + ' / ' + stats.load_15m);
          console.log('');

          // Memory
          console.log(utils.colorize('Memory:', 'bold'));
          console.log('  Used:     ' + formatStatusValue(stats.ram_percent, 85, 95));
          console.log('  Total:    ' + utils.formatBytes(stats.ram_total_bytes));
          console.log('  Used:     ' + utils.formatBytes(stats.ram_used_bytes));
          console.log('  Available:' + utils.formatBytes(stats.ram_available_bytes));
          if (stats.swap_total_bytes > 0) {
            console.log('  Swap:     ' + utils.formatBytes(stats.swap_used_bytes) + ' / ' +
              utils.formatBytes(stats.swap_total_bytes));
          }
          console.log('');

          // Disk
          console.log(utils.colorize('Disk (/):', 'bold'));
          console.log('  Used:     ' + formatStatusValue(stats.disk_percent, 80, 95));
          console.log('  Total:    ' + utils.formatBytes(stats.disk_total_bytes));
          console.log('  Used:     ' + utils.formatBytes(stats.disk_used_bytes));
          console.log('  Available:' + utils.formatBytes(stats.disk_available_bytes));
          console.log('');

          // System
          console.log(utils.colorize('System:', 'bold'));
          if (stats.temp_cpu !== null) {
            var tempColor = getStatusColor(stats.temp_cpu, 70, 85);
            console.log('  Temp:     ' + utils.colorize(stats.temp_cpu.toFixed(1) + '°C', tempColor));
          }
          console.log('  Uptime:   ' + utils.formatUptime(stats.uptime_seconds));
          console.log('  Processes:' + stats.processes);
          console.log('');

          // Network
          console.log(utils.colorize('Network:', 'bold'));
          console.log('  RX:       ' + utils.formatBytes(stats.net_rx_bytes));
          console.log('  TX:       ' + utils.formatBytes(stats.net_tx_bytes));
          console.log('');

          return 0;
        });
    });
}

/**
 * Main status command handler
 * @param {Object} parsed - Parsed arguments
 * @param {Object} apiOptions - API options
 */
function statusCommand(parsed, apiOptions) {
  var flags = parsed.flags;

  // Handle help
  if (flags.h || flags.help) {
    printHelp();
    return Promise.resolve(0);
  }

  // Single node
  if (parsed.subcommand) {
    return showNodeStatus(parsed.subcommand, apiOptions);
  }

  // Overview
  return showOverview(flags, apiOptions);
}

module.exports = statusCommand;

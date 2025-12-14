/**
 * nodepulse CLI - pve command
 * Proxmox management commands
 */

var utils = require('../utils');

/**
 * Print pve help
 */
function printHelp() {
  console.log('');
  console.log(utils.colorize('np pve', 'bold') + ' - Proxmox management commands');
  console.log('');
  console.log(utils.colorize('Usage:', 'bold'));
  console.log('  np pve <node> <subcommand> [options]');
  console.log('');
  console.log(utils.colorize('Subcommands:', 'bold'));
  console.log('  vms            List VMs');
  console.log('  cts            List containers');
  console.log('  storage        List storage');
  console.log('  snapshots      List snapshots');
  console.log('  start <vmid>   Start VM/CT');
  console.log('  stop <vmid>    Stop VM/CT');
  console.log('  shutdown <vmid> Graceful shutdown');
  console.log('  reboot <vmid>  Reboot VM/CT');
  console.log('  refresh        Refresh Proxmox data');
  console.log('');
  console.log(utils.colorize('Options:', 'bold'));
  console.log('  --vm           Operate on VM (default)');
  console.log('  --ct           Operate on container');
  console.log('  -q, --quiet    Quiet output');
  console.log('');
  console.log(utils.colorize('Examples:', 'bold'));
  console.log('  np pve myserver vms');
  console.log('  np pve myserver cts');
  console.log('  np pve myserver start 100 --vm');
  console.log('  np pve myserver stop 101 --ct');
  console.log('  np pve myserver snapshots');
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
 * List VMs
 * @param {number} nodeId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listVMs(nodeId, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes/' + nodeId + '/proxmox/vms', null, apiOptions)
    .then(function(response) {
      var vms = response.data || [];

      if (vms.length === 0) {
        utils.printInfo('No VMs found.');
        return 0;
      }

      if (flags.q || flags.quiet) {
        vms.forEach(function(vm) {
          console.log(vm.vmid);
        });
        return 0;
      }

      var headers = ['VMID', 'NAME', 'STATUS', 'CPU', 'MEMORY', 'DISK'];
      var rows = vms.map(function(vm) {
        var statusColor = vm.status === 'running' ? 'green' :
          vm.status === 'stopped' ? 'red' : 'gray';

        var name = vm.name || '-';
        if (vm.template) {
          name += utils.colorize(' [template]', 'cyan');
        }

        return [
          vm.vmid,
          name,
          utils.colorize(vm.status || '-', statusColor),
          vm.cpu_cores || '-',
          utils.formatBytes(vm.memory_bytes),
          utils.formatBytes(vm.disk_bytes),
        ];
      });

      utils.printTable(headers, rows);
      return 0;
    });
}

/**
 * List CTs
 * @param {number} nodeId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listCTs(nodeId, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes/' + nodeId + '/proxmox/cts', null, apiOptions)
    .then(function(response) {
      var cts = response.data || [];

      if (cts.length === 0) {
        utils.printInfo('No containers found.');
        return 0;
      }

      if (flags.q || flags.quiet) {
        cts.forEach(function(ct) {
          console.log(ct.ctid);
        });
        return 0;
      }

      var headers = ['CTID', 'NAME', 'STATUS', 'CPU', 'MEMORY', 'DISK'];
      var rows = cts.map(function(ct) {
        var statusColor = ct.status === 'running' ? 'green' :
          ct.status === 'stopped' ? 'red' : 'gray';

        var name = ct.name || '-';
        if (ct.template) {
          name += utils.colorize(' [template]', 'cyan');
        }

        return [
          ct.ctid,
          name,
          utils.colorize(ct.status || '-', statusColor),
          ct.cpu_cores || '-',
          utils.formatBytes(ct.memory_bytes),
          utils.formatBytes(ct.disk_bytes),
        ];
      });

      utils.printTable(headers, rows);
      return 0;
    });
}

/**
 * List storage
 * @param {number} nodeId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listStorage(nodeId, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes/' + nodeId + '/proxmox/storage', null, apiOptions)
    .then(function(response) {
      var storage = response.data || [];

      if (storage.length === 0) {
        utils.printInfo('No storage found.');
        return 0;
      }

      if (flags.q || flags.quiet) {
        storage.forEach(function(s) {
          console.log(s.storage_name);
        });
        return 0;
      }

      var headers = ['NAME', 'TYPE', 'TOTAL', 'USED', 'AVAIL', 'USE%'];
      var rows = storage.map(function(s) {
        var percent = s.total_bytes > 0 ?
          ((s.used_bytes / s.total_bytes) * 100) : 0;

        var percentColor = percent >= 95 ? 'red' :
          percent >= 80 ? 'yellow' : 'green';

        return [
          s.storage_name,
          s.storage_type || '-',
          utils.formatBytes(s.total_bytes),
          utils.formatBytes(s.used_bytes),
          utils.formatBytes(s.available_bytes),
          utils.colorize(percent.toFixed(1) + '%', percentColor),
        ];
      });

      utils.printTable(headers, rows);
      return 0;
    });
}

/**
 * List snapshots
 * @param {number} nodeId
 * @param {Object} flags
 * @param {Object} apiOptions
 */
function listSnapshots(nodeId, flags, apiOptions) {
  return utils.apiRequest('GET', '/nodes/' + nodeId + '/proxmox/snapshots', null, apiOptions)
    .then(function(response) {
      var snapshots = response.data || [];

      if (snapshots.length === 0) {
        utils.printInfo('No snapshots found.');
        return 0;
      }

      if (flags.q || flags.quiet) {
        snapshots.forEach(function(s) {
          console.log(s.snap_name);
        });
        return 0;
      }

      var headers = ['VM/CT', 'TYPE', 'NAME', 'DESCRIPTION'];
      var rows = snapshots.map(function(s) {
        var typeColor = s.vm_type === 'vm' ? 'blue' : 'green';

        return [
          s.vmid,
          utils.colorize(s.vm_type.toUpperCase(), typeColor),
          s.snap_name,
          (s.description || '-').substring(0, 40),
        ];
      });

      utils.printTable(headers, rows);
      return 0;
    });
}

/**
 * VM/CT action
 * @param {number} nodeId
 * @param {string} vmid
 * @param {string} action
 * @param {boolean} isCT
 * @param {Object} apiOptions
 */
function vmAction(nodeId, vmid, action, isCT, apiOptions) {
  var type = isCT ? 'cts' : 'vms';
  var typeName = isCT ? 'container' : 'VM';

  utils.printInfo(action.charAt(0).toUpperCase() + action.slice(1) + 'ing ' + typeName + ' ' + vmid + '...');

  return utils.apiRequest('POST', '/nodes/' + nodeId + '/proxmox/' + type + '/' + vmid + '/' + action, null, apiOptions)
    .then(function() {
      utils.printSuccess(typeName + ' ' + action + ' successful');
      return 0;
    });
}

/**
 * Refresh Proxmox data
 * @param {number} nodeId
 * @param {Object} apiOptions
 */
function refreshProxmox(nodeId, apiOptions) {
  utils.printInfo('Refreshing Proxmox data...');

  return utils.apiRequest('POST', '/nodes/' + nodeId + '/proxmox', null, apiOptions)
    .then(function(response) {
      var summary = response.data && response.data.summary;

      utils.printSuccess('Proxmox data refreshed');

      if (summary) {
        console.log('');
        console.log('  VMs:       ' + (summary.vms || 0) + ' (' + (summary.vms_running || 0) + ' running)');
        console.log('  CTs:       ' + (summary.cts || 0) + ' (' + (summary.cts_running || 0) + ' running)');
        console.log('  Storage:   ' + (summary.storage || 0));
        console.log('  Snapshots: ' + (summary.snapshots || 0));
      }

      return 0;
    });
}

/**
 * Main pve command handler
 * @param {Object} parsed - Parsed arguments
 * @param {Object} apiOptions - API options
 */
function pveCommand(parsed, apiOptions) {
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
  var subcommand = parsed.args[0] || 'vms';
  var arg = parsed.args[1];
  var isCT = flags.ct || false;

  return getNode(nodeName, apiOptions)
    .then(function(node) {
      switch (subcommand) {
        case 'vms':
          return listVMs(node.id, flags, apiOptions);

        case 'cts':
        case 'containers':
          return listCTs(node.id, flags, apiOptions);

        case 'storage':
          return listStorage(node.id, flags, apiOptions);

        case 'snapshots':
        case 'snaps':
          return listSnapshots(node.id, flags, apiOptions);

        case 'start':
        case 'stop':
        case 'shutdown':
        case 'reboot':
          if (!arg) {
            utils.printError('VMID/CTID required');
            return 1;
          }
          return vmAction(node.id, arg, subcommand, isCT, apiOptions);

        case 'refresh':
          return refreshProxmox(node.id, apiOptions);

        default:
          utils.printError('Unknown subcommand: ' + subcommand);
          printHelp();
          return 1;
      }
    });
}

module.exports = pveCommand;

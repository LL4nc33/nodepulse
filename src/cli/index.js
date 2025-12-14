#!/usr/bin/env node

/**
 * nodepulse CLI
 * Command-line interface for nodepulse homelab dashboard
 */

var utils = require('./utils');
var nodesCmd = require('./commands/nodes');
var statusCmd = require('./commands/status');
var sshCmd = require('./commands/ssh');
var execCmd = require('./commands/exec');
var dockerCmd = require('./commands/docker');
var pveCmd = require('./commands/pve');

var VERSION = '0.7.0';

/**
 * Print help message
 */
function printHelp() {
  console.log('');
  console.log(utils.colorize('nodepulse CLI v' + VERSION, 'bold'));
  console.log('Homelab Dashboard Command-Line Interface');
  console.log('');
  console.log(utils.colorize('Usage:', 'bold'));
  console.log('  np <command> [subcommand] [options]');
  console.log('');
  console.log(utils.colorize('Commands:', 'bold'));
  console.log('  nodes         List and manage nodes');
  console.log('  status        Show monitoring status');
  console.log('  ssh           Open SSH connection to node');
  console.log('  exec          Execute command on nodes');
  console.log('  docker        Docker management commands');
  console.log('  pve           Proxmox management commands');
  console.log('');
  console.log(utils.colorize('Options:', 'bold'));
  console.log('  -h, --help    Show help');
  console.log('  -v, --version Show version');
  console.log('  --host        API host (default: localhost)');
  console.log('  --port        API port (default: 3000)');
  console.log('');
  console.log(utils.colorize('Environment:', 'bold'));
  console.log('  NP_HOST       API host (default: localhost)');
  console.log('  NP_PORT       API port (default: 3000)');
  console.log('');
  console.log(utils.colorize('Examples:', 'bold'));
  console.log('  np nodes                    List all nodes');
  console.log('  np nodes show myserver      Show node details');
  console.log('  np status                   Monitoring overview');
  console.log('  np ssh myserver             SSH into node');
  console.log('  np exec myserver "df -h"    Execute command');
  console.log('  np exec -t docker-host "docker ps"');
  console.log('  np docker myserver ps       List Docker containers');
  console.log('  np pve myserver vms         List Proxmox VMs');
  console.log('');
}

/**
 * Print version
 */
function printVersion() {
  console.log('nodepulse v' + VERSION);
}

/**
 * Main CLI entry point
 */
function main() {
  var args = process.argv.slice(2);
  var parsed = utils.parseArgs(args);

  // Handle global flags
  if (parsed.flags.h || parsed.flags.help) {
    printHelp();
    process.exit(0);
  }

  if (parsed.flags.v || parsed.flags.version) {
    printVersion();
    process.exit(0);
  }

  // API connection options
  var apiOptions = {
    host: parsed.flags.host || utils.DEFAULT_HOST,
    port: parsed.flags.port || utils.DEFAULT_PORT,
  };

  // No command - show help
  if (!parsed.command) {
    printHelp();
    process.exit(0);
  }

  // Route to command handler
  var commandPromise;

  switch (parsed.command) {
    case 'nodes':
      commandPromise = nodesCmd(parsed, apiOptions);
      break;

    case 'status':
      commandPromise = statusCmd(parsed, apiOptions);
      break;

    case 'ssh':
      commandPromise = sshCmd(parsed, apiOptions);
      break;

    case 'exec':
      commandPromise = execCmd(parsed, apiOptions);
      break;

    case 'docker':
      commandPromise = dockerCmd(parsed, apiOptions);
      break;

    case 'pve':
    case 'proxmox':
      commandPromise = pveCmd(parsed, apiOptions);
      break;

    case 'help':
      printHelp();
      process.exit(0);
      break;

    default:
      utils.printError('Unknown command: ' + parsed.command);
      console.log('Run "np --help" for usage information.');
      process.exit(1);
  }

  // Handle command result
  if (commandPromise && typeof commandPromise.then === 'function') {
    commandPromise
      .then(function(exitCode) {
        process.exit(exitCode || 0);
      })
      .catch(function(err) {
        if (err.error && err.error.message) {
          utils.printError(err.error.message);
        } else if (err.message) {
          utils.printError(err.message);
        } else {
          utils.printError('Unknown error occurred');
        }
        process.exit(1);
      });
  }
}

// Run main
main();

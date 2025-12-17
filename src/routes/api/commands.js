/**
 * Commands API Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../../db');
const ssh = require('../../ssh');
const { asyncHandler, apiResponse } = require('./helpers');
const { validateCommand } = require('../../lib/validators');
const { parseLimitParam, parseIntParam } = require('../../lib/params');

// Blocked commands that could be dangerous
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'dd if=',
  'mkfs',
  ':(){:|:&};:',
  '> /dev/sda',
  'chmod -R 777 /',
  'chown -R',
  'wget http',
  'curl http',
  'nc -e',
  'bash -i',
  '/dev/tcp/',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
  'halt',
  'poweroff',
  'eval ',
  'exec ',
  'source ',
  'python -c',
  'perl -e',
  'ruby -e',
  'php -r',
  'iptables',
  'crontab',
  'passwd',
  'useradd',
  'usermod',
  'kill -9',
  'killall',
  'pkill',
];

// Shell metacharacters that enable command chaining/injection
const DANGEROUS_METACHARACTERS = [';', '&&', '||', '|', '$(', '`', '>>', '<<', '\n', '\r'];

// Check for dangerous shell metacharacters
function containsDangerousMetachars(command) {
  for (let i = 0; i < DANGEROUS_METACHARACTERS.length; i++) {
    if (command.indexOf(DANGEROUS_METACHARACTERS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

// Validate command is not blocked
function isCommandBlocked(command) {
  const lowerCmd = command.toLowerCase().trim();
  for (let i = 0; i < BLOCKED_COMMANDS.length; i++) {
    if (lowerCmd.indexOf(BLOCKED_COMMANDS[i].toLowerCase()) !== -1) {
      return true;
    }
  }
  return false;
}

// Get command templates
router.get('/templates', asyncHandler(async (req, res) => {
  const category = req.query.category;
  const templates = db.commands.getTemplates(category || null);
  apiResponse(res, 200, templates);
}));

// Get templates for specific node type
router.get('/templates/for/:nodeType', asyncHandler(async (req, res) => {
  const nodeType = req.params.nodeType;

  // Validate node type
  const VALID_NODE_TYPES = ['proxmox-host', 'docker-host', 'bare-metal', 'raspberry-pi', 'all', 'unknown'];
  if (VALID_NODE_TYPES.indexOf(nodeType) === -1) {
    return apiResponse(res, 400, null, { code: 'INVALID_TYPE', message: 'Ungueltiger Node-Typ' });
  }

  const templates = db.commands.getTemplatesForNodeType(nodeType);
  apiResponse(res, 200, templates);
}));

// Get command history
router.get('/history', asyncHandler(async (req, res) => {
  let limit = parseLimitParam(req.query.limit, 50);
  if (limit < 1 || limit > 500) limit = 50;
  const history = db.commands.getHistory(limit);
  apiResponse(res, 200, history);
}));

// Get command history for a node
router.get('/history/node/:id', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  const node = db.nodes.getById(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  let limit = parseLimitParam(req.query.limit, 20);
  if (limit < 1 || limit > 100) limit = 20;

  const history = db.commands.getHistoryForNode(nodeId, limit);
  apiResponse(res, 200, history);
}));

// Execute command on a node
router.post('/execute/:nodeId', asyncHandler(async (req, res) => {
  const nodeId = parseInt(req.params.nodeId, 10);
  let command = req.body.command;
  const templateId = req.body.template_id ? parseInt(req.body.template_id, 10) : null;

  if (isNaN(nodeId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Node-ID' });
  }

  const cmdCheck = validateCommand(command);
  if (!cmdCheck.valid) {
    return apiResponse(res, 400, null, { code: 'INVALID_COMMAND', message: cmdCheck.error });
  }
  command = cmdCheck.value;

  // Validate command length
  if (command.length > 2000) {
    return apiResponse(res, 400, null, { code: 'COMMAND_TOO_LONG', message: 'Command darf maximal 2000 Zeichen lang sein' });
  }

  // Check for dangerous shell metacharacters (command injection prevention)
  if (containsDangerousMetachars(command)) {
    return apiResponse(res, 400, null, { code: 'DANGEROUS_CHARACTERS', message: 'Command enthaelt gefaehrliche Zeichen (;, &&, ||, |, etc.)' });
  }

  // Check for blocked commands
  if (isCommandBlocked(command)) {
    return apiResponse(res, 400, null, { code: 'BLOCKED_COMMAND', message: 'Dieser Befehl ist aus Sicherheitsgruenden blockiert' });
  }

  // Need credentials for SSH connection
  const node = db.nodes.getByIdWithCredentials(nodeId);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  // Create history entry
  const historyId = db.commands.createHistory({
    command_template_id: templateId,
    full_command: command,
    target_type: 'single',
    target_value: node.name,
  });

  const startedAt = new Date().toISOString();
  let result;
  let status = 'success';

  try {
    // Execute command with 2 minute timeout
    result = await ssh.execute(node, command, 120000);

    if (result.exitCode !== 0) {
      status = 'failed';
    }
  } catch (err) {
    status = err.message.toLowerCase().indexOf('timeout') !== -1 ? 'timeout' : 'failed';
    result = {
      stdout: '',
      stderr: err.message,
      exitCode: -1,
    };
  }

  const finishedAt = new Date().toISOString();

  // Save result
  const resultId = db.commands.createResult({
    history_id: historyId,
    node_id: nodeId,
    status: status,
    exit_code: result.exitCode,
    output: result.stdout || '',
    error: result.stderr || '',
    started_at: startedAt,
    finished_at: finishedAt,
  });

  // Update node online status
  if (status === 'success' || status === 'failed') {
    db.nodes.setOnline(nodeId, true);
  } else if (status === 'timeout') {
    db.nodes.setOnline(nodeId, false, 'Command timeout');
  }

  apiResponse(res, status === 'success' ? 200 : 500, {
    result_id: resultId,
    history_id: historyId,
    status: status,
    exit_code: result.exitCode,
    output: result.stdout || '',
    error: result.stderr || '',
    started_at: startedAt,
    finished_at: finishedAt,
  });
}));

// Get command result by ID
router.get('/results/:id', asyncHandler(async (req, res) => {
  const resultId = parseInt(req.params.id, 10);
  if (isNaN(resultId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Result-ID' });
  }

  const result = db.commands.getResultById(resultId);
  if (!result) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Result nicht gefunden' });
  }

  apiResponse(res, 200, result);
}));

module.exports = router;

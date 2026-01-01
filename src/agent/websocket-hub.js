/**
 * WebSocket Hub for Agent Communication
 *
 * Manages WebSocket connections from NodePulse agents.
 * Features:
 * - API-Key authentication
 * - Heartbeat/Ping-Pong for connection health
 * - Metrics reception and storage
 * - Command dispatch to agents
 * - Connection state tracking
 */

'use strict';

var WebSocket = require('ws');
var db = require('../db');

// Connected agents: Map<nodeId, WebSocket>
var connections = new Map();

// Pending commands: Map<commandId, {resolve, reject, timeout}>
var pendingCommands = new Map();

// WebSocket server instance
var wss = null;

// Heartbeat interval (30 seconds)
var HEARTBEAT_INTERVAL = 30000;

// Command timeout (60 seconds)
var COMMAND_TIMEOUT = 60000;

// Heartbeat timer
var heartbeatTimer = null;

/**
 * Initialize WebSocket server
 * @param {Object} options - Server options
 * @param {number} options.port - Port to listen on (default: 3001)
 * @param {Object} options.server - Existing HTTP server to attach to (optional)
 * @returns {Object} WebSocket server instance
 */
function init(options) {
  options = options || {};

  var wsOptions = {
    clientTracking: true
  };

  if (options.server) {
    // Attach to existing HTTP server
    wsOptions.server = options.server;
    wsOptions.path = '/agent';
  } else {
    // Standalone WebSocket server
    wsOptions.port = options.port || 3001;
  }

  wss = new WebSocket.Server(wsOptions);

  wss.on('connection', handleConnection);

  wss.on('error', function(err) {
    console.error('[AgentHub] WebSocket server error:', err.message);
  });

  // Start heartbeat checker
  heartbeatTimer = setInterval(checkHeartbeats, HEARTBEAT_INTERVAL);

  var listenInfo = options.server ? 'attached to HTTP server' : ('port ' + wsOptions.port);
  console.log('[AgentHub] WebSocket server started on ' + listenInfo);

  return wss;
}

/**
 * Handle new WebSocket connection
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} req - HTTP request
 */
function handleConnection(ws, req) {
  // Extract API key from header or query
  var apiKey = req.headers['x-api-key'] || getQueryParam(req.url, 'key');

  if (!apiKey) {
    console.warn('[AgentHub] Connection rejected: No API key');
    ws.close(4001, 'API key required');
    return;
  }

  // Validate API key
  var agent = db.agents.validateApiKey(apiKey);
  if (!agent) {
    console.warn('[AgentHub] Connection rejected: Invalid API key');
    ws.close(4003, 'Invalid API key');
    return;
  }

  var nodeId = agent.node_id;

  // Close existing connection if any
  var existing = connections.get(nodeId);
  if (existing) {
    console.log('[AgentHub] Closing existing connection for node ' + nodeId);
    existing.close(4000, 'New connection');
  }

  // Store connection
  ws.nodeId = nodeId;
  ws.isAlive = true;
  ws.lastHeartbeat = Date.now();
  connections.set(nodeId, ws);

  // Update database
  db.agents.setConnected(nodeId, true);
  db.nodes.setOnline(nodeId, true);

  console.log('[AgentHub] Agent connected: node ' + nodeId + ' (' + agent.node_name + ')');

  // Set up event handlers
  ws.on('message', function(data) {
    handleMessage(ws, nodeId, data);
  });

  ws.on('pong', function() {
    ws.isAlive = true;
    ws.lastHeartbeat = Date.now();
    db.agents.updateHeartbeat(nodeId);
  });

  ws.on('close', function(code, reason) {
    handleDisconnect(nodeId, code, reason);
  });

  ws.on('error', function(err) {
    console.error('[AgentHub] WebSocket error for node ' + nodeId + ':', err.message);
  });

  // Send welcome message
  sendMessage(ws, {
    type: 'welcome',
    node_id: nodeId,
    server_time: Date.now()
  });
}

/**
 * Handle incoming message from agent
 * @param {WebSocket} ws - WebSocket connection
 * @param {number} nodeId - Node ID
 * @param {Buffer|string} data - Message data
 */
function handleMessage(ws, nodeId, data) {
  var message;
  try {
    message = JSON.parse(data.toString());
  } catch (err) {
    console.error('[AgentHub] Invalid JSON from node ' + nodeId + ':', err.message);
    return;
  }

  var type = message.type;

  switch (type) {
    case 'metrics':
      handleMetrics(nodeId, message);
      break;

    case 'event':
      handleEvent(nodeId, message);
      break;

    case 'response':
      handleCommandResponse(message);
      break;

    case 'heartbeat':
      ws.isAlive = true;
      ws.lastHeartbeat = Date.now();
      db.agents.updateHeartbeat(nodeId);
      break;

    case 'info':
      handleAgentInfo(nodeId, message);
      break;

    default:
      console.warn('[AgentHub] Unknown message type from node ' + nodeId + ':', type);
  }
}

/**
 * Handle metrics push from agent
 * @param {number} nodeId - Node ID
 * @param {Object} message - Metrics message
 */
function handleMetrics(nodeId, message) {
  var data = message.data || {};

  // Add timestamp if not present
  if (!data.timestamp) {
    data.timestamp = Date.now();
  }

  // Save to current stats
  try {
    db.stats.saveCurrent(nodeId, data);

    // Also save to history
    db.stats.saveHistory(nodeId, data);

    // Update node online status
    db.nodes.setOnline(nodeId, true);

  } catch (err) {
    console.error('[AgentHub] Failed to save metrics for node ' + nodeId + ':', err.message);
  }
}

/**
 * Handle event from agent
 * @param {number} nodeId - Node ID
 * @param {Object} message - Event message
 */
function handleEvent(nodeId, message) {
  var eventType = message.event;
  var eventData = message.data || {};

  console.log('[AgentHub] Event from node ' + nodeId + ':', eventType, eventData);

  // TODO: Handle specific event types
  // - container_started, container_stopped, container_crashed
  // - service_failed, service_recovered
  // - disk_warning, disk_critical
  // - etc.
}

/**
 * Handle command response from agent
 * @param {Object} message - Response message
 */
function handleCommandResponse(message) {
  var commandId = message.id;
  var pending = pendingCommands.get(commandId);

  if (!pending) {
    console.warn('[AgentHub] Received response for unknown command:', commandId);
    return;
  }

  clearTimeout(pending.timeout);
  pendingCommands.delete(commandId);

  if (message.success) {
    pending.resolve(message.data);
  } else {
    pending.reject(new Error(message.error || 'Command failed'));
  }
}

/**
 * Handle agent info message (version, capabilities)
 * @param {number} nodeId - Node ID
 * @param {Object} message - Info message
 */
function handleAgentInfo(nodeId, message) {
  var info = message.data || {};

  if (info.version) {
    db.agents.setConnected(nodeId, true, info.version);
  }

  if (info.arch) {
    db.agents.setInstalled(nodeId, {
      version: info.version,
      arch: info.arch
    });
  }

  console.log('[AgentHub] Agent info for node ' + nodeId + ':', info);
}

/**
 * Handle agent disconnect
 * @param {number} nodeId - Node ID
 * @param {number} code - Close code
 * @param {string} reason - Close reason
 */
function handleDisconnect(nodeId, code, reason) {
  connections.delete(nodeId);
  db.agents.setConnected(nodeId, false);

  // Check if SSH fallback is enabled
  var agent = db.agents.get(nodeId);
  if (!agent || !agent.ssh_fallback_enabled) {
    // No fallback - mark node as offline
    db.nodes.setOnline(nodeId, false, 'Agent disconnected');
  }

  console.log('[AgentHub] Agent disconnected: node ' + nodeId + ' (code: ' + code + ')');
}

/**
 * Check heartbeats and close dead connections
 */
function checkHeartbeats() {
  var now = Date.now();
  var staleThreshold = now - (HEARTBEAT_INTERVAL * 2);

  connections.forEach(function(ws, nodeId) {
    if (!ws.isAlive || ws.lastHeartbeat < staleThreshold) {
      console.log('[AgentHub] Terminating stale connection for node ' + nodeId);
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    ws.ping();
  });
}

/**
 * Send message to agent
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Message to send
 */
function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send command to agent and wait for response
 * @param {number} nodeId - Node ID
 * @param {string} command - Command type
 * @param {Object} args - Command arguments
 * @returns {Promise<Object>} Command result
 */
function sendCommand(nodeId, command, args) {
  return new Promise(function(resolve, reject) {
    var ws = connections.get(nodeId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Agent not connected'));
      return;
    }

    var commandId = 'cmd-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    var timeout = setTimeout(function() {
      pendingCommands.delete(commandId);
      reject(new Error('Command timeout'));
    }, COMMAND_TIMEOUT);

    pendingCommands.set(commandId, {
      resolve: resolve,
      reject: reject,
      timeout: timeout
    });

    sendMessage(ws, {
      type: 'command',
      id: commandId,
      command: command,
      args: args || {}
    });
  });
}

/**
 * Check if agent is connected
 * @param {number} nodeId - Node ID
 * @returns {boolean} Connection status
 */
function isConnected(nodeId) {
  var ws = connections.get(nodeId);
  return ws && ws.readyState === WebSocket.OPEN;
}

/**
 * Get connection status for all agents
 * @returns {Array} Status array
 */
function getStatus() {
  var status = [];
  connections.forEach(function(ws, nodeId) {
    status.push({
      node_id: nodeId,
      connected: ws.readyState === WebSocket.OPEN,
      last_heartbeat: ws.lastHeartbeat
    });
  });
  return status;
}

/**
 * Get connected agent count
 * @returns {number} Number of connected agents
 */
function getConnectedCount() {
  return connections.size;
}

/**
 * Shutdown WebSocket server
 * @returns {Promise<void>}
 */
function shutdown() {
  return new Promise(function(resolve) {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    // Clear pending commands
    pendingCommands.forEach(function(pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Server shutting down'));
    });
    pendingCommands.clear();

    // Close all connections
    connections.forEach(function(ws, nodeId) {
      ws.close(1001, 'Server shutting down');
      db.agents.setConnected(nodeId, false);
    });
    connections.clear();

    if (wss) {
      wss.close(function() {
        console.log('[AgentHub] WebSocket server closed');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Helper: Extract query parameter from URL
 * @param {string} url - URL string
 * @param {string} param - Parameter name
 * @returns {string|null} Parameter value
 */
function getQueryParam(url, param) {
  var match = url.match(new RegExp('[?&]' + param + '=([^&]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

module.exports = {
  init: init,
  isConnected: isConnected,
  sendCommand: sendCommand,
  getStatus: getStatus,
  getConnectedCount: getConnectedCount,
  shutdown: shutdown
};

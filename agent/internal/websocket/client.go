// Package websocket provides a WebSocket client with automatic reconnection.
package websocket

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/oidanice/nodepulse-agent/internal/logger"
)

// Message types
const (
	TypeMetrics   = "metrics"
	TypeHeartbeat = "heartbeat"
	TypeInfo      = "info"
	TypeResponse  = "response"
	TypeCommand   = "command"
	TypeWelcome   = "welcome"
)

// Message is a generic WebSocket message.
type Message struct {
	Type string      `json:"type"`
	ID   string      `json:"id,omitempty"`
	Data interface{} `json:"data,omitempty"`
}

// InfoMessage is sent after connecting.
type InfoMessage struct {
	Type    string `json:"type"`
	Version string `json:"version"`
	Arch    string `json:"arch"`
}

// MetricsMessage wraps metrics data.
type MetricsMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// CommandMessage is received from the server.
type CommandMessage struct {
	Type    string                 `json:"type"`
	ID      string                 `json:"id"`
	Command string                 `json:"command"`
	Args    map[string]interface{} `json:"args"`
}

// ResponseMessage is sent back for commands.
type ResponseMessage struct {
	Type    string      `json:"type"`
	ID      string      `json:"id"`
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// Client handles WebSocket connection to NodePulse server.
type Client struct {
	serverURL string
	apiKey    string
	version   string
	arch      string

	conn     *websocket.Conn
	mu       sync.Mutex
	closed   bool
	closeCh  chan struct{}

	// Reconnection settings
	reconnect *Reconnect

	// Callbacks
	onCommand func(cmd *CommandMessage) *ResponseMessage
}

// NewClient creates a new WebSocket client.
func NewClient(serverURL, apiKey, version, arch string) *Client {
	return &Client{
		serverURL: serverURL,
		apiKey:    apiKey,
		version:   version,
		arch:      arch,
		closeCh:   make(chan struct{}),
		reconnect: NewReconnect(),
	}
}

// SetCommandHandler sets the callback for handling commands.
func (c *Client) SetCommandHandler(handler func(cmd *CommandMessage) *ResponseMessage) {
	c.onCommand = handler
}

// Connect establishes the WebSocket connection.
func (c *Client) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return nil
	}

	// Set up headers with API key
	header := http.Header{}
	header.Set("X-API-Key", c.apiKey)

	// Dial the WebSocket server
	logger.Info("Connecting to %s", c.serverURL)
	conn, _, err := websocket.DefaultDialer.Dial(c.serverURL, header)
	if err != nil {
		return err
	}

	c.conn = conn
	c.reconnect.Reset()

	// Send info message immediately after connecting
	info := InfoMessage{
		Type:    TypeInfo,
		Version: c.version,
		Arch:    c.arch,
	}
	if err := c.sendJSON(info); err != nil {
		logger.Warn("Failed to send info message: %v", err)
	}

	logger.Info("Connected to server")

	// Start read loop in goroutine
	go c.readLoop()

	return nil
}

// sendJSON sends a JSON message (must be called with lock held or from internal methods).
func (c *Client) sendJSON(v interface{}) error {
	if c.conn == nil {
		return nil
	}
	return c.conn.WriteJSON(v)
}

// Send sends a message to the server.
func (c *Client) Send(v interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return nil
	}

	return c.sendJSON(v)
}

// SendMetrics sends metrics data to the server.
func (c *Client) SendMetrics(data interface{}) error {
	msg := MetricsMessage{
		Type: TypeMetrics,
		Data: data,
	}
	return c.Send(msg)
}

// readLoop reads messages from the WebSocket.
func (c *Client) readLoop() {
	for {
		select {
		case <-c.closeCh:
			return
		default:
		}

		c.mu.Lock()
		conn := c.conn
		c.mu.Unlock()

		if conn == nil {
			return
		}

		_, message, err := conn.ReadMessage()
		if err != nil {
			if !c.closed {
				logger.Warn("Read error: %v", err)
				c.handleDisconnect()
			}
			return
		}

		c.handleMessage(message)
	}
}

// handleMessage processes incoming messages.
func (c *Client) handleMessage(data []byte) {
	var msg map[string]interface{}
	if err := json.Unmarshal(data, &msg); err != nil {
		logger.Warn("Failed to parse message: %v", err)
		return
	}

	msgType, _ := msg["type"].(string)

	switch msgType {
	case TypeWelcome:
		logger.Info("Received welcome from server")

	case TypeCommand:
		if c.onCommand != nil {
			var cmd CommandMessage
			if err := json.Unmarshal(data, &cmd); err == nil {
				resp := c.onCommand(&cmd)
				if resp != nil {
					c.Send(resp)
				}
			}
		}

	default:
		logger.Debug("Received message type: %s", msgType)
	}
}

// handleDisconnect handles connection loss and triggers reconnection.
func (c *Client) handleDisconnect() {
	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
	c.mu.Unlock()

	// Start reconnection loop
	go c.reconnectLoop()
}

// reconnectLoop attempts to reconnect with exponential backoff.
func (c *Client) reconnectLoop() {
	for {
		select {
		case <-c.closeCh:
			return
		default:
		}

		delay := c.reconnect.NextDelay()
		logger.Info("Reconnecting in %v...", delay)

		select {
		case <-c.closeCh:
			return
		case <-time.After(delay):
		}

		if err := c.Connect(); err != nil {
			logger.Warn("Reconnection failed: %v", err)
			continue
		}

		// Successfully reconnected
		return
	}
}

// IsConnected returns true if the client is connected.
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// Close closes the WebSocket connection.
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return
	}

	c.closed = true
	close(c.closeCh)

	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
}

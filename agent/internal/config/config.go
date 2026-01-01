// Package config handles configuration loading for the NodePulse agent.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const (
	// DefaultConfigPath is the default location for the config file.
	DefaultConfigPath = "/opt/nodepulse-agent/config.json"
	// DefaultPushInterval is the default metrics push interval in seconds.
	DefaultPushInterval = 5
	// DefaultLogLevel is the default logging level.
	DefaultLogLevel = "info"
)

// Config holds the agent configuration.
type Config struct {
	ServerURL    string `json:"server_url"`
	APIKey       string `json:"api_key"`
	NodeID       int    `json:"node_id"`
	PushInterval int    `json:"push_interval"`
	LogLevel     string `json:"log_level"`
}

// Load reads the configuration from the specified file path.
func Load(path string) (*Config, error) {
	if path == "" {
		path = DefaultConfigPath
	}

	// Clean the path
	path = filepath.Clean(path)

	// Read the file
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file %s: %w", path, err)
	}

	// Parse JSON
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Apply defaults
	if cfg.PushInterval <= 0 {
		cfg.PushInterval = DefaultPushInterval
	}
	if cfg.LogLevel == "" {
		cfg.LogLevel = DefaultLogLevel
	}

	// Validate required fields
	if cfg.ServerURL == "" {
		return nil, fmt.Errorf("server_url is required in config")
	}
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("api_key is required in config")
	}
	if len(cfg.APIKey) != 64 {
		return nil, fmt.Errorf("api_key must be exactly 64 characters (got %d)", len(cfg.APIKey))
	}

	return &cfg, nil
}

// String returns a safe string representation of the config (without API key).
func (c *Config) String() string {
	return fmt.Sprintf("Config{ServerURL: %s, NodeID: %d, PushInterval: %d, LogLevel: %s}",
		c.ServerURL, c.NodeID, c.PushInterval, c.LogLevel)
}

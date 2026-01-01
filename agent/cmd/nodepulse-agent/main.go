// NodePulse Agent - System metrics collector with WebSocket push
package main

import (
	"flag"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/oidanice/nodepulse-agent/internal/collector"
	"github.com/oidanice/nodepulse-agent/internal/config"
	"github.com/oidanice/nodepulse-agent/internal/logger"
	"github.com/oidanice/nodepulse-agent/internal/websocket"
)

// Version is set at build time via ldflags
var Version = "dev"

func main() {
	// Parse command line flags
	configPath := flag.String("config", config.DefaultConfigPath, "Path to config file")
	showVersion := flag.Bool("version", false, "Show version and exit")
	flag.Parse()

	if *showVersion {
		println("nodepulse-agent", Version, runtime.GOARCH)
		os.Exit(0)
	}

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("Failed to load config: %v", err)
		os.Exit(1)
	}

	// Set log level
	logger.SetDefaultLevel(cfg.LogLevel)

	logger.Info("NodePulse Agent %s (%s) starting...", Version, runtime.GOARCH)
	logger.Info("Config: %s", cfg)

	// Create collector
	coll := collector.New()

	// Create WebSocket client
	client := websocket.NewClient(cfg.ServerURL, cfg.APIKey, Version, runtime.GOARCH)

	// Set up command handler
	client.SetCommandHandler(func(cmd *websocket.CommandMessage) *websocket.ResponseMessage {
		logger.Info("Received command: %s (id: %s)", cmd.Command, cmd.ID)

		// Handle known commands
		switch cmd.Command {
		case "get_stats":
			metrics := coll.Collect()
			return &websocket.ResponseMessage{
				Type:    websocket.TypeResponse,
				ID:      cmd.ID,
				Success: true,
				Data:    metrics,
			}
		default:
			return &websocket.ResponseMessage{
				Type:    websocket.TypeResponse,
				ID:      cmd.ID,
				Success: false,
				Error:   "unknown command: " + cmd.Command,
			}
		}
	})

	// Connect to server
	if err := client.Connect(); err != nil {
		logger.Error("Failed to connect: %v", err)
		// Don't exit - the client will try to reconnect
	}

	// Set up signal handling for graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// Create metrics push ticker
	ticker := time.NewTicker(time.Duration(cfg.PushInterval) * time.Second)
	defer ticker.Stop()

	logger.Info("Starting metrics collection (interval: %ds)", cfg.PushInterval)

	// Main loop
	for {
		select {
		case <-ticker.C:
			// Collect and send metrics
			if client.IsConnected() {
				metrics := coll.Collect()
				if err := client.SendMetrics(metrics); err != nil {
					logger.Warn("Failed to send metrics: %v", err)
				} else {
					logger.Debug("Sent metrics: CPU=%.1f%%, RAM=%.1f%%, Disk=%.1f%%",
						metrics.CPUPercent, metrics.RAMPercent, metrics.DiskPercent)
				}
			}

		case sig := <-sigCh:
			logger.Info("Received signal %v, shutting down...", sig)
			client.Close()
			logger.Info("Goodbye!")
			os.Exit(0)
		}
	}
}

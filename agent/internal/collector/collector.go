// Package collector provides system metrics collection for the NodePulse agent.
package collector

import (
	"sync"
	"time"
)

// Metrics holds all collected system metrics.
// Field names match exactly what the NodePulse server expects.
type Metrics struct {
	Timestamp         int64    `json:"timestamp"`
	CPUPercent        float64  `json:"cpu_percent"`
	Load1m            float64  `json:"load_1m"`
	Load5m            float64  `json:"load_5m"`
	Load15m           float64  `json:"load_15m"`
	RAMUsedBytes      int64    `json:"ram_used_bytes"`
	RAMAvailableBytes int64    `json:"ram_available_bytes"`
	RAMPercent        float64  `json:"ram_percent"`
	SwapUsedBytes     int64    `json:"swap_used_bytes"`
	DiskUsedBytes     int64    `json:"disk_used_bytes"`
	DiskAvailableBytes int64   `json:"disk_available_bytes"`
	DiskPercent       float64  `json:"disk_percent"`
	NetRXBytes        int64    `json:"net_rx_bytes"`
	NetTXBytes        int64    `json:"net_tx_bytes"`
	TempCPU           *float64 `json:"temp_cpu"` // Pointer to allow null
	UptimeSeconds     int64    `json:"uptime_seconds"`
	Processes         int      `json:"processes"`
	VMsRunning        int      `json:"vms_running"`
	CTsRunning        int      `json:"cts_running"`
	ContainersRunning int      `json:"containers_running"`
}

// Collector gathers system metrics.
type Collector struct {
	mu           sync.Mutex
	cpuCollector *CPUCollector
}

// New creates a new Collector instance.
func New() *Collector {
	return &Collector{
		cpuCollector: NewCPUCollector(),
	}
}

// Collect gathers all system metrics and returns them.
func (c *Collector) Collect() *Metrics {
	c.mu.Lock()
	defer c.mu.Unlock()

	m := &Metrics{
		Timestamp:         time.Now().Unix(),
		VMsRunning:        0, // Only set by Proxmox hosts
		CTsRunning:        0, // Only set by Proxmox hosts
		ContainersRunning: 0, // Could be set by Docker hosts
	}

	// CPU
	m.CPUPercent = c.cpuCollector.Collect()

	// Load Average
	load1, load5, load15 := CollectLoadAvg()
	m.Load1m = load1
	m.Load5m = load5
	m.Load15m = load15

	// Memory
	memUsed, memAvail, memPercent, swapUsed := CollectMemory()
	m.RAMUsedBytes = memUsed
	m.RAMAvailableBytes = memAvail
	m.RAMPercent = memPercent
	m.SwapUsedBytes = swapUsed

	// Disk
	diskUsed, diskAvail, diskPercent := CollectDisk("/")
	m.DiskUsedBytes = diskUsed
	m.DiskAvailableBytes = diskAvail
	m.DiskPercent = diskPercent

	// Network
	m.NetRXBytes, m.NetTXBytes = CollectNetwork()

	// Temperature
	if temp, ok := CollectTemperature(); ok {
		m.TempCPU = &temp
	}

	// Uptime
	m.UptimeSeconds = CollectUptime()

	// Processes
	m.Processes = CollectProcesses()

	return m
}

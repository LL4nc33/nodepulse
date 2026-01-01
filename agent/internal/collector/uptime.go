package collector

import (
	"os"
	"strconv"
	"strings"
)

// CollectUptime reads /proc/uptime and returns the system uptime in seconds.
func CollectUptime() int64 {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}

	// Format: "uptime_seconds idle_seconds"
	// e.g., "12345.67 1234.56"
	fields := strings.Fields(string(data))
	if len(fields) < 1 {
		return 0
	}

	// Parse the uptime value (may have decimals)
	uptimeFloat, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0
	}

	return int64(uptimeFloat)
}

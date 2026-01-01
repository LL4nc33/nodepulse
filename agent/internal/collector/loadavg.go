package collector

import (
	"os"
	"strconv"
	"strings"
)

// CollectLoadAvg reads /proc/loadavg and returns the 1, 5, and 15 minute load averages.
func CollectLoadAvg() (load1, load5, load15 float64) {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, 0, 0
	}

	// Format: "0.00 0.01 0.05 1/123 4567"
	fields := strings.Fields(string(data))
	if len(fields) < 3 {
		return 0, 0, 0
	}

	load1, _ = strconv.ParseFloat(fields[0], 64)
	load5, _ = strconv.ParseFloat(fields[1], 64)
	load15, _ = strconv.ParseFloat(fields[2], 64)

	return load1, load5, load15
}

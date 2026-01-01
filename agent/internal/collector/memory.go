package collector

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// CollectMemory reads /proc/meminfo and returns memory statistics in bytes.
func CollectMemory() (used, available int64, percent float64, swapUsed int64) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0, 0, 0
	}
	defer file.Close()

	var memTotal, memFree, memAvailable, buffers, cached int64
	var swapTotal, swapFree int64

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		// Parse value (in kB)
		value, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}

		switch fields[0] {
		case "MemTotal:":
			memTotal = value * 1024 // Convert kB to bytes
		case "MemFree:":
			memFree = value * 1024
		case "MemAvailable:":
			memAvailable = value * 1024
		case "Buffers:":
			buffers = value * 1024
		case "Cached:":
			cached = value * 1024
		case "SwapTotal:":
			swapTotal = value * 1024
		case "SwapFree:":
			swapFree = value * 1024
		}
	}

	// If MemAvailable is not available (older kernels), estimate it
	if memAvailable == 0 && memTotal > 0 {
		memAvailable = memFree + buffers + cached
	}

	// Calculate used memory
	// Used = Total - Available
	used = memTotal - memAvailable
	available = memAvailable

	// Calculate percentage
	if memTotal > 0 {
		percent = 100.0 * float64(used) / float64(memTotal)
	}

	// Calculate swap used
	swapUsed = swapTotal - swapFree

	return used, available, percent, swapUsed
}

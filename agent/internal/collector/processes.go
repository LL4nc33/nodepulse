package collector

import (
	"os"
	"strconv"
)

// CollectProcesses counts the number of running processes by counting
// numeric directories in /proc (each PID has a directory).
func CollectProcesses() int {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0
	}

	count := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		// Check if the directory name is a number (PID)
		name := entry.Name()
		if _, err := strconv.Atoi(name); err == nil {
			count++
		}
	}

	return count
}

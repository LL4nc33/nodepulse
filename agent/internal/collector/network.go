package collector

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// CollectNetwork reads /proc/net/dev and returns total RX and TX bytes
// across all interfaces (excluding loopback).
func CollectNetwork() (rxBytes, txBytes int64) {
	file, err := os.Open("/proc/net/dev")
	if err != nil {
		return 0, 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		// Skip header lines
		if lineNum <= 2 {
			continue
		}

		line := scanner.Text()

		// Find the interface name (before the colon)
		colonIdx := strings.Index(line, ":")
		if colonIdx == -1 {
			continue
		}

		iface := strings.TrimSpace(line[:colonIdx])

		// Skip loopback interface
		if iface == "lo" {
			continue
		}

		// Parse the values after the colon
		// Format: bytes packets errs drop fifo frame compressed multicast | bytes packets errs drop fifo colls carrier compressed
		values := strings.Fields(line[colonIdx+1:])
		if len(values) < 9 {
			continue
		}

		// RX bytes is the first value
		rx, err := strconv.ParseInt(values[0], 10, 64)
		if err == nil {
			rxBytes += rx
		}

		// TX bytes is the 9th value (index 8)
		tx, err := strconv.ParseInt(values[8], 10, 64)
		if err == nil {
			txBytes += tx
		}
	}

	return rxBytes, txBytes
}

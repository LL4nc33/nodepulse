package collector

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"sync"
)

// CPUCollector tracks CPU usage between samples.
type CPUCollector struct {
	mu       sync.Mutex
	prevIdle int64
	prevTotal int64
}

// NewCPUCollector creates a new CPU collector.
func NewCPUCollector() *CPUCollector {
	c := &CPUCollector{}
	// Take an initial reading to establish baseline
	c.readCPUStat()
	return c
}

// Collect returns the current CPU usage percentage (0-100).
func (c *CPUCollector) Collect() float64 {
	c.mu.Lock()
	defer c.mu.Unlock()

	idle, total := c.readCPUStat()

	idleDelta := idle - c.prevIdle
	totalDelta := total - c.prevTotal

	c.prevIdle = idle
	c.prevTotal = total

	if totalDelta == 0 {
		return 0
	}

	usage := 100.0 * float64(totalDelta-idleDelta) / float64(totalDelta)

	// Clamp to valid range
	if usage < 0 {
		usage = 0
	}
	if usage > 100 {
		usage = 100
	}

	return usage
}

// readCPUStat reads /proc/stat and returns idle time and total time.
func (c *CPUCollector) readCPUStat() (idle, total int64) {
	file, err := os.Open("/proc/stat")
	if err != nil {
		return 0, 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "cpu ") {
			fields := strings.Fields(line)
			if len(fields) < 5 {
				return 0, 0
			}

			// Fields: cpu user nice system idle iowait irq softirq steal guest guest_nice
			// We need: user(1), nice(2), system(3), idle(4), iowait(5), irq(6), softirq(7), steal(8)

			var values []int64
			for i := 1; i < len(fields) && i <= 8; i++ {
				v, err := strconv.ParseInt(fields[i], 10, 64)
				if err != nil {
					v = 0
				}
				values = append(values, v)
			}

			// Ensure we have at least 4 values
			for len(values) < 8 {
				values = append(values, 0)
			}

			// idle = idle + iowait
			idle = values[3] + values[4]

			// total = sum of all values
			for _, v := range values {
				total += v
			}

			return idle, total
		}
	}

	return 0, 0
}

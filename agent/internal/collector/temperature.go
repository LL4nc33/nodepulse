package collector

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// CollectTemperature reads CPU temperature from thermal zones.
// Returns the temperature in Celsius and true if successful.
func CollectTemperature() (float64, bool) {
	// Try common thermal zone paths
	paths := []string{
		"/sys/class/thermal/thermal_zone0/temp",
		"/sys/class/hwmon/hwmon0/temp1_input",
		"/sys/devices/virtual/thermal/thermal_zone0/temp",
	}

	for _, path := range paths {
		if temp, ok := readTempFile(path); ok {
			return temp, true
		}
	}

	// Try to find any thermal zone
	matches, err := filepath.Glob("/sys/class/thermal/thermal_zone*/temp")
	if err == nil {
		for _, path := range matches {
			if temp, ok := readTempFile(path); ok {
				return temp, true
			}
		}
	}

	// Try hwmon paths
	matches, err = filepath.Glob("/sys/class/hwmon/hwmon*/temp*_input")
	if err == nil {
		for _, path := range matches {
			if temp, ok := readTempFile(path); ok {
				return temp, true
			}
		}
	}

	return 0, false
}

// readTempFile reads a temperature file and returns the value in Celsius.
func readTempFile(path string) (float64, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, false
	}

	// Parse the value (in millidegrees Celsius)
	valueStr := strings.TrimSpace(string(data))
	value, err := strconv.ParseInt(valueStr, 10, 64)
	if err != nil {
		return 0, false
	}

	// Convert from millidegrees to degrees
	temp := float64(value) / 1000.0

	// Sanity check - temperature should be reasonable
	if temp < -50 || temp > 150 {
		return 0, false
	}

	return temp, true
}

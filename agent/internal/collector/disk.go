package collector

import (
	"syscall"
)

// CollectDisk returns disk usage for the specified path.
func CollectDisk(path string) (used, available int64, percent float64) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, 0
	}

	// Total blocks * block size = total bytes
	total := int64(stat.Blocks) * int64(stat.Bsize)

	// Available to non-root users
	available = int64(stat.Bavail) * int64(stat.Bsize)

	// Free blocks (including reserved for root)
	free := int64(stat.Bfree) * int64(stat.Bsize)

	// Used = Total - Free
	used = total - free

	// Percentage based on total available to users
	// This matches what `df` shows
	usable := total - (free - available) // Total usable space
	if usable > 0 {
		percent = 100.0 * float64(used) / float64(usable)
	}

	// Alternative calculation matching df more closely:
	// Used percentage = used / (used + available) * 100
	if used+available > 0 {
		percent = 100.0 * float64(used) / float64(used+available)
	}

	return used, available, percent
}

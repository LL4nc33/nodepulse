#!/bin/bash
# =============================================================================
# NodePulse Capability Detection Script
# Detects available features and tools on a Linux system
# Output: JSON format
# =============================================================================

# Check if jq is available
HAS_JQ=false
if command -v jq &>/dev/null; then
  HAS_JQ=true
fi

# JSON builder functions (fallback without jq)
json_escape() {
  echo "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

add_json_field() {
  local key="$1"
  local value="$2"
  local is_string="$3"

  if [ "$is_string" = "true" ]; then
    JSON_FIELDS="${JSON_FIELDS},\"$key\":\"$(json_escape "$value")\""
  else
    JSON_FIELDS="${JSON_FIELDS},\"$key\":$value"
  fi
}

# Initialize
JSON_FIELDS='"base":true'

# =============================================================================
# DOCKER SUPPORT
# =============================================================================
if command -v docker &>/dev/null; then
  DOCKER_VERSION=$(docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
  add_json_field "docker" "true" "false"
  if [ -n "$DOCKER_VERSION" ]; then
    add_json_field "docker_version" "$DOCKER_VERSION" "true"
  else
    add_json_field "docker_version" "unknown" "true"
  fi
else
  add_json_field "docker" "false" "false"
fi

# =============================================================================
# PROXMOX SUPPORT
# =============================================================================
if command -v pvesh &>/dev/null; then
  PVE_VERSION=$(pveversion 2>/dev/null | grep -oP 'pve-manager/\K\S+' | head -1)
  add_json_field "proxmox" "true" "false"
  if [ -n "$PVE_VERSION" ]; then
    add_json_field "proxmox_version" "$PVE_VERSION" "true"
  else
    add_json_field "proxmox_version" "unknown" "true"
  fi
else
  add_json_field "proxmox" "false" "false"
fi

# =============================================================================
# GPU TELEMETRY
# =============================================================================
if command -v nvidia-smi &>/dev/null; then
  GPU_COUNT=$(nvidia-smi --list-gpus 2>/dev/null | wc -l)
  if [ "$GPU_COUNT" -gt 0 ]; then
    add_json_field "gpu" "true" "false"
    add_json_field "gpu_count" "$GPU_COUNT" "false"
    add_json_field "gpu_type" "nvidia" "true"
  else
    add_json_field "gpu" "\"detected_no_access\"" "false"
  fi
elif lspci 2>/dev/null | grep -i vga | grep -iq nvidia; then
  add_json_field "gpu" "\"detected_no_driver\"" "false"
  add_json_field "gpu_type" "nvidia" "true"
elif lspci 2>/dev/null | grep -i vga | grep -iq amd; then
  add_json_field "gpu" "\"detected_no_driver\"" "false"
  add_json_field "gpu_type" "amd" "true"
else
  add_json_field "gpu" "false" "false"
fi

# =============================================================================
# THERMAL SENSORS
# =============================================================================
if command -v sensors &>/dev/null && sensors -u &>/dev/null 2>&1; then
  add_json_field "sensors" "full" "true"
elif [ -d /sys/class/thermal/thermal_zone0 ]; then
  # Limited sensor access (e.g., unprivileged LXC)
  add_json_field "sensors" "limited" "true"
else
  add_json_field "sensors" "false" "false"
fi

# =============================================================================
# SMART (DISK HEALTH)
# =============================================================================
if command -v smartctl &>/dev/null; then
  # Check if we can actually access SMART data (needs root)
  if smartctl -i /dev/sda &>/dev/null 2>&1; then
    add_json_field "smart" "true" "false"
  else
    add_json_field "smart" "no_permission" "true"
  fi
else
  add_json_field "smart" "false" "false"
fi

# =============================================================================
# ZFS SUPPORT
# =============================================================================
if command -v zpool &>/dev/null; then
  add_json_field "zfs" "true" "false"
else
  add_json_field "zfs" "false" "false"
fi

# =============================================================================
# SYSTEMD (SERVICES)
# =============================================================================
if command -v systemctl &>/dev/null; then
  add_json_field "systemd" "true" "false"
else
  add_json_field "systemd" "false" "false"
fi

# =============================================================================
# CONTAINER TYPE DETECTION
# =============================================================================
if grep -q 'lxc.apparmor.profile' /proc/1/environ 2>/dev/null; then
  add_json_field "container_type" "lxc_unprivileged" "true"
elif [ -f /.dockerenv ]; then
  add_json_field "container_type" "docker" "true"
elif command -v systemd-detect-virt &>/dev/null; then
  VIRT_TYPE=$(systemd-detect-virt 2>/dev/null)
  if [ "$VIRT_TYPE" != "none" ] && [ -n "$VIRT_TYPE" ]; then
    add_json_field "container_type" "virtualized" "true"
    add_json_field "virt_type" "$VIRT_TYPE" "true"
  else
    add_json_field "container_type" "bare_metal" "true"
  fi
else
  add_json_field "container_type" "bare_metal" "true"
fi

# =============================================================================
# PACKAGE MANAGER
# =============================================================================
if command -v apt &>/dev/null; then
  add_json_field "package_manager" "apt" "true"
elif command -v yum &>/dev/null; then
  add_json_field "package_manager" "yum" "true"
elif command -v dnf &>/dev/null; then
  add_json_field "package_manager" "dnf" "true"
elif command -v pacman &>/dev/null; then
  add_json_field "package_manager" "pacman" "true"
elif command -v apk &>/dev/null; then
  add_json_field "package_manager" "apk" "true"
else
  add_json_field "package_manager" "unknown" "true"
fi

# =============================================================================
# PODMAN SUPPORT
# =============================================================================
if command -v podman &>/dev/null; then
  PODMAN_VERSION=$(podman --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
  add_json_field "podman" "true" "false"
  if [ -n "$PODMAN_VERSION" ]; then
    add_json_field "podman_version" "$PODMAN_VERSION" "true"
  else
    add_json_field "podman_version" "unknown" "true"
  fi
else
  add_json_field "podman" "false" "false"
fi

# =============================================================================
# NETWORK TOOLS
# =============================================================================
if command -v iperf3 &>/dev/null; then
  add_json_field "iperf3" "true" "false"
else
  add_json_field "iperf3" "false" "false"
fi

# =============================================================================
# OUTPUT
# =============================================================================
echo "{${JSON_FIELDS}}"

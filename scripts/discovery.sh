#!/bin/bash
# nodepulse Discovery Script
# Erkennt Node-Typ und Features

# Escape string for JSON (remove control characters, escape quotes/backslashes)
json_escape() {
    printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

echo "{"

# Virtualization
VIRT=$(systemd-detect-virt 2>/dev/null || echo "unknown")
echo "\"virtualization\": \"$VIRT\","

# Proxmox Host?
if command -v pveversion &>/dev/null; then
    PVE_VERSION=$(pveversion 2>/dev/null | head -1)
    echo "\"is_proxmox_host\": true,"
    echo "\"proxmox_version\": \"$(json_escape "$PVE_VERSION")\","

    # Cluster?
    if pvecm status &>/dev/null 2>&1; then
        CLUSTER_NAME=$(pvecm status 2>/dev/null | grep "Name:" | awk '{print $2}')
        CLUSTER_NODES=$(pvecm nodes 2>/dev/null | tail -n +2 | wc -l)
        echo "\"is_proxmox_cluster\": true,"
        echo "\"proxmox_cluster_name\": \"$CLUSTER_NAME\","
        echo "\"proxmox_cluster_nodes\": $CLUSTER_NODES,"
    else
        echo "\"is_proxmox_cluster\": false,"
    fi
else
    echo "\"is_proxmox_host\": false,"
fi

# Docker?
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    CONTAINER_COUNT=$(docker ps -aq 2>/dev/null | wc -l)
    echo "\"has_docker\": true,"
    echo "\"docker_version\": \"$DOCKER_VERSION\","
    echo "\"docker_containers\": $CONTAINER_COUNT,"
else
    echo "\"has_docker\": false,"
fi

# Podman?
if command -v podman &>/dev/null; then
    PODMAN_VERSION=$(podman version --format '{{.Version}}' 2>/dev/null || echo "unknown")
    echo "\"has_podman\": true,"
    echo "\"podman_version\": \"$PODMAN_VERSION\","
else
    echo "\"has_podman\": false,"
fi

# Raspberry Pi?
if [ -f /sys/firmware/devicetree/base/model ]; then
    PI_MODEL=$(tr -d '\0' < /sys/firmware/devicetree/base/model)
    echo "\"is_raspberry_pi\": true,"
    echo "\"raspberry_pi_model\": \"$(json_escape "$PI_MODEL")\","
else
    echo "\"is_raspberry_pi\": false,"
fi

# Architecture
ARCH=$(uname -m)
echo "\"arch\": \"$ARCH\","

# OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "\"os_id\": \"$(json_escape "$ID")\","
    echo "\"os_name\": \"$(json_escape "$PRETTY_NAME")\","
else
    echo "\"os_id\": \"unknown\","
    echo "\"os_name\": \"unknown\","
fi

# Systemd?
if command -v systemctl &>/dev/null; then
    echo "\"has_systemd\": true,"
else
    echo "\"has_systemd\": false,"
fi

# Hostname
echo "\"hostname\": \"$(json_escape "$(hostname)")\""

echo "}"

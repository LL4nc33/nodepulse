#!/bin/bash
# nodepulse Docker Collection Script
# Sammelt Container, Images, Volumes, Networks

# Check if Docker is available
if ! command -v docker &>/dev/null || ! docker info &>/dev/null 2>&1; then
    echo '{"error": "Docker not available or not running"}'
    exit 1
fi

echo "{"

# === CONTAINERS ===
echo '"containers": ['
FIRST=1
docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}|{{.CreatedAt}}' 2>/dev/null | while IFS='|' read -r id name image status state ports created; do
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi
    # Escape special characters in strings
    name=$(echo "$name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    image=$(echo "$image" | sed 's/\\/\\\\/g; s/"/\\"/g')
    status=$(echo "$status" | sed 's/\\/\\\\/g; s/"/\\"/g')
    ports=$(echo "$ports" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "  {\"id\": \"$id\", \"name\": \"$name\", \"image\": \"$image\", \"status\": \"$status\", \"state\": \"$state\", \"ports\": \"$ports\", \"created\": \"$created\"}"
done
echo "],"

# === IMAGES ===
echo '"images": ['
FIRST=1
docker images --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}' 2>/dev/null | while IFS='|' read -r id repo tag size created; do
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi
    # Convert size to bytes (approximate)
    size_bytes=0
    if echo "$size" | grep -qE '[0-9.]+GB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(echo "$size_num * 1073741824" | bc 2>/dev/null || echo "0")
    elif echo "$size" | grep -qE '[0-9.]+MB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(echo "$size_num * 1048576" | bc 2>/dev/null || echo "0")
    elif echo "$size" | grep -qE '[0-9.]+KB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(echo "$size_num * 1024" | bc 2>/dev/null || echo "0")
    fi
    size_bytes=${size_bytes%.*}
    repo=$(echo "$repo" | sed 's/\\/\\\\/g; s/"/\\"/g')
    tag=$(echo "$tag" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "  {\"id\": \"$id\", \"repository\": \"$repo\", \"tag\": \"$tag\", \"size\": \"$size\", \"size_bytes\": ${size_bytes:-0}, \"created\": \"$created\"}"
done
echo "],"

# === VOLUMES ===
echo '"volumes": ['
FIRST=1
docker volume ls --format '{{.Name}}|{{.Driver}}|{{.Mountpoint}}' 2>/dev/null | while IFS='|' read -r name driver mountpoint; do
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi
    # Check if volume is in use (quote name to prevent shell injection)
    in_use=0
    if docker ps -q --filter volume="$name" 2>/dev/null | grep -q .; then
        in_use=1
    fi
    name=$(echo "$name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    mountpoint=$(echo "$mountpoint" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "  {\"name\": \"$name\", \"driver\": \"$driver\", \"mountpoint\": \"$mountpoint\", \"in_use\": $in_use}"
done
echo "],"

# === NETWORKS ===
echo '"networks": ['
FIRST=1
docker network ls --format '{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}' 2>/dev/null | while IFS='|' read -r id name driver scope; do
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi
    name=$(echo "$name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "  {\"id\": \"$id\", \"name\": \"$name\", \"driver\": \"$driver\", \"scope\": \"$scope\"}"
done
echo "],"

# === SUMMARY ===
CONTAINER_COUNT=$(docker ps -aq 2>/dev/null | wc -l)
RUNNING_COUNT=$(docker ps -q 2>/dev/null | wc -l)
IMAGE_COUNT=$(docker images -q 2>/dev/null | wc -l)
VOLUME_COUNT=$(docker volume ls -q 2>/dev/null | wc -l)
NETWORK_COUNT=$(docker network ls -q 2>/dev/null | wc -l)

echo "\"summary\": {"
echo "  \"containers_total\": $CONTAINER_COUNT,"
echo "  \"containers_running\": $RUNNING_COUNT,"
echo "  \"images\": $IMAGE_COUNT,"
echo "  \"volumes\": $VOLUME_COUNT,"
echo "  \"networks\": $NETWORK_COUNT"
echo "}"

echo "}"

#!/bin/bash
# nodepulse Docker Collection Script
# Sammelt Container, Images, Volumes, Networks

# Escape string for JSON (remove control characters, escape quotes/backslashes)
json_escape() {
    printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# Check if Docker is available
if ! command -v docker &>/dev/null || ! docker info &>/dev/null 2>&1; then
    echo '{"error": "Docker not available or not running"}'
    exit 1
fi

echo "{"

# === CONTAINERS ===
echo '"containers": ['
FIRST=1
while IFS='|' read -r id name image status state ports created; do
    if [ -z "$id" ]; then continue; fi
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi
    # Escape all string fields
    name=$(json_escape "$name")
    image=$(json_escape "$image")
    status=$(json_escape "$status")
    state=$(json_escape "$state")
    ports=$(json_escape "$ports")
    created=$(json_escape "$created")
    echo "  {\"id\": \"$id\", \"name\": \"$name\", \"image\": \"$image\", \"status\": \"$status\", \"state\": \"$state\", \"ports\": \"$ports\", \"created\": \"$created\"}"
done < <(docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}|{{.CreatedAt}}' 2>/dev/null)
echo "],"

# === IMAGES ===
echo '"images": ['
FIRST=1
while IFS='|' read -r id repo tag size created; do
    if [ -z "$id" ]; then continue; fi
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi
    # Convert size to bytes (approximate)
    size_bytes=0
    if echo "$size" | grep -qE '[0-9.]+GB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(echo "$size_num * 1073741824" | bc 2>/dev/null | sed 's/^\./0./; s/^-\./-0./' || echo "0")
    elif echo "$size" | grep -qE '[0-9.]+MB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(echo "$size_num * 1048576" | bc 2>/dev/null | sed 's/^\./0./; s/^-\./-0./' || echo "0")
    elif echo "$size" | grep -qE '[0-9.]+KB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(echo "$size_num * 1024" | bc 2>/dev/null | sed 's/^\./0./; s/^-\./-0./' || echo "0")
    fi
    size_bytes=${size_bytes%.*}
    # Escape all string fields
    repo=$(json_escape "$repo")
    tag=$(json_escape "$tag")
    size=$(json_escape "$size")
    created=$(json_escape "$created")
    echo "  {\"id\": \"$id\", \"repository\": \"$repo\", \"tag\": \"$tag\", \"size\": \"$size\", \"size_bytes\": ${size_bytes:-0}, \"created\": \"$created\"}"
done < <(docker images --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}' 2>/dev/null)
echo "],"

# === VOLUMES ===
echo '"volumes": ['
FIRST=1
while IFS='|' read -r name driver mountpoint; do
    if [ -z "$name" ]; then continue; fi
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi
    # Check if volume is in use
    in_use=0
    if docker ps -q --filter volume="$name" 2>/dev/null | grep -q .; then
        in_use=1
    fi
    # Escape all string fields
    name=$(json_escape "$name")
    driver=$(json_escape "$driver")
    mountpoint=$(json_escape "$mountpoint")
    echo "  {\"name\": \"$name\", \"driver\": \"$driver\", \"mountpoint\": \"$mountpoint\", \"in_use\": $in_use}"
done < <(docker volume ls --format '{{.Name}}|{{.Driver}}|{{.Mountpoint}}' 2>/dev/null)
echo "],"

# === NETWORKS ===
echo '"networks": ['
FIRST=1
while IFS='|' read -r id name driver scope; do
    if [ -z "$id" ]; then continue; fi
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi
    # Escape all string fields
    name=$(json_escape "$name")
    driver=$(json_escape "$driver")
    scope=$(json_escape "$scope")
    echo "  {\"id\": \"$id\", \"name\": \"$name\", \"driver\": \"$driver\", \"scope\": \"$scope\"}"
done < <(docker network ls --format '{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}' 2>/dev/null)
echo "],"

# === SUMMARY ===
CONTAINER_COUNT=$(docker ps -aq 2>/dev/null | wc -l)
RUNNING_COUNT=$(docker ps -q 2>/dev/null | wc -l)
IMAGE_COUNT=$(docker images -q 2>/dev/null | wc -l)
VOLUME_COUNT=$(docker volume ls -q 2>/dev/null | wc -l)
NETWORK_COUNT=$(docker network ls -q 2>/dev/null | wc -l)

echo "\"summary\": {"
echo "  \"containers_total\": ${CONTAINER_COUNT:-0},"
echo "  \"containers_running\": ${RUNNING_COUNT:-0},"
echo "  \"images\": ${IMAGE_COUNT:-0},"
echo "  \"volumes\": ${VOLUME_COUNT:-0},"
echo "  \"networks\": ${NETWORK_COUNT:-0}"
echo "}"

echo "}"

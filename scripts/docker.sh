#!/bin/bash
# nodepulse Docker Collection Script
# Sammelt Container, Images, Volumes, Networks
# Robuste JSON-Ausgabe mit korrektem Escaping

# Escape string for JSON - handles all special characters
json_escape() {
    local str="$1"
    printf '%s' "$str" | \
        tr -d '\000-\011\013-\037' | \
        sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | \
        tr '\n' ' '
}

# Safe number output (returns 0 if empty/invalid)
safe_num() {
    local val="$1"
    if [ -z "$val" ] || ! [[ "$val" =~ ^[0-9]+$ ]]; then
        echo "0"
    else
        echo "$val"
    fi
}

# Check if Docker is available
if ! command -v docker &>/dev/null || ! docker info &>/dev/null 2>&1; then
    echo '{"error": "Docker not available or not running"}'
    exit 1
fi

echo "{"

# === CONTAINERS ===
echo '"containers": ['
CONTAINER_LIST=""
while IFS='|' read -r id name image status state ports created; do
    [ -z "$id" ] && continue

    [ -n "$CONTAINER_LIST" ] && CONTAINER_LIST="$CONTAINER_LIST,"
    CONTAINER_LIST="$CONTAINER_LIST{\"id\": \"$(json_escape "$id")\", \"name\": \"$(json_escape "$name")\", \"image\": \"$(json_escape "$image")\", \"status\": \"$(json_escape "$status")\", \"state\": \"$(json_escape "$state")\", \"ports\": \"$(json_escape "$ports")\", \"created\": \"$(json_escape "$created")\"}"
done < <(docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}|{{.CreatedAt}}' 2>/dev/null)
echo "$CONTAINER_LIST"
echo "],"

# === IMAGES ===
echo '"images": ['
IMAGE_LIST=""
while IFS='|' read -r id repo tag size created; do
    [ -z "$id" ] && continue

    # Convert size to bytes (approximate) - use awk
    size_bytes=0
    if echo "$size" | grep -qE '[0-9.]+GB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(awk "BEGIN {printf \"%.0f\", $size_num * 1073741824}" 2>/dev/null)
    elif echo "$size" | grep -qE '[0-9.]+MB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(awk "BEGIN {printf \"%.0f\", $size_num * 1048576}" 2>/dev/null)
    elif echo "$size" | grep -qE '[0-9.]+KB'; then
        size_num=$(echo "$size" | grep -oE '[0-9.]+')
        size_bytes=$(awk "BEGIN {printf \"%.0f\", $size_num * 1024}" 2>/dev/null)
    fi

    [ -n "$IMAGE_LIST" ] && IMAGE_LIST="$IMAGE_LIST,"
    IMAGE_LIST="$IMAGE_LIST{\"id\": \"$(json_escape "$id")\", \"repository\": \"$(json_escape "$repo")\", \"tag\": \"$(json_escape "$tag")\", \"size\": \"$(json_escape "$size")\", \"size_bytes\": $(safe_num "$size_bytes"), \"created\": \"$(json_escape "$created")\"}"
done < <(docker images --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}' 2>/dev/null)
echo "$IMAGE_LIST"
echo "],"

# === VOLUMES ===
echo '"volumes": ['
VOLUME_LIST=""
while IFS='|' read -r name driver mountpoint; do
    [ -z "$name" ] && continue

    # Check if volume is in use
    in_use=0
    if docker ps -q --filter volume="$name" 2>/dev/null | grep -q .; then
        in_use=1
    fi

    [ -n "$VOLUME_LIST" ] && VOLUME_LIST="$VOLUME_LIST,"
    VOLUME_LIST="$VOLUME_LIST{\"name\": \"$(json_escape "$name")\", \"driver\": \"$(json_escape "$driver")\", \"mountpoint\": \"$(json_escape "$mountpoint")\", \"in_use\": $in_use}"
done < <(docker volume ls --format '{{.Name}}|{{.Driver}}|{{.Mountpoint}}' 2>/dev/null)
echo "$VOLUME_LIST"
echo "],"

# === NETWORKS ===
echo '"networks": ['
NETWORK_LIST=""
while IFS='|' read -r id name driver scope; do
    [ -z "$id" ] && continue

    [ -n "$NETWORK_LIST" ] && NETWORK_LIST="$NETWORK_LIST,"
    NETWORK_LIST="$NETWORK_LIST{\"id\": \"$(json_escape "$id")\", \"name\": \"$(json_escape "$name")\", \"driver\": \"$(json_escape "$driver")\", \"scope\": \"$(json_escape "$scope")\"}"
done < <(docker network ls --format '{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}' 2>/dev/null)
echo "$NETWORK_LIST"
echo "],"

# === SUMMARY ===
CONTAINER_COUNT=$(docker ps -aq 2>/dev/null | wc -l)
RUNNING_COUNT=$(docker ps -q 2>/dev/null | wc -l)
IMAGE_COUNT=$(docker images -q 2>/dev/null | wc -l)
VOLUME_COUNT=$(docker volume ls -q 2>/dev/null | wc -l)
NETWORK_COUNT=$(docker network ls -q 2>/dev/null | wc -l)

echo "\"summary\": {"
echo "  \"containers_total\": $(safe_num "$CONTAINER_COUNT"),"
echo "  \"containers_running\": $(safe_num "$RUNNING_COUNT"),"
echo "  \"images\": $(safe_num "$IMAGE_COUNT"),"
echo "  \"volumes\": $(safe_num "$VOLUME_COUNT"),"
echo "  \"networks\": $(safe_num "$NETWORK_COUNT")"
echo "}"

echo "}"

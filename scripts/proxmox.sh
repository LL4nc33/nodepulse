#!/bin/bash
# nodepulse Proxmox Collection Script
# Sammelt VMs, CTs, Storage, Snapshots
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

# Check if this is a Proxmox host
if ! command -v pveversion &>/dev/null; then
    echo '{"error": "Not a Proxmox host"}'
    exit 1
fi

echo "{"

# === VMS ===
echo '"vms": ['
VM_LIST=""
while read -r vmid name status mem bootdisk pid; do
    [ -z "$vmid" ] && continue

    # Get VM config for more details
    CONFIG=$(qm config "$vmid" 2>/dev/null)
    CORES=$(echo "$CONFIG" | grep -E "^cores:" | awk '{print $2}')
    MEMORY=$(echo "$CONFIG" | grep -E "^memory:" | awk '{print $2}')
    TEMPLATE=$(echo "$CONFIG" | grep -E "^template:" | awk '{print $2}')

    # Convert memory from MB to bytes
    MEM_BYTES=0
    if [ -n "$MEMORY" ] && [[ "$MEMORY" =~ ^[0-9]+$ ]]; then
        MEM_BYTES=$((MEMORY * 1048576))
    fi

    # Convert bootdisk size (e.g., "32.00 GiB" -> bytes)
    DISK_BYTES=0
    if echo "$bootdisk" | grep -qE '[0-9.]+'; then
        DISK_NUM=$(echo "$bootdisk" | grep -oE '[0-9.]+' | head -1)
        if echo "$bootdisk" | grep -qi 'g'; then
            DISK_BYTES=$(awk "BEGIN {printf \"%.0f\", $DISK_NUM * 1073741824}" 2>/dev/null)
        elif echo "$bootdisk" | grep -qi 't'; then
            DISK_BYTES=$(awk "BEGIN {printf \"%.0f\", $DISK_NUM * 1099511627776}" 2>/dev/null)
        fi
    fi

    IS_TEMPLATE=0
    if [ "$TEMPLATE" = "1" ]; then
        IS_TEMPLATE=1
    fi

    [ -n "$VM_LIST" ] && VM_LIST="$VM_LIST,"
    VM_LIST="$VM_LIST{\"vmid\": $(safe_num "$vmid"), \"name\": \"$(json_escape "$name")\", \"status\": \"$(json_escape "$status")\", \"cpu_cores\": $(safe_num "$CORES"), \"memory_bytes\": $(safe_num "$MEM_BYTES"), \"disk_bytes\": $(safe_num "$DISK_BYTES"), \"template\": $IS_TEMPLATE}"
done < <(qm list 2>/dev/null | tail -n +2)
echo "$VM_LIST"
echo "],"

# === CONTAINERS (LXC) ===
echo '"cts": ['
CT_LIST=""
while read -r ctid status lock name; do
    [ -z "$ctid" ] && continue

    # Get CT config for more details
    CONFIG=$(pct config "$ctid" 2>/dev/null)
    CORES=$(echo "$CONFIG" | grep -E "^cores:" | awk '{print $2}')
    MEMORY=$(echo "$CONFIG" | grep -E "^memory:" | awk '{print $2}')
    ROOTFS=$(echo "$CONFIG" | grep -E "^rootfs:" | awk '{print $2}')
    TEMPLATE=$(echo "$CONFIG" | grep -E "^template:" | awk '{print $2}')

    # Convert memory from MB to bytes
    MEM_BYTES=0
    if [ -n "$MEMORY" ] && [[ "$MEMORY" =~ ^[0-9]+$ ]]; then
        MEM_BYTES=$((MEMORY * 1048576))
    fi

    # Extract disk size from rootfs (e.g., "local-lvm:vm-100-disk-0,size=8G")
    DISK_BYTES=0
    if echo "$ROOTFS" | grep -qE 'size=[0-9]+'; then
        DISK_SIZE=$(echo "$ROOTFS" | grep -oE 'size=[0-9]+[GTM]?' | sed 's/size=//')
        DISK_NUM=$(echo "$DISK_SIZE" | grep -oE '[0-9]+')
        if echo "$DISK_SIZE" | grep -qi 'g'; then
            DISK_BYTES=$((DISK_NUM * 1073741824))
        elif echo "$DISK_SIZE" | grep -qi 't'; then
            DISK_BYTES=$((DISK_NUM * 1099511627776))
        elif echo "$DISK_SIZE" | grep -qi 'm'; then
            DISK_BYTES=$((DISK_NUM * 1048576))
        else
            DISK_BYTES=$((DISK_NUM * 1073741824))
        fi
    fi

    IS_TEMPLATE=0
    if [ "$TEMPLATE" = "1" ]; then
        IS_TEMPLATE=1
    fi

    [ -n "$CT_LIST" ] && CT_LIST="$CT_LIST,"
    CT_LIST="$CT_LIST{\"ctid\": $(safe_num "$ctid"), \"name\": \"$(json_escape "$name")\", \"status\": \"$(json_escape "$status")\", \"cpu_cores\": $(safe_num "$CORES"), \"memory_bytes\": $(safe_num "$MEM_BYTES"), \"disk_bytes\": $(safe_num "$DISK_BYTES"), \"template\": $IS_TEMPLATE}"
done < <(pct list 2>/dev/null | tail -n +2)
echo "$CT_LIST"
echo "],"

# === STORAGE ===
echo '"storage": ['
STOR_LIST=""
while read -r name type status total used available percent; do
    [ -z "$name" ] && continue

    # Convert KB to bytes (pvesm status outputs in KB)
    TOTAL_BYTES=0
    USED_BYTES=0
    AVAIL_BYTES=0

    if [ -n "$total" ] && [[ "$total" =~ ^[0-9]+$ ]]; then
        TOTAL_BYTES=$((total * 1024))
    fi
    if [ -n "$used" ] && [[ "$used" =~ ^[0-9]+$ ]]; then
        USED_BYTES=$((used * 1024))
    fi
    if [ -n "$available" ] && [[ "$available" =~ ^[0-9]+$ ]]; then
        AVAIL_BYTES=$((available * 1024))
    fi

    [ -n "$STOR_LIST" ] && STOR_LIST="$STOR_LIST,"
    STOR_LIST="$STOR_LIST{\"name\": \"$(json_escape "$name")\", \"type\": \"$(json_escape "$type")\", \"status\": \"$(json_escape "$status")\", \"total_bytes\": $(safe_num "$TOTAL_BYTES"), \"used_bytes\": $(safe_num "$USED_BYTES"), \"available_bytes\": $(safe_num "$AVAIL_BYTES")}"
done < <(pvesm status 2>/dev/null | tail -n +2)
echo "$STOR_LIST"
echo "],"

# === SNAPSHOTS ===
echo '"snapshots": ['
SNAP_LIST=""

# VM Snapshots
while read -r vmid name status mem bootdisk pid; do
    [ -z "$vmid" ] && continue

    while IFS= read -r line; do
        # Skip empty lines and current state
        [ -z "$line" ] && continue
        echo "$line" | grep -q "current" && continue

        # Parse snapshot line (format: "-> snapname description" or "`-> snapname description")
        SNAP_NAME=$(echo "$line" | sed "s/^['\`]*->//" | awk '{print $1}')
        [ -z "$SNAP_NAME" ] && continue

        # Get description (everything after snap name)
        DESCRIPTION=$(echo "$line" | sed "s/^['\`]*->//" | sed "s/^$SNAP_NAME//" | xargs)

        [ -n "$SNAP_LIST" ] && SNAP_LIST="$SNAP_LIST,"
        SNAP_LIST="$SNAP_LIST{\"vmid\": $(safe_num "$vmid"), \"vm_type\": \"vm\", \"snap_name\": \"$(json_escape "$SNAP_NAME")\", \"description\": \"$(json_escape "$DESCRIPTION")\"}"
    done < <(qm listsnapshot "$vmid" 2>/dev/null)
done < <(qm list 2>/dev/null | tail -n +2)

# CT Snapshots
while read -r ctid status lock name; do
    [ -z "$ctid" ] && continue

    while IFS= read -r line; do
        # Skip empty lines and current state
        [ -z "$line" ] && continue
        echo "$line" | grep -q "current" && continue

        # Parse snapshot line
        SNAP_NAME=$(echo "$line" | sed "s/^['\`]*->//" | awk '{print $1}')
        [ -z "$SNAP_NAME" ] && continue

        DESCRIPTION=$(echo "$line" | sed "s/^['\`]*->//" | sed "s/^$SNAP_NAME//" | xargs)

        [ -n "$SNAP_LIST" ] && SNAP_LIST="$SNAP_LIST,"
        SNAP_LIST="$SNAP_LIST{\"vmid\": $(safe_num "$ctid"), \"vm_type\": \"ct\", \"snap_name\": \"$(json_escape "$SNAP_NAME")\", \"description\": \"$(json_escape "$DESCRIPTION")\"}"
    done < <(pct listsnapshot "$ctid" 2>/dev/null)
done < <(pct list 2>/dev/null | tail -n +2)

echo "$SNAP_LIST"
echo "],"

# === SUMMARY ===
VM_COUNT=$(qm list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
VM_RUNNING=$(qm list 2>/dev/null | grep -c "running" 2>/dev/null || echo 0)
CT_COUNT=$(pct list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
CT_RUNNING=$(pct list 2>/dev/null | grep -c "running" 2>/dev/null || echo 0)
STORAGE_COUNT=$(pvesm status 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')

echo "\"summary\": {"
echo "  \"vms_total\": $(safe_num "$VM_COUNT"),"
echo "  \"vms_running\": $(safe_num "$VM_RUNNING"),"
echo "  \"cts_total\": $(safe_num "$CT_COUNT"),"
echo "  \"cts_running\": $(safe_num "$CT_RUNNING"),"
echo "  \"storage_count\": $(safe_num "$STORAGE_COUNT")"
echo "}"

echo "}"

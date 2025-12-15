#!/bin/bash
# nodepulse Proxmox Collection Script
# Sammelt VMs, CTs, Storage, Snapshots

# Escape string for JSON (remove control characters, escape quotes/backslashes)
json_escape() {
    printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# Check if this is a Proxmox host
if ! command -v pveversion &>/dev/null; then
    echo '{"error": "Not a Proxmox host"}'
    exit 1
fi

echo "{"

# === VMS ===
echo '"vms": ['
FIRST=1
while read -r vmid name status mem bootdisk pid; do
    if [ -z "$vmid" ]; then continue; fi
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi

    # Get VM config for more details
    CONFIG=$(qm config "$vmid" 2>/dev/null)
    CORES=$(echo "$CONFIG" | grep -E "^cores:" | awk '{print $2}')
    MEMORY=$(echo "$CONFIG" | grep -E "^memory:" | awk '{print $2}')
    TEMPLATE=$(echo "$CONFIG" | grep -E "^template:" | awk '{print $2}')

    # Convert memory from MB to bytes
    MEM_BYTES=0
    if [ -n "$MEMORY" ]; then
        MEM_BYTES=$((MEMORY * 1048576))
    fi

    # Convert bootdisk size (e.g., "32.00 GiB" -> bytes)
    DISK_BYTES=0
    if echo "$bootdisk" | grep -qE '[0-9.]+'; then
        DISK_NUM=$(echo "$bootdisk" | grep -oE '[0-9.]+' | head -1)
        if echo "$bootdisk" | grep -qi 'g'; then
            DISK_BYTES=$(echo "$DISK_NUM * 1073741824" | bc 2>/dev/null | sed 's/^\./0./; s/^-\./-0./')
        elif echo "$bootdisk" | grep -qi 't'; then
            DISK_BYTES=$(echo "$DISK_NUM * 1099511627776" | bc 2>/dev/null | sed 's/^\./0./; s/^-\./-0./')
        fi
    fi
    # Remove decimal part and ensure valid number
    DISK_BYTES=${DISK_BYTES%.*}
    DISK_BYTES=${DISK_BYTES:-0}
    if ! [[ "$DISK_BYTES" =~ ^[0-9]+$ ]]; then DISK_BYTES=0; fi

    # Escape name for JSON
    name=$(json_escape "$name")
    status=$(json_escape "$status")

    IS_TEMPLATE=0
    if [ "$TEMPLATE" = "1" ]; then
        IS_TEMPLATE=1
    fi

    # Ensure all numeric values are valid
    CORES=${CORES:-1}
    if ! [[ "$CORES" =~ ^[0-9]+$ ]]; then CORES=1; fi
    MEM_BYTES=${MEM_BYTES:-0}
    if ! [[ "$MEM_BYTES" =~ ^[0-9]+$ ]]; then MEM_BYTES=0; fi

    echo "  {\"vmid\": $vmid, \"name\": \"$name\", \"status\": \"$status\", \"cpu_cores\": $CORES, \"memory_bytes\": $MEM_BYTES, \"disk_bytes\": $DISK_BYTES, \"template\": $IS_TEMPLATE}"
done < <(qm list 2>/dev/null | tail -n +2)
echo "],"

# === CONTAINERS (LXC) ===
echo '"cts": ['
FIRST=1
while read -r ctid status lock name; do
    if [ -z "$ctid" ]; then continue; fi
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi

    # Get CT config for more details
    CONFIG=$(pct config "$ctid" 2>/dev/null)
    CORES=$(echo "$CONFIG" | grep -E "^cores:" | awk '{print $2}')
    MEMORY=$(echo "$CONFIG" | grep -E "^memory:" | awk '{print $2}')
    ROOTFS=$(echo "$CONFIG" | grep -E "^rootfs:" | awk '{print $2}')
    TEMPLATE=$(echo "$CONFIG" | grep -E "^template:" | awk '{print $2}')

    # Convert memory from MB to bytes
    MEM_BYTES=0
    if [ -n "$MEMORY" ]; then
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
    # Ensure DISK_BYTES is valid
    DISK_BYTES=${DISK_BYTES:-0}
    if ! [[ "$DISK_BYTES" =~ ^[0-9]+$ ]]; then DISK_BYTES=0; fi

    # Escape name for JSON
    name=$(json_escape "$name")
    status=$(json_escape "$status")

    IS_TEMPLATE=0
    if [ "$TEMPLATE" = "1" ]; then
        IS_TEMPLATE=1
    fi

    # Ensure all numeric values are valid
    CORES=${CORES:-1}
    if ! [[ "$CORES" =~ ^[0-9]+$ ]]; then CORES=1; fi
    MEM_BYTES=${MEM_BYTES:-0}
    if ! [[ "$MEM_BYTES" =~ ^[0-9]+$ ]]; then MEM_BYTES=0; fi

    echo "  {\"ctid\": $ctid, \"name\": \"$name\", \"status\": \"$status\", \"cpu_cores\": $CORES, \"memory_bytes\": $MEM_BYTES, \"disk_bytes\": $DISK_BYTES, \"template\": $IS_TEMPLATE}"
done < <(pct list 2>/dev/null | tail -n +2)
echo "],"

# === STORAGE ===
echo '"storage": ['
FIRST=1
while read -r name type status total used available percent; do
    if [ -z "$name" ]; then continue; fi
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        echo ","
    fi

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

    # Escape for JSON
    name=$(json_escape "$name")
    type=$(json_escape "$type")
    status=$(json_escape "$status")

    # Ensure numeric values are valid
    TOTAL_BYTES=${TOTAL_BYTES:-0}
    USED_BYTES=${USED_BYTES:-0}
    AVAIL_BYTES=${AVAIL_BYTES:-0}

    echo "  {\"name\": \"$name\", \"type\": \"$type\", \"status\": \"$status\", \"total_bytes\": $TOTAL_BYTES, \"used_bytes\": $USED_BYTES, \"available_bytes\": $AVAIL_BYTES}"
done < <(pvesm status 2>/dev/null | tail -n +2)
echo "],"

# === SNAPSHOTS ===
# Collect all snapshots first to handle comma placement correctly
echo '"snapshots": ['
SNAPSHOTS=""

# VM Snapshots
while read -r vmid name status mem bootdisk pid; do
    if [ -z "$vmid" ]; then continue; fi

    while read -r line; do
        # Skip empty lines and current state
        if [ -z "$line" ] || echo "$line" | grep -q "current"; then continue; fi

        # Parse snapshot line (format: "-> snapname description" or "`-> snapname description")
        SNAP_NAME=$(echo "$line" | sed "s/^['\`]*->//" | awk '{print $1}')
        if [ -z "$SNAP_NAME" ]; then continue; fi

        # Get description (everything after snap name)
        DESCRIPTION=$(echo "$line" | sed "s/^['\`]*->//" | sed "s/^$SNAP_NAME//" | xargs)

        # Escape for JSON
        SNAP_NAME=$(json_escape "$SNAP_NAME")
        DESCRIPTION=$(json_escape "$DESCRIPTION")

        if [ -n "$SNAPSHOTS" ]; then
            SNAPSHOTS="$SNAPSHOTS,"$'\n'
        fi
        SNAPSHOTS="$SNAPSHOTS  {\"vmid\": $vmid, \"vm_type\": \"vm\", \"snap_name\": \"$SNAP_NAME\", \"description\": \"$DESCRIPTION\"}"
    done < <(qm listsnapshot "$vmid" 2>/dev/null)
done < <(qm list 2>/dev/null | tail -n +2)

# CT Snapshots
while read -r ctid status lock name; do
    if [ -z "$ctid" ]; then continue; fi

    while read -r line; do
        # Skip empty lines and current state
        if [ -z "$line" ] || echo "$line" | grep -q "current"; then continue; fi

        # Parse snapshot line
        SNAP_NAME=$(echo "$line" | sed "s/^['\`]*->//" | awk '{print $1}')
        if [ -z "$SNAP_NAME" ]; then continue; fi

        DESCRIPTION=$(echo "$line" | sed "s/^['\`]*->//" | sed "s/^$SNAP_NAME//" | xargs)

        # Escape for JSON
        SNAP_NAME=$(json_escape "$SNAP_NAME")
        DESCRIPTION=$(json_escape "$DESCRIPTION")

        if [ -n "$SNAPSHOTS" ]; then
            SNAPSHOTS="$SNAPSHOTS,"$'\n'
        fi
        SNAPSHOTS="$SNAPSHOTS  {\"vmid\": $ctid, \"vm_type\": \"ct\", \"snap_name\": \"$SNAP_NAME\", \"description\": \"$DESCRIPTION\"}"
    done < <(pct listsnapshot "$ctid" 2>/dev/null)
done < <(pct list 2>/dev/null | tail -n +2)

# Output all snapshots
if [ -n "$SNAPSHOTS" ]; then
    echo "$SNAPSHOTS"
fi
echo "],"

# === SUMMARY ===
VM_COUNT=$(qm list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
VM_RUNNING=$(qm list 2>/dev/null | grep -c "running" 2>/dev/null || echo 0)
CT_COUNT=$(pct list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
CT_RUNNING=$(pct list 2>/dev/null | grep -c "running" 2>/dev/null || echo 0)
STORAGE_COUNT=$(pvesm status 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')

# Ensure all counts are valid numbers
VM_COUNT=${VM_COUNT:-0}; if ! [[ "$VM_COUNT" =~ ^[0-9]+$ ]]; then VM_COUNT=0; fi
VM_RUNNING=${VM_RUNNING:-0}; if ! [[ "$VM_RUNNING" =~ ^[0-9]+$ ]]; then VM_RUNNING=0; fi
CT_COUNT=${CT_COUNT:-0}; if ! [[ "$CT_COUNT" =~ ^[0-9]+$ ]]; then CT_COUNT=0; fi
CT_RUNNING=${CT_RUNNING:-0}; if ! [[ "$CT_RUNNING" =~ ^[0-9]+$ ]]; then CT_RUNNING=0; fi
STORAGE_COUNT=${STORAGE_COUNT:-0}; if ! [[ "$STORAGE_COUNT" =~ ^[0-9]+$ ]]; then STORAGE_COUNT=0; fi

echo "\"summary\": {"
echo "  \"vms_total\": $VM_COUNT,"
echo "  \"vms_running\": $VM_RUNNING,"
echo "  \"cts_total\": $CT_COUNT,"
echo "  \"cts_running\": $CT_RUNNING,"
echo "  \"storage_count\": $STORAGE_COUNT"
echo "}"

echo "}"

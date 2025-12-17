#!/bin/bash
# nodepulse Hardware Script
# Sammelt Hardware-Infos
# Robuste JSON-Ausgabe mit korrektem Escaping
# Funktioniert auf: Raspberry Pi, Proxmox, VMs, Bare Metal
# Keine Extra-Pakete noetig - nutzt /sys und /proc

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

# Safe float output (returns null if empty/invalid)
safe_float() {
    local val="$1"
    if [ -z "$val" ]; then
        echo "null"
    elif [[ "$val" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        echo "$val"
    else
        echo "null"
    fi
}

echo "{"

# === SYSTEM ===
echo "\"system\": {"
if command -v dmidecode &>/dev/null && [ "$(id -u)" -eq 0 ]; then
    MANUFACTURER=$(dmidecode -s system-manufacturer 2>/dev/null | head -1 || echo "")
    PRODUCT=$(dmidecode -s system-product-name 2>/dev/null | head -1 || echo "")
    SERIAL=$(dmidecode -s system-serial-number 2>/dev/null | head -1 || echo "")
    BIOS=$(dmidecode -s bios-version 2>/dev/null | head -1 || echo "")
    echo "  \"manufacturer\": \"$(json_escape "$MANUFACTURER")\","
    echo "  \"product\": \"$(json_escape "$PRODUCT")\","
    echo "  \"serial\": \"$(json_escape "$SERIAL")\","
    echo "  \"bios_version\": \"$(json_escape "$BIOS")\","
else
    echo "  \"manufacturer\": null,"
    echo "  \"product\": null,"
    echo "  \"serial\": null,"
    echo "  \"bios_version\": null,"
fi
if [ -d /sys/firmware/efi ]; then
    echo "  \"boot_mode\": \"UEFI\""
else
    echo "  \"boot_mode\": \"Legacy\""
fi
echo "},"

# === CPU ===
echo "\"cpu\": {"
CPU_MODEL=$(grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs || echo "unknown")
CPU_VENDOR=$(grep 'vendor_id' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs || echo "unknown")
CPU_CORES=$(nproc --all 2>/dev/null || echo 1)
CPU_THREADS=$(grep -c processor /proc/cpuinfo 2>/dev/null || echo 1)
CPU_MAX_MHZ=$(lscpu 2>/dev/null | grep 'CPU max MHz' | awk '{print $4}')
CPU_ARCH=$(uname -m)
VIRT_FLAG=$(grep -oE '(vmx|svm)' /proc/cpuinfo 2>/dev/null | head -1 || echo "none")

echo "  \"model\": \"$(json_escape "$CPU_MODEL")\","
echo "  \"vendor\": \"$(json_escape "$CPU_VENDOR")\","
echo "  \"cores\": $(safe_num "$CPU_CORES"),"
echo "  \"threads\": $(safe_num "$CPU_THREADS"),"
if [ -n "$CPU_MAX_MHZ" ] && [[ "$CPU_MAX_MHZ" =~ ^[0-9.]+$ ]]; then
    echo "  \"max_mhz\": $CPU_MAX_MHZ,"
else
    echo "  \"max_mhz\": null,"
fi
echo "  \"arch\": \"$(json_escape "$CPU_ARCH")\","
echo "  \"virt_support\": \"$(json_escape "$VIRT_FLAG")\","

# Cache
L1=$(lscpu 2>/dev/null | grep 'L1d cache' | awk '{print $3}' || echo "")
L2=$(lscpu 2>/dev/null | grep 'L2 cache' | awk '{print $3}' || echo "")
L3=$(lscpu 2>/dev/null | grep 'L3 cache' | awk '{print $3}' || echo "")
echo "  \"cache_l1\": \"$(json_escape "$L1")\","
echo "  \"cache_l2\": \"$(json_escape "$L2")\","
echo "  \"cache_l3\": \"$(json_escape "$L3")\""
echo "},"

# === MEMORY ===
echo "\"memory\": {"
MEM_TOTAL=$(free -b 2>/dev/null | awk '/Mem:/ {print $2}' || echo 0)
SWAP_TOTAL=$(free -b 2>/dev/null | awk '/Swap:/ {print $2}' || echo 0)
echo "  \"total_bytes\": $(safe_num "$MEM_TOTAL"),"
echo "  \"swap_total_bytes\": $(safe_num "$SWAP_TOTAL")"

if command -v dmidecode &>/dev/null && [ "$(id -u)" -eq 0 ]; then
    RAM_TYPE=$(dmidecode -t memory 2>/dev/null | grep -m1 "Type:" | grep -v "Error" | awk '{print $2}' || echo "")
    RAM_SPEED=$(dmidecode -t memory 2>/dev/null | grep -m1 "Speed:" | grep -v "Unknown" | awk '{print $2}' || echo "")
    if [ -n "$RAM_TYPE" ]; then
        echo "  ,\"type\": \"$(json_escape "$RAM_TYPE")\""
    fi
    if [ -n "$RAM_SPEED" ] && [[ "$RAM_SPEED" =~ ^[0-9]+$ ]]; then
        echo "  ,\"speed_mhz\": $RAM_SPEED"
    fi
fi
echo "},"

# === STORAGE ===
echo "\"disks\": ["
DISK_LIST=""
HAS_SMARTCTL=0
if command -v smartctl &>/dev/null; then
    HAS_SMARTCTL=1
fi

if command -v lsblk &>/dev/null; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        NAME=$(echo "$line" | awk '{print $1}')
        SIZE=$(echo "$line" | awk '{print $2}')
        TYPE=$(echo "$line" | awk '{print $3}')
        MODEL=$(echo "$line" | awk '{$1=$2=$3=$4=$5=$6=""; print $0}' | xargs)
        ROTA=$(echo "$line" | awk '{print $4}')
        TRAN=$(echo "$line" | awk '{print $5}')

        [ "$TYPE" != "disk" ] && continue
        [ -z "$NAME" ] && continue

        IS_SSD=0
        DISK_TYPE="HDD"
        if [ "$ROTA" = "0" ]; then
            IS_SSD=1
            if [ "$TRAN" = "nvme" ]; then
                DISK_TYPE="NVMe"
            else
                DISK_TYPE="SSD"
            fi
        fi

        # Try to get serial from /sys (no smartctl needed)
        SERIAL=""
        if [ -f "/sys/block/$NAME/device/serial" ]; then
            SERIAL=$(cat "/sys/block/$NAME/device/serial" 2>/dev/null | xargs)
        elif [ -f "/sys/block/$NAME/device/wwid" ]; then
            SERIAL=$(cat "/sys/block/$NAME/device/wwid" 2>/dev/null | xargs)
        fi

        # SMART data (only if smartctl available and root)
        SMART_STATUS="null"
        SMART_HEALTH="null"
        POWER_ON_HOURS="null"
        DISK_TEMP="null"

        if [ "$HAS_SMARTCTL" -eq 1 ] && [ "$(id -u)" -eq 0 ]; then
            SMART_OUT=$(smartctl -H -A "/dev/$NAME" 2>/dev/null)
            if [ -n "$SMART_OUT" ]; then
                # Health status
                if echo "$SMART_OUT" | grep -q "PASSED"; then
                    SMART_STATUS="\"passed\""
                    SMART_HEALTH="\"Healthy\""
                elif echo "$SMART_OUT" | grep -q "FAILED"; then
                    SMART_STATUS="\"failed\""
                    SMART_HEALTH="\"Failed\""
                fi

                # Power-On Hours (ID 9 for SATA, or search for Power On Hours)
                POH=$(echo "$SMART_OUT" | grep -E "Power_On_Hours|Power On Hours" | awk '{print $NF}' | grep -oE '[0-9]+' | head -1)
                if [ -n "$POH" ] && [ "$POH" -gt 0 ] 2>/dev/null; then
                    POWER_ON_HOURS="$POH"
                fi

                # Temperature (ID 194 for SATA, or search for Temperature)
                TEMP=$(echo "$SMART_OUT" | grep -iE "Temperature_Celsius|Temperature:" | awk '{print $NF}' | grep -oE '[0-9]+' | head -1)
                if [ -n "$TEMP" ] && [ "$TEMP" -gt 0 ] && [ "$TEMP" -lt 150 ] 2>/dev/null; then
                    DISK_TEMP="$TEMP"
                fi

                # Serial from smartctl if not found in /sys
                if [ -z "$SERIAL" ]; then
                    SERIAL=$(smartctl -i "/dev/$NAME" 2>/dev/null | grep -i "Serial Number:" | awk '{print $NF}')
                fi
            fi
        fi

        [ -n "$DISK_LIST" ] && DISK_LIST="$DISK_LIST,"
        DISK_LIST="$DISK_LIST{\"name\": \"$(json_escape "$NAME")\", \"size_bytes\": $(safe_num "$SIZE"), \"model\": \"$(json_escape "$MODEL")\", \"type\": \"$DISK_TYPE\", \"is_ssd\": $IS_SSD, \"transport\": \"$(json_escape "$TRAN")\", \"serial\": \"$(json_escape "$SERIAL")\", \"smart_status\": $SMART_STATUS, \"smart_health\": $SMART_HEALTH, \"power_on_hours\": $POWER_ON_HOURS, \"temp_c\": $DISK_TEMP}"
    done < <(lsblk -bno NAME,SIZE,TYPE,ROTA,TRAN,MODEL 2>/dev/null)
fi
echo "$DISK_LIST"
echo "],"

# === NETWORK ===
echo "\"network\": ["
NET_LIST=""
while IFS= read -r iface; do
    [ -z "$iface" ] && continue

    MAC=$(cat /sys/class/net/"$iface"/address 2>/dev/null || echo "")
    STATE=$(cat /sys/class/net/"$iface"/operstate 2>/dev/null || echo "unknown")

    # Get IPs
    IPV4=$(ip -4 addr show "$iface" 2>/dev/null | grep -oP 'inet \K[0-9.]+' | head -1)
    IPV6=$(ip -6 addr show "$iface" 2>/dev/null | grep -oP 'inet6 \K[0-9a-f:]+' | grep -v "^fe80" | head -1)

    # Speed (in Mbps) - from /sys, no ethtool needed
    SPEED="null"
    if [ -f "/sys/class/net/$iface/speed" ]; then
        SPEED_VAL=$(cat "/sys/class/net/$iface/speed" 2>/dev/null)
        if [ -n "$SPEED_VAL" ] && [ "$SPEED_VAL" -gt 0 ] 2>/dev/null; then
            SPEED="$SPEED_VAL"
        fi
    fi

    # MTU
    MTU="null"
    if [ -f "/sys/class/net/$iface/mtu" ]; then
        MTU_VAL=$(cat "/sys/class/net/$iface/mtu" 2>/dev/null)
        if [ -n "$MTU_VAL" ] && [ "$MTU_VAL" -gt 0 ] 2>/dev/null; then
            MTU="$MTU_VAL"
        fi
    fi

    # Duplex - from /sys (may not exist on all interfaces)
    DUPLEX="null"
    if [ -f "/sys/class/net/$iface/duplex" ]; then
        DUPLEX_VAL=$(cat "/sys/class/net/$iface/duplex" 2>/dev/null)
        if [ -n "$DUPLEX_VAL" ]; then
            DUPLEX="\"$DUPLEX_VAL\""
        fi
    fi

    # Interface type detection
    IFACE_TYPE="Virtual"
    if [ -d "/sys/class/net/$iface/device" ]; then
        IFACE_TYPE="Physical"
    elif [ -d "/sys/class/net/$iface/bridge" ]; then
        IFACE_TYPE="Bridge"
    elif [ -d "/sys/class/net/$iface/bonding" ]; then
        IFACE_TYPE="Bond"
    elif echo "$iface" | grep -qE "^(veth|docker|br-|virbr|tap|vmbr)"; then
        IFACE_TYPE="Virtual"
    elif [ "$iface" = "lo" ]; then
        IFACE_TYPE="Loopback"
    fi

    # Driver (from /sys, no ethtool needed)
    DRIVER=""
    if [ -L "/sys/class/net/$iface/device/driver" ]; then
        DRIVER=$(basename "$(readlink -f /sys/class/net/$iface/device/driver 2>/dev/null)" 2>/dev/null)
    fi

    # Bridge ports (if this is a bridge)
    BRIDGE_PORTS=""
    if [ -d "/sys/class/net/$iface/brif" ]; then
        BRIDGE_PORTS=$(ls "/sys/class/net/$iface/brif" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    fi

    [ -n "$NET_LIST" ] && NET_LIST="$NET_LIST,"
    NET_LIST="$NET_LIST{\"name\": \"$(json_escape "$iface")\", \"type\": \"$IFACE_TYPE\", \"mac\": \"$(json_escape "$MAC")\", \"state\": \"$(json_escape "$STATE")\", \"ipv4\": \"$(json_escape "$IPV4")\", \"ipv6\": \"$(json_escape "$IPV6")\", \"speed_mbps\": $SPEED, \"mtu\": $MTU, \"duplex\": $DUPLEX, \"driver\": \"$(json_escape "$DRIVER")\", \"bridge_ports\": \"$(json_escape "$BRIDGE_PORTS")\"}"
done < <(ls /sys/class/net 2>/dev/null)
echo "$NET_LIST"
echo "],"

# === GPU ===
echo "\"gpu\": ["
GPU_LIST=""
if command -v lspci &>/dev/null; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue

        [ -n "$GPU_LIST" ] && GPU_LIST="$GPU_LIST,"
        GPU_LIST="$GPU_LIST{\"description\": \"$(json_escape "$line")\"}"
    done < <(lspci 2>/dev/null | grep -iE 'vga|3d|display')
fi
echo "$GPU_LIST"
echo "],"

# === THERMAL SENSORS ===
echo "\"thermal\": ["
THERMAL_LIST=""

# Method 1: /sys/class/thermal (thermal_zone*)
# Raspberry Pi, most Linux systems
for zone in /sys/class/thermal/thermal_zone*; do
    [ ! -d "$zone" ] && continue

    ZONE_NAME=$(basename "$zone")
    ZONE_TYPE=$(cat "$zone/type" 2>/dev/null || echo "unknown")
    ZONE_TEMP_RAW=$(cat "$zone/temp" 2>/dev/null || echo "")

    # Temperature is in millidegrees (divide by 1000)
    if [ -n "$ZONE_TEMP_RAW" ] && [ "$ZONE_TEMP_RAW" -gt 0 ] 2>/dev/null; then
        ZONE_TEMP=$(echo "scale=1; $ZONE_TEMP_RAW / 1000" | bc 2>/dev/null || echo "null")
        if [ "$ZONE_TEMP" = "null" ] || [ -z "$ZONE_TEMP" ]; then
            # Fallback without bc (integer division)
            ZONE_TEMP=$((ZONE_TEMP_RAW / 1000))
        fi
    else
        ZONE_TEMP="null"
    fi

    [ -n "$THERMAL_LIST" ] && THERMAL_LIST="$THERMAL_LIST,"
    if [ "$ZONE_TEMP" = "null" ]; then
        THERMAL_LIST="$THERMAL_LIST{\"name\": \"$(json_escape "$ZONE_NAME")\", \"type\": \"$(json_escape "$ZONE_TYPE")\", \"source\": \"thermal_zone\", \"temp_c\": null}"
    else
        THERMAL_LIST="$THERMAL_LIST{\"name\": \"$(json_escape "$ZONE_NAME")\", \"type\": \"$(json_escape "$ZONE_TYPE")\", \"source\": \"thermal_zone\", \"temp_c\": $ZONE_TEMP}"
    fi
done

# Method 2: /sys/class/hwmon (hwmon*)
# More detailed sensors (CPU cores, chipset, NVMe, etc.)
for hwmon in /sys/class/hwmon/hwmon*; do
    [ ! -d "$hwmon" ] && continue

    HWMON_NAME=$(cat "$hwmon/name" 2>/dev/null || echo "unknown")

    # Find all temp*_input files
    for temp_file in "$hwmon"/temp*_input; do
        [ ! -f "$temp_file" ] && continue

        # Extract sensor number (temp1_input -> 1)
        SENSOR_NUM=$(basename "$temp_file" | grep -oE '[0-9]+')

        # Get label if exists (e.g., "Core 0", "Package id 0")
        LABEL_FILE="${hwmon}/temp${SENSOR_NUM}_label"
        if [ -f "$LABEL_FILE" ]; then
            SENSOR_LABEL=$(cat "$LABEL_FILE" 2>/dev/null | xargs)
        else
            SENSOR_LABEL="Sensor $SENSOR_NUM"
        fi

        # Temperature in millidegrees
        TEMP_RAW=$(cat "$temp_file" 2>/dev/null || echo "")
        if [ -n "$TEMP_RAW" ] && [ "$TEMP_RAW" -gt 0 ] 2>/dev/null; then
            TEMP_C=$(echo "scale=1; $TEMP_RAW / 1000" | bc 2>/dev/null || echo "")
            if [ -z "$TEMP_C" ]; then
                # Fallback without bc
                TEMP_C=$((TEMP_RAW / 1000))
            fi
        else
            TEMP_C="null"
        fi

        # Get crit/max thresholds if available
        TEMP_CRIT="null"
        TEMP_MAX="null"
        CRIT_FILE="${hwmon}/temp${SENSOR_NUM}_crit"
        MAX_FILE="${hwmon}/temp${SENSOR_NUM}_max"
        if [ -f "$CRIT_FILE" ]; then
            CRIT_RAW=$(cat "$CRIT_FILE" 2>/dev/null || echo "")
            if [ -n "$CRIT_RAW" ] && [ "$CRIT_RAW" -gt 0 ] 2>/dev/null; then
                TEMP_CRIT=$((CRIT_RAW / 1000))
            fi
        fi
        if [ -f "$MAX_FILE" ]; then
            MAX_RAW=$(cat "$MAX_FILE" 2>/dev/null || echo "")
            if [ -n "$MAX_RAW" ] && [ "$MAX_RAW" -gt 0 ] 2>/dev/null; then
                TEMP_MAX=$((MAX_RAW / 1000))
            fi
        fi

        [ -n "$THERMAL_LIST" ] && THERMAL_LIST="$THERMAL_LIST,"
        if [ "$TEMP_C" = "null" ]; then
            THERMAL_LIST="$THERMAL_LIST{\"name\": \"$(json_escape "$HWMON_NAME")\", \"label\": \"$(json_escape "$SENSOR_LABEL")\", \"source\": \"hwmon\", \"temp_c\": null, \"temp_crit\": $TEMP_CRIT, \"temp_max\": $TEMP_MAX}"
        else
            THERMAL_LIST="$THERMAL_LIST{\"name\": \"$(json_escape "$HWMON_NAME")\", \"label\": \"$(json_escape "$SENSOR_LABEL")\", \"source\": \"hwmon\", \"temp_c\": $TEMP_C, \"temp_crit\": $TEMP_CRIT, \"temp_max\": $TEMP_MAX}"
        fi
    done
done

echo "$THERMAL_LIST"
echo "],"

# === POWER SENSORS ===
echo "\"power\": ["
POWER_LIST=""

# Method 1: Intel RAPL (Running Average Power Limit)
# Provides package, core, uncore, dram power consumption
if [ -d "/sys/class/powercap/intel-rapl" ]; then
    for rapl in /sys/class/powercap/intel-rapl/intel-rapl:*/; do
        [ ! -d "$rapl" ] && continue

        NAME_FILE="${rapl}name"
        ENERGY_FILE="${rapl}energy_uj"
        MAX_ENERGY_FILE="${rapl}max_energy_range_uj"

        if [ -f "$NAME_FILE" ] && [ -f "$ENERGY_FILE" ]; then
            POWER_NAME=$(cat "$NAME_FILE" 2>/dev/null | xargs)
            ENERGY_UJ=$(cat "$ENERGY_FILE" 2>/dev/null || echo "")
            MAX_ENERGY_UJ=$(cat "$MAX_ENERGY_FILE" 2>/dev/null || echo "")

            # Energy is in microjoules, we track it for rate calculation later
            [ -n "$POWER_LIST" ] && POWER_LIST="$POWER_LIST,"
            if [ -n "$ENERGY_UJ" ]; then
                POWER_LIST="$POWER_LIST{\"name\": \"$(json_escape \"$POWER_NAME\")\", \"source\": \"rapl\", \"energy_uj\": $ENERGY_UJ"
                if [ -n "$MAX_ENERGY_UJ" ]; then
                    POWER_LIST="$POWER_LIST, \"max_energy_uj\": $MAX_ENERGY_UJ"
                fi
                POWER_LIST="$POWER_LIST}"
            fi
        fi
    done
fi

# Method 2: hwmon power sensors
# Direct power readings in microwatts
for hwmon in /sys/class/hwmon/hwmon*; do
    [ ! -d "$hwmon" ] && continue

    HWMON_NAME=$(cat "$hwmon/name" 2>/dev/null || echo "unknown")

    # Find all power*_input files
    for power_file in "$hwmon"/power*_input; do
        [ ! -f "$power_file" ] && continue

        # Extract sensor number (power1_input -> 1)
        SENSOR_NUM=$(basename "$power_file" | grep -oE '[0-9]+')

        # Get label if exists
        LABEL_FILE="${hwmon}/power${SENSOR_NUM}_label"
        if [ -f "$LABEL_FILE" ]; then
            SENSOR_LABEL=$(cat "$LABEL_FILE" 2>/dev/null | xargs)
        else
            SENSOR_LABEL="Power $SENSOR_NUM"
        fi

        # Power in microwatts
        POWER_UW=$(cat "$power_file" 2>/dev/null || echo "")
        if [ -n "$POWER_UW" ] && [ "$POWER_UW" -gt 0 ] 2>/dev/null; then
            # Convert to watts
            POWER_W=$(echo "scale=2; $POWER_UW / 1000000" | bc 2>/dev/null || echo "")
            if [ -z "$POWER_W" ]; then
                # Fallback without bc
                POWER_W=$(awk "BEGIN {printf \"%.2f\", $POWER_UW / 1000000}")
            fi

            # Get max/cap if available
            POWER_MAX="null"
            POWER_CAP="null"
            MAX_FILE="${hwmon}/power${SENSOR_NUM}_max"
            CAP_FILE="${hwmon}/power${SENSOR_NUM}_cap"
            if [ -f "$MAX_FILE" ]; then
                MAX_UW=$(cat "$MAX_FILE" 2>/dev/null || echo "")
                if [ -n "$MAX_UW" ] && [ "$MAX_UW" -gt 0 ] 2>/dev/null; then
                    POWER_MAX=$(echo "scale=2; $MAX_UW / 1000000" | bc 2>/dev/null || awk "BEGIN {printf \"%.2f\", $MAX_UW / 1000000}")
                fi
            fi
            if [ -f "$CAP_FILE" ]; then
                CAP_UW=$(cat "$CAP_FILE" 2>/dev/null || echo "")
                if [ -n "$CAP_UW" ] && [ "$CAP_UW" -gt 0 ] 2>/dev/null; then
                    POWER_CAP=$(echo "scale=2; $CAP_UW / 1000000" | bc 2>/dev/null || awk "BEGIN {printf \"%.2f\", $CAP_UW / 1000000}")
                fi
            fi

            [ -n "$POWER_LIST" ] && POWER_LIST="$POWER_LIST,"
            POWER_LIST="$POWER_LIST{\"name\": \"$(json_escape \"$HWMON_NAME\")\", \"label\": \"$(json_escape \"$SENSOR_LABEL\")\", \"source\": \"hwmon\", \"power_w\": $POWER_W"
            if [ "$POWER_MAX" != "null" ]; then
                POWER_LIST="$POWER_LIST, \"power_max_w\": $POWER_MAX"
            fi
            if [ "$POWER_CAP" != "null" ]; then
                POWER_LIST="$POWER_LIST, \"power_cap_w\": $POWER_CAP"
            fi
            POWER_LIST="$POWER_LIST}"
        fi
    done
done

echo "$POWER_LIST"
echo "]"

echo "}"

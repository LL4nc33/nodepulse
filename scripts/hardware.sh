#!/bin/bash
# nodepulse Hardware Script
# Sammelt Hardware-Infos (erweitert mit CPU/RAM/PCI/SMART Details)
# Robuste JSON-Ausgabe mit korrektem Escaping
# Funktioniert auf: Raspberry Pi, Proxmox, VMs, Bare Metal
# Keine Extra-Pakete noetig - nutzt /sys und /proc
#
# Erweiterte Daten (v2):
# - CPU: Stepping, Microcode, aktuelle MHz, Flags, Bugs
# - RAM: Slot-Details mit Hersteller, Part Number (mit Root)
# - PCI: Alle Devices mit Vendor/Device IDs
# - SMART: Erweitert mit Wear Level, Reallocated Sectors
# - VM-Erkennung

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

# Detect virtualization
IS_VIRTUAL=0
VIRT_TYPE=""
if command -v systemd-detect-virt &>/dev/null; then
    VIRT_TYPE=$(systemd-detect-virt 2>/dev/null || echo "")
    if [ -n "$VIRT_TYPE" ] && [ "$VIRT_TYPE" != "none" ]; then
        IS_VIRTUAL=1
    fi
elif [ -f /sys/class/dmi/id/product_name ]; then
    PRODUCT=$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo "")
    if echo "$PRODUCT" | grep -qiE "(virtual|vmware|qemu|kvm|xen|hyperv|vbox)"; then
        IS_VIRTUAL=1
        VIRT_TYPE="detected"
    fi
fi

echo "{"

# === VIRTUALIZATION ===
echo "\"virtualization\": {"
echo "  \"is_virtual\": $IS_VIRTUAL,"
if [ -n "$VIRT_TYPE" ] && [ "$VIRT_TYPE" != "none" ]; then
    echo "  \"type\": \"$(json_escape "$VIRT_TYPE")\""
else
    echo "  \"type\": null"
fi
echo "},"

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

# Extended CPU info from /proc/cpuinfo
CPU_STEPPING=$(grep -m1 'stepping' /proc/cpuinfo 2>/dev/null | awk -F': ' '{print $2}' | xargs || echo "")
CPU_MICROCODE=$(grep -m1 'microcode' /proc/cpuinfo 2>/dev/null | awk -F': ' '{print $2}' | xargs || echo "")
CPU_FLAGS=$(grep -m1 'flags' /proc/cpuinfo 2>/dev/null | awk -F': ' '{print $2}' || echo "")
CPU_BUGS=$(grep -m1 'bugs' /proc/cpuinfo 2>/dev/null | awk -F': ' '{print $2}' || echo "")

# Current CPU frequency (from sysfs - works without root)
CPU_CUR_MHZ=""
if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq ]; then
    CUR_KHZ=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null || echo "")
    if [ -n "$CUR_KHZ" ] && [ "$CUR_KHZ" -gt 0 ] 2>/dev/null; then
        CPU_CUR_MHZ=$((CUR_KHZ / 1000))
    fi
fi

# CPU min frequency
CPU_MIN_MHZ=$(lscpu 2>/dev/null | grep 'CPU min MHz' | awk '{print $4}')

echo "  \"model\": \"$(json_escape "$CPU_MODEL")\","
echo "  \"vendor\": \"$(json_escape "$CPU_VENDOR")\","
echo "  \"cores\": $(safe_num "$CPU_CORES"),"
echo "  \"threads\": $(safe_num "$CPU_THREADS"),"
if [ -n "$CPU_MAX_MHZ" ] && [[ "$CPU_MAX_MHZ" =~ ^[0-9.]+$ ]]; then
    echo "  \"max_mhz\": $CPU_MAX_MHZ,"
else
    echo "  \"max_mhz\": null,"
fi
if [ -n "$CPU_MIN_MHZ" ] && [[ "$CPU_MIN_MHZ" =~ ^[0-9.]+$ ]]; then
    echo "  \"min_mhz\": $CPU_MIN_MHZ,"
else
    echo "  \"min_mhz\": null,"
fi
if [ -n "$CPU_CUR_MHZ" ] && [ "$CPU_CUR_MHZ" -gt 0 ] 2>/dev/null; then
    echo "  \"cur_mhz\": $CPU_CUR_MHZ,"
else
    echo "  \"cur_mhz\": null,"
fi
echo "  \"arch\": \"$(json_escape "$CPU_ARCH")\","
echo "  \"virt_support\": \"$(json_escape "$VIRT_FLAG")\","
# Extended CPU fields
if [ -n "$CPU_STEPPING" ]; then
    echo "  \"stepping\": \"$(json_escape "$CPU_STEPPING")\","
else
    echo "  \"stepping\": null,"
fi
if [ -n "$CPU_MICROCODE" ]; then
    echo "  \"microcode\": \"$(json_escape "$CPU_MICROCODE")\","
else
    echo "  \"microcode\": null,"
fi
# Flags: Only output a subset of important ones to keep JSON small
# Full flags can be very long (400+ chars)
IMPORTANT_FLAGS=""
for flag in aes avx avx2 avx512f sse4_1 sse4_2 vmx svm hypervisor; do
    if echo "$CPU_FLAGS" | grep -qw "$flag"; then
        [ -n "$IMPORTANT_FLAGS" ] && IMPORTANT_FLAGS="$IMPORTANT_FLAGS "
        IMPORTANT_FLAGS="$IMPORTANT_FLAGS$flag"
    fi
done
if [ -n "$IMPORTANT_FLAGS" ]; then
    echo "  \"flags\": \"$(json_escape "$IMPORTANT_FLAGS")\","
else
    echo "  \"flags\": null,"
fi
if [ -n "$CPU_BUGS" ]; then
    echo "  \"bugs\": \"$(json_escape "$CPU_BUGS")\","
else
    echo "  \"bugs\": null,"
fi

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

# === MEMORY SLOTS (detailed RAM info with dmidecode) ===
echo "\"memory_slots\": ["
SLOT_LIST=""
if command -v dmidecode &>/dev/null && [ "$(id -u)" -eq 0 ]; then
    # Parse dmidecode -t 17 (Memory Device) for each slot
    SLOT_NUM=0
    while IFS= read -r block; do
        [ -z "$block" ] && continue

        # Extract fields from the block
        LOCATOR=$(echo "$block" | grep -oP 'Locator: \K[^\n]+' | head -1 | xargs)
        SIZE=$(echo "$block" | grep -oP 'Size: \K[^\n]+' | head -1 | xargs)
        TYPE=$(echo "$block" | grep -oP 'Type: \K[^\n]+' | head -1 | xargs)
        SPEED=$(echo "$block" | grep -oP 'Configured Memory Speed: \K[0-9]+' | head -1)
        [ -z "$SPEED" ] && SPEED=$(echo "$block" | grep -oP 'Speed: \K[0-9]+' | head -1)
        MANUFACTURER=$(echo "$block" | grep -oP 'Manufacturer: \K[^\n]+' | head -1 | xargs)
        PART_NUMBER=$(echo "$block" | grep -oP 'Part Number: \K[^\n]+' | head -1 | xargs)
        SERIAL=$(echo "$block" | grep -oP 'Serial Number: \K[^\n]+' | head -1 | xargs)
        FORM_FACTOR=$(echo "$block" | grep -oP 'Form Factor: \K[^\n]+' | head -1 | xargs)
        RANK=$(echo "$block" | grep -oP 'Rank: \K[0-9]+' | head -1)

        # Skip empty slots
        if [ "$SIZE" = "No Module Installed" ] || [ -z "$SIZE" ]; then
            # Still output empty slots so we know total slot count
            [ -n "$SLOT_LIST" ] && SLOT_LIST="$SLOT_LIST,"
            SLOT_LIST="$SLOT_LIST{\"slot\": $SLOT_NUM, \"locator\": \"$(json_escape "$LOCATOR")\", \"installed\": false, \"size\": null}"
        else
            # Parse size to bytes (e.g., "8192 MB" -> bytes)
            SIZE_VAL=$(echo "$SIZE" | grep -oE '[0-9]+')
            SIZE_UNIT=$(echo "$SIZE" | grep -oE '[A-Za-z]+' | head -1)
            SIZE_BYTES="null"
            if [ -n "$SIZE_VAL" ]; then
                case "$SIZE_UNIT" in
                    MB) SIZE_BYTES=$((SIZE_VAL * 1024 * 1024)) ;;
                    GB) SIZE_BYTES=$((SIZE_VAL * 1024 * 1024 * 1024)) ;;
                    *) SIZE_BYTES=$((SIZE_VAL * 1024 * 1024)) ;; # Default MB
                esac
            fi

            [ -n "$SLOT_LIST" ] && SLOT_LIST="$SLOT_LIST,"
            SLOT_LIST="$SLOT_LIST{"
            SLOT_LIST="$SLOT_LIST\"slot\": $SLOT_NUM,"
            SLOT_LIST="$SLOT_LIST \"locator\": \"$(json_escape "$LOCATOR")\","
            SLOT_LIST="$SLOT_LIST \"installed\": true,"
            SLOT_LIST="$SLOT_LIST \"size_bytes\": $SIZE_BYTES,"
            SLOT_LIST="$SLOT_LIST \"type\": \"$(json_escape "$TYPE")\","
            if [ -n "$SPEED" ]; then
                SLOT_LIST="$SLOT_LIST \"speed_mhz\": $SPEED,"
            else
                SLOT_LIST="$SLOT_LIST \"speed_mhz\": null,"
            fi
            # Clean up manufacturer (remove generic values)
            if [ "$MANUFACTURER" = "Unknown" ] || [ "$MANUFACTURER" = "Not Specified" ] || [ -z "$MANUFACTURER" ]; then
                SLOT_LIST="$SLOT_LIST \"manufacturer\": null,"
            else
                SLOT_LIST="$SLOT_LIST \"manufacturer\": \"$(json_escape "$MANUFACTURER")\","
            fi
            # Clean up part number
            if [ "$PART_NUMBER" = "Unknown" ] || [ "$PART_NUMBER" = "Not Specified" ] || [ -z "$PART_NUMBER" ]; then
                SLOT_LIST="$SLOT_LIST \"part_number\": null,"
            else
                SLOT_LIST="$SLOT_LIST \"part_number\": \"$(json_escape "$PART_NUMBER")\","
            fi
            # Serial
            if [ "$SERIAL" = "Unknown" ] || [ "$SERIAL" = "Not Specified" ] || [ -z "$SERIAL" ]; then
                SLOT_LIST="$SLOT_LIST \"serial\": null,"
            else
                SLOT_LIST="$SLOT_LIST \"serial\": \"$(json_escape "$SERIAL")\","
            fi
            SLOT_LIST="$SLOT_LIST \"form_factor\": \"$(json_escape "$FORM_FACTOR")\","
            if [ -n "$RANK" ]; then
                SLOT_LIST="$SLOT_LIST \"rank\": $RANK"
            else
                SLOT_LIST="$SLOT_LIST \"rank\": null"
            fi
            SLOT_LIST="$SLOT_LIST}"
        fi

        SLOT_NUM=$((SLOT_NUM + 1))
    done < <(dmidecode -t 17 2>/dev/null | awk '/Memory Device/{p=1; block=""} p{block=block $0 "\n"} /^$/ && p{print block; p=0; block=""}')
fi
echo "$SLOT_LIST"
echo "],"

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
        # Extended SMART attributes
        REALLOCATED_SECTORS="null"
        WEAR_LEVEL="null"
        PENDING_SECTORS="null"
        READ_ERRORS="null"

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

                # Reallocated Sectors (ID 5) - bad sectors that were remapped
                REALLOC=$(echo "$SMART_OUT" | grep -E "Reallocated_Sector_Ct|Reallocated_Event_Count" | awk '{print $NF}' | grep -oE '[0-9]+' | head -1)
                if [ -n "$REALLOC" ] 2>/dev/null; then
                    REALLOCATED_SECTORS="$REALLOC"
                fi

                # Current Pending Sectors (ID 197) - sectors waiting to be remapped
                PENDING=$(echo "$SMART_OUT" | grep -E "Current_Pending_Sector" | awk '{print $NF}' | grep -oE '[0-9]+' | head -1)
                if [ -n "$PENDING" ] 2>/dev/null; then
                    PENDING_SECTORS="$PENDING"
                fi

                # Read Error Rate (varies by manufacturer, often ID 1)
                READ_ERR=$(echo "$SMART_OUT" | grep -E "Raw_Read_Error_Rate|Read_Error_Rate" | awk '{print $NF}' | grep -oE '[0-9]+' | head -1)
                if [ -n "$READ_ERR" ] 2>/dev/null; then
                    READ_ERRORS="$READ_ERR"
                fi

                # SSD Wear Level (multiple possible IDs: 177, 202, 231, 233)
                # Different manufacturers use different attribute IDs
                if [ "$IS_SSD" -eq 1 ]; then
                    # Try common wear level attributes
                    # ID 177: Wear_Leveling_Count (Samsung, others)
                    # ID 202: Percent_Lifetime_Remain (Crucial)
                    # ID 231: SSD_Life_Left (Intel)
                    # ID 233: Media_Wearout_Indicator
                    WEAR=$(echo "$SMART_OUT" | grep -iE "Wear_Leveling_Count|Percent_Lifetime_Remain|SSD_Life_Left|Media_Wearout|Wear_Range_Delta" | head -1 | awk '{print $4}')
                    if [ -n "$WEAR" ] && [[ "$WEAR" =~ ^[0-9]+$ ]] && [ "$WEAR" -le 100 ] 2>/dev/null; then
                        WEAR_LEVEL="$WEAR"
                    fi
                    # NVMe: Percentage Used
                    NVME_WEAR=$(echo "$SMART_OUT" | grep -i "Percentage Used" | awk '{print $3}' | grep -oE '[0-9]+')
                    if [ -n "$NVME_WEAR" ] && [ "$NVME_WEAR" -le 100 ] 2>/dev/null; then
                        # NVMe reports percentage used (0-100), we want remaining (100 - used)
                        WEAR_LEVEL=$((100 - NVME_WEAR))
                    fi
                fi

                # Serial from smartctl if not found in /sys
                if [ -z "$SERIAL" ]; then
                    SERIAL=$(smartctl -i "/dev/$NAME" 2>/dev/null | grep -i "Serial Number:" | awk '{print $NF}')
                fi
            fi
        fi

        # Disk scheduler and rotational from sysfs
        SCHEDULER=""
        if [ -f "/sys/block/$NAME/queue/scheduler" ]; then
            # Extract active scheduler (bracketed one)
            SCHEDULER=$(cat "/sys/block/$NAME/queue/scheduler" 2>/dev/null | grep -oE '\[[a-z]+\]' | tr -d '[]')
        fi

        [ -n "$DISK_LIST" ] && DISK_LIST="$DISK_LIST,"
        DISK_LIST="$DISK_LIST{\"name\": \"$(json_escape "$NAME")\", \"size_bytes\": $(safe_num "$SIZE"), \"model\": \"$(json_escape "$MODEL")\", \"type\": \"$DISK_TYPE\", \"is_ssd\": $IS_SSD, \"transport\": \"$(json_escape "$TRAN")\", \"serial\": \"$(json_escape "$SERIAL")\", \"scheduler\": \"$(json_escape "$SCHEDULER")\", \"smart_status\": $SMART_STATUS, \"smart_health\": $SMART_HEALTH, \"power_on_hours\": $POWER_ON_HOURS, \"temp_c\": $DISK_TEMP, \"reallocated_sectors\": $REALLOCATED_SECTORS, \"pending_sectors\": $PENDING_SECTORS, \"read_errors\": $READ_ERRORS, \"wear_level_pct\": $WEAR_LEVEL}"
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

# === PCI DEVICES ===
# Full PCI device list with vendor/device IDs (useful for GPU, passthrough, etc.)
echo "\"pci_devices\": ["
PCI_LIST=""
if command -v lspci &>/dev/null; then
    # lspci -nn gives us vendor:device IDs in brackets like [8086:1912]
    while IFS= read -r line; do
        [ -z "$line" ] && continue

        # Parse the line: "00:02.0 VGA compatible controller [0300]: Intel Corporation... [8086:1912]"
        SLOT=$(echo "$line" | awk '{print $1}')

        # Extract class (e.g., [0300] for VGA)
        CLASS_ID=$(echo "$line" | grep -oE '\[[0-9a-f]{4}\]' | head -1 | tr -d '[]')

        # Extract vendor:device IDs (last bracket like [8086:1912])
        VENDOR_DEVICE=$(echo "$line" | grep -oE '\[[0-9a-f]{4}:[0-9a-f]{4}\]' | tail -1 | tr -d '[]')
        VENDOR_ID=""
        DEVICE_ID=""
        if [ -n "$VENDOR_DEVICE" ]; then
            VENDOR_ID=$(echo "$VENDOR_DEVICE" | cut -d: -f1)
            DEVICE_ID=$(echo "$VENDOR_DEVICE" | cut -d: -f2)
        fi

        # Get class name and device description
        # Remove the slot from the beginning and clean up
        CLASS_AND_DESC=$(echo "$line" | sed "s/^$SLOT //" | sed 's/ \[[0-9a-f:]*\]//g')
        # Class is before the colon
        CLASS_NAME=$(echo "$CLASS_AND_DESC" | cut -d: -f1 | xargs)
        # Description is after the colon
        DESCRIPTION=$(echo "$CLASS_AND_DESC" | cut -d: -f2- | xargs)

        # Get driver in use (from /sys)
        DRIVER=""
        if [ -d "/sys/bus/pci/devices/0000:$SLOT" ]; then
            if [ -L "/sys/bus/pci/devices/0000:$SLOT/driver" ]; then
                DRIVER=$(basename "$(readlink -f /sys/bus/pci/devices/0000:$SLOT/driver 2>/dev/null)" 2>/dev/null)
            fi
        fi

        # Determine device type category
        DEV_TYPE="other"
        case "$CLASS_NAME" in
            *VGA*|*Display*|*3D*) DEV_TYPE="gpu" ;;
            *Network*|*Ethernet*|*WiFi*|*Wireless*) DEV_TYPE="network" ;;
            *Storage*|*SATA*|*NVMe*|*RAID*|*SCSI*) DEV_TYPE="storage" ;;
            *Audio*|*Sound*) DEV_TYPE="audio" ;;
            *USB*) DEV_TYPE="usb" ;;
            *Bridge*|*ISA*|*PCI*|*Host*) DEV_TYPE="bridge" ;;
            *Serial*|*Communication*) DEV_TYPE="serial" ;;
            *SMBus*|*System*) DEV_TYPE="system" ;;
        esac

        [ -n "$PCI_LIST" ] && PCI_LIST="$PCI_LIST,"
        PCI_LIST="$PCI_LIST{"
        PCI_LIST="$PCI_LIST\"slot\": \"$(json_escape "$SLOT")\","
        PCI_LIST="$PCI_LIST \"class\": \"$(json_escape "$CLASS_NAME")\","
        PCI_LIST="$PCI_LIST \"class_id\": \"$(json_escape "$CLASS_ID")\","
        PCI_LIST="$PCI_LIST \"description\": \"$(json_escape "$DESCRIPTION")\","
        PCI_LIST="$PCI_LIST \"vendor_id\": \"$(json_escape "$VENDOR_ID")\","
        PCI_LIST="$PCI_LIST \"device_id\": \"$(json_escape "$DEVICE_ID")\","
        PCI_LIST="$PCI_LIST \"driver\": \"$(json_escape "$DRIVER")\","
        PCI_LIST="$PCI_LIST \"type\": \"$DEV_TYPE\""
        PCI_LIST="$PCI_LIST}"
    done < <(lspci -nn 2>/dev/null)
fi
echo "$PCI_LIST"
echo "],"

# === GPU (filtered from PCI for convenience) ===
echo "\"gpu\": ["
GPU_LIST=""
if command -v lspci &>/dev/null; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue

        SLOT=$(echo "$line" | awk '{print $1}')
        VENDOR_DEVICE=$(echo "$line" | grep -oE '\[[0-9a-f]{4}:[0-9a-f]{4}\]' | tail -1 | tr -d '[]')
        DESCRIPTION=$(echo "$line" | sed "s/^$SLOT //" | sed 's/ \[[0-9a-f:]*\]//g' | cut -d: -f2- | xargs)

        # Get driver
        DRIVER=""
        if [ -d "/sys/bus/pci/devices/0000:$SLOT" ]; then
            if [ -L "/sys/bus/pci/devices/0000:$SLOT/driver" ]; then
                DRIVER=$(basename "$(readlink -f /sys/bus/pci/devices/0000:$SLOT/driver 2>/dev/null)" 2>/dev/null)
            fi
        fi

        # IOMMU Group (important for passthrough)
        IOMMU_GROUP="null"
        if [ -L "/sys/bus/pci/devices/0000:$SLOT/iommu_group" ]; then
            IOMMU_GROUP=$(basename "$(readlink -f /sys/bus/pci/devices/0000:$SLOT/iommu_group 2>/dev/null)" 2>/dev/null)
            if [ -n "$IOMMU_GROUP" ]; then
                IOMMU_GROUP="$IOMMU_GROUP"
            else
                IOMMU_GROUP="null"
            fi
        fi

        [ -n "$GPU_LIST" ] && GPU_LIST="$GPU_LIST,"
        GPU_LIST="$GPU_LIST{\"slot\": \"$(json_escape "$SLOT")\", \"description\": \"$(json_escape "$DESCRIPTION")\", \"vendor_device_id\": \"$(json_escape "$VENDOR_DEVICE")\", \"driver\": \"$(json_escape "$DRIVER")\", \"iommu_group\": $IOMMU_GROUP}"
    done < <(lspci -nn 2>/dev/null | grep -iE 'vga|3d|display')
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

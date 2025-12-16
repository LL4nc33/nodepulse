#!/bin/bash
# nodepulse Hardware Script
# Sammelt Hardware-Infos
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
        if [ "$ROTA" = "0" ]; then
            IS_SSD=1
        fi

        [ -n "$DISK_LIST" ] && DISK_LIST="$DISK_LIST,"
        DISK_LIST="$DISK_LIST{\"name\": \"$(json_escape "$NAME")\", \"size_bytes\": $(safe_num "$SIZE"), \"model\": \"$(json_escape "$MODEL")\", \"is_ssd\": $IS_SSD, \"transport\": \"$(json_escape "$TRAN")\"}"
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

    [ -n "$NET_LIST" ] && NET_LIST="$NET_LIST,"
    NET_LIST="$NET_LIST{\"name\": \"$(json_escape "$iface")\", \"mac\": \"$(json_escape "$MAC")\", \"state\": \"$(json_escape "$STATE")\", \"ipv4\": \"$(json_escape "$IPV4")\", \"ipv6\": \"$(json_escape "$IPV6")\"}"
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
echo "]"

echo "}"

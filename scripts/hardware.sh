#!/bin/bash
# nodepulse Hardware Script
# Sammelt Hardware-Infos

# Escape string for JSON (remove control characters, escape quotes/backslashes)
json_escape() {
    printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
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
CPU_MAX_MHZ=$(lscpu 2>/dev/null | grep 'CPU max MHz' | awk '{print $4}' || echo "null")
CPU_ARCH=$(uname -m)
VIRT_FLAG=$(grep -oE '(vmx|svm)' /proc/cpuinfo 2>/dev/null | head -1 || echo "none")

echo "  \"model\": \"$(json_escape "$CPU_MODEL")\","
echo "  \"vendor\": \"$(json_escape "$CPU_VENDOR")\","
echo "  \"cores\": $CPU_CORES,"
echo "  \"threads\": $CPU_THREADS,"
echo "  \"max_mhz\": $CPU_MAX_MHZ,"
echo "  \"arch\": \"$CPU_ARCH\","
echo "  \"virt_support\": \"$VIRT_FLAG\","

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
echo "  \"total_bytes\": $MEM_TOTAL,"
echo "  \"swap_total_bytes\": $SWAP_TOTAL"

if command -v dmidecode &>/dev/null && [ "$(id -u)" -eq 0 ]; then
    RAM_TYPE=$(dmidecode -t memory 2>/dev/null | grep -m1 "Type:" | grep -v "Error" | awk '{print $2}' || echo "")
    RAM_SPEED=$(dmidecode -t memory 2>/dev/null | grep -m1 "Speed:" | grep -v "Unknown" | awk '{print $2}' || echo "")
    if [ -n "$RAM_TYPE" ]; then
        echo "  ,\"type\": \"$(json_escape "$RAM_TYPE")\""
    fi
    if [ -n "$RAM_SPEED" ]; then
        echo "  ,\"speed_mhz\": $RAM_SPEED"
    fi
fi
echo "},"

# === STORAGE ===
echo "\"disks\": ["
if command -v lsblk &>/dev/null; then
    lsblk -Jbo NAME,SIZE,TYPE,MODEL,ROTA,TRAN 2>/dev/null | \
    python3 -c "
import sys, json
data = json.load(sys.stdin)
disks = [d for d in data.get('blockdevices', []) if d.get('type') == 'disk']
for i, d in enumerate(disks):
    comma = ',' if i > 0 else ''
    print(f\"{comma}{json.dumps(d)}\")
" 2>/dev/null || echo ""
fi
echo "],"

# === NETWORK ===
echo "\"network\": ["
if command -v ip &>/dev/null; then
    ip -j addr show 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for i, iface in enumerate(data):
    comma = ',' if i > 0 else ''
    info = {
        'name': iface.get('ifname'),
        'mac': iface.get('address'),
        'state': iface.get('operstate'),
        'ips': [{'family': a.get('family'), 'address': a.get('local')} for a in iface.get('addr_info', [])]
    }
    print(f\"{comma}{json.dumps(info)}\")
" 2>/dev/null || echo ""
fi
echo "],"

# === GPU ===
echo "\"gpu\": ["
if command -v lspci &>/dev/null; then
    FIRST=1
    lspci 2>/dev/null | grep -iE 'vga|3d|display' | while read -r line; do
        if [ $FIRST -eq 1 ]; then
            FIRST=0
        else
            echo ","
        fi
        echo "  {\"description\": \"$(json_escape "$line")\"}"
    done
fi
echo "]"

echo "}"

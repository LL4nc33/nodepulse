#!/bin/bash
# nodepulse Stats Script
# Aktuelle Auslastung
# Robuste JSON-Ausgabe mit korrektem Escaping

# Safe number output (returns 0 if empty/invalid for integers)
safe_num() {
    local val="$1"
    if [ -z "$val" ] || ! [[ "$val" =~ ^[0-9]+$ ]]; then
        echo "0"
    else
        echo "$val"
    fi
}

# Safe float output (returns 0 if empty/invalid)
safe_float() {
    local val="$1"
    if [ -z "$val" ] || ! [[ "$val" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
        echo "0"
    else
        echo "$val"
    fi
}

echo "{"

# Timestamp
TIMESTAMP=$(date +%s)
echo "\"timestamp\": $(safe_num "$TIMESTAMP"),"

# CPU Load
LOAD_1=$(awk '{print $1}' /proc/loadavg 2>/dev/null)
LOAD_5=$(awk '{print $2}' /proc/loadavg 2>/dev/null)
LOAD_15=$(awk '{print $3}' /proc/loadavg 2>/dev/null)
echo "\"load_1m\": $(safe_float "$LOAD_1"),"
echo "\"load_5m\": $(safe_float "$LOAD_5"),"
echo "\"load_15m\": $(safe_float "$LOAD_15"),"

# CPU Usage
CPU_LINE=$(top -bn1 2>/dev/null | grep "Cpu(s)" | head -1)
CPU_USED=0
if [ -n "$CPU_LINE" ]; then
    CPU_IDLE=$(echo "$CPU_LINE" | awk -F',' '{for(i=1;i<=NF;i++) if($i ~ /id/) print $i}' | grep -oE '[0-9.]+' | head -1)
    if [ -n "$CPU_IDLE" ] && [[ "$CPU_IDLE" =~ ^[0-9.]+$ ]]; then
        CPU_USED=$(awk "BEGIN {printf \"%.1f\", 100 - $CPU_IDLE}" 2>/dev/null)
    fi
fi
echo "\"cpu_percent\": $(safe_float "$CPU_USED"),"

# Memory
MEM_TOTAL=$(free -b 2>/dev/null | awk '/Mem:/ {print $2}' || echo 0)
MEM_USED=$(free -b 2>/dev/null | awk '/Mem:/ {print $3}' || echo 0)
MEM_AVAIL=$(free -b 2>/dev/null | awk '/Mem:/ {print $7}' || echo 0)
SWAP_TOTAL=$(free -b 2>/dev/null | awk '/Swap:/ {print $2}' || echo 0)
SWAP_USED=$(free -b 2>/dev/null | awk '/Swap:/ {print $3}' || echo 0)

MEM_PERCENT=0
if [ "$MEM_TOTAL" -gt 0 ] 2>/dev/null; then
    MEM_PERCENT=$(awk "BEGIN {printf \"%.1f\", $MEM_USED * 100 / $MEM_TOTAL}" 2>/dev/null)
fi

echo "\"ram_total_bytes\": $(safe_num "$MEM_TOTAL"),"
echo "\"ram_used_bytes\": $(safe_num "$MEM_USED"),"
echo "\"ram_available_bytes\": $(safe_num "$MEM_AVAIL"),"
echo "\"ram_percent\": $(safe_float "$MEM_PERCENT"),"
echo "\"swap_total_bytes\": $(safe_num "$SWAP_TOTAL"),"
echo "\"swap_used_bytes\": $(safe_num "$SWAP_USED"),"

# Disk (root)
DISK_INFO=$(df -B1 / 2>/dev/null | tail -1)
DISK_TOTAL=$(echo "$DISK_INFO" | awk '{print $2}')
DISK_USED=$(echo "$DISK_INFO" | awk '{print $3}')
DISK_AVAIL=$(echo "$DISK_INFO" | awk '{print $4}')
DISK_PERCENT=$(echo "$DISK_INFO" | awk '{print $5}' | tr -d '%')

echo "\"disk_total_bytes\": $(safe_num "$DISK_TOTAL"),"
echo "\"disk_used_bytes\": $(safe_num "$DISK_USED"),"
echo "\"disk_available_bytes\": $(safe_num "$DISK_AVAIL"),"
echo "\"disk_percent\": $(safe_num "$DISK_PERCENT"),"

# Network I/O (totals)
NET_RX=0
NET_TX=0
while IFS= read -r line; do
    [ -z "$line" ] && continue
    RX=$(echo "$line" | awk '{print $2}')
    TX=$(echo "$line" | awk '{print $10}')
    if [[ "$RX" =~ ^[0-9]+$ ]]; then
        NET_RX=$((NET_RX + RX))
    fi
    if [[ "$TX" =~ ^[0-9]+$ ]]; then
        NET_TX=$((NET_TX + TX))
    fi
done < <(tail -n +3 /proc/net/dev 2>/dev/null)
echo "\"net_rx_bytes\": $(safe_num "$NET_RX"),"
echo "\"net_tx_bytes\": $(safe_num "$NET_TX"),"

# Temperature
TEMP="null"
if [ -f /sys/class/thermal/thermal_zone0/temp ]; then
    TEMP_RAW=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
    if [ -n "$TEMP_RAW" ] && [[ "$TEMP_RAW" =~ ^[0-9]+$ ]]; then
        TEMP=$(awk "BEGIN {printf \"%.1f\", $TEMP_RAW / 1000}" 2>/dev/null)
        if [ -z "$TEMP" ] || ! [[ "$TEMP" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
            TEMP="null"
        fi
    fi
fi
echo "\"temp_cpu\": $TEMP,"

# Uptime
UPTIME=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
echo "\"uptime_seconds\": $(safe_num "$UPTIME"),"

# Processes
PROCS=$(ps aux 2>/dev/null | wc -l || echo 0)
echo "\"processes\": $(safe_num "$PROCS")"

echo "}"

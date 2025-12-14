#!/bin/bash
# nodepulse Stats Script
# Aktuelle Auslastung

echo "{"

# Timestamp
echo "\"timestamp\": $(date +%s),"

# CPU Load
LOAD_1=$(awk '{print $1}' /proc/loadavg)
LOAD_5=$(awk '{print $2}' /proc/loadavg)
LOAD_15=$(awk '{print $3}' /proc/loadavg)
echo "\"load_1m\": $LOAD_1,"
echo "\"load_5m\": $LOAD_5,"
echo "\"load_15m\": $LOAD_15,"

# CPU Usage
CPU_LINE=$(top -bn1 2>/dev/null | grep "Cpu(s)" | head -1)
if [ -n "$CPU_LINE" ]; then
    CPU_IDLE=$(echo "$CPU_LINE" | awk -F',' '{for(i=1;i<=NF;i++) if($i ~ /id/) print $i}' | grep -oE '[0-9.]+' | head -1)
    if [ -n "$CPU_IDLE" ]; then
        CPU_USED=$(echo "100 - $CPU_IDLE" | bc 2>/dev/null || echo "0")
    else
        CPU_USED=0
    fi
else
    CPU_USED=0
fi
echo "\"cpu_percent\": $CPU_USED,"

# Memory
MEM_TOTAL=$(free -b 2>/dev/null | awk '/Mem:/ {print $2}' || echo 0)
MEM_USED=$(free -b 2>/dev/null | awk '/Mem:/ {print $3}' || echo 0)
MEM_AVAIL=$(free -b 2>/dev/null | awk '/Mem:/ {print $7}' || echo 0)
SWAP_TOTAL=$(free -b 2>/dev/null | awk '/Swap:/ {print $2}' || echo 0)
SWAP_USED=$(free -b 2>/dev/null | awk '/Swap:/ {print $3}' || echo 0)

if [ "$MEM_TOTAL" -gt 0 ]; then
    MEM_PERCENT=$(echo "scale=1; $MEM_USED * 100 / $MEM_TOTAL" | bc 2>/dev/null || echo 0)
else
    MEM_PERCENT=0
fi

echo "\"ram_total_bytes\": $MEM_TOTAL,"
echo "\"ram_used_bytes\": $MEM_USED,"
echo "\"ram_available_bytes\": $MEM_AVAIL,"
echo "\"ram_percent\": $MEM_PERCENT,"
echo "\"swap_total_bytes\": $SWAP_TOTAL,"
echo "\"swap_used_bytes\": $SWAP_USED,"

# Disk (root)
DISK_INFO=$(df -B1 / 2>/dev/null | tail -1)
DISK_TOTAL=$(echo "$DISK_INFO" | awk '{print $2}')
DISK_USED=$(echo "$DISK_INFO" | awk '{print $3}')
DISK_AVAIL=$(echo "$DISK_INFO" | awk '{print $4}')
DISK_PERCENT=$(echo "$DISK_INFO" | awk '{print $5}' | tr -d '%')

echo "\"disk_total_bytes\": ${DISK_TOTAL:-0},"
echo "\"disk_used_bytes\": ${DISK_USED:-0},"
echo "\"disk_available_bytes\": ${DISK_AVAIL:-0},"
echo "\"disk_percent\": ${DISK_PERCENT:-0},"

# Network I/O (totals)
NET_RX=0
NET_TX=0
while read -r line; do
    RX=$(echo "$line" | awk '{print $2}')
    TX=$(echo "$line" | awk '{print $10}')
    NET_RX=$((NET_RX + RX))
    NET_TX=$((NET_TX + TX))
done < <(tail -n +3 /proc/net/dev 2>/dev/null)
echo "\"net_rx_bytes\": $NET_RX,"
echo "\"net_tx_bytes\": $NET_TX,"

# Temperature
TEMP=null
if [ -f /sys/class/thermal/thermal_zone0/temp ]; then
    TEMP_RAW=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
    if [ -n "$TEMP_RAW" ]; then
        TEMP=$(echo "scale=1; $TEMP_RAW / 1000" | bc 2>/dev/null || echo "null")
    fi
fi
echo "\"temp_cpu\": $TEMP,"

# Uptime
UPTIME=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
echo "\"uptime_seconds\": $UPTIME,"

# Processes
PROCS=$(ps aux 2>/dev/null | wc -l || echo 0)
echo "\"processes\": $PROCS"

echo "}"

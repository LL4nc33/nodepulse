#!/bin/bash
# nodepulse Health-Check Script (Extended - ProxMenux Style)
# Prueft System-Health: CPU, RAM, Disk, Services, Time, Updates

# Safe string output (escapes quotes)
safe_str() {
    local val="$1"
    if [ -z "$val" ]; then
        echo ""
    else
        echo "$val" | sed 's/"/\\"/g' | tr -d '\n'
    fi
}

# Safe number output
safe_num() {
    local val="$1"
    if [ -z "$val" ] || ! [[ "$val" =~ ^[0-9]+$ ]]; then
        echo "0"
    else
        echo "$val"
    fi
}

# Safe float output
safe_float() {
    local val="$1"
    if [ -z "$val" ] || ! [[ "$val" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        echo "0"
    else
        echo "$val"
    fi
}

echo "{"

# Timestamp
TIMESTAMP=$(date +%s)
echo "\"timestamp\": $(safe_num "$TIMESTAMP"),"

# System Info
HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
echo "\"hostname\": \"$(safe_str "$HOSTNAME")\","

KERNEL=$(uname -r 2>/dev/null || echo "unknown")
echo "\"kernel_version\": \"$(safe_str "$KERNEL")\","

# Last Boot
LAST_BOOT=$(uptime -s 2>/dev/null || echo "")
echo "\"last_boot\": \"$(safe_str "$LAST_BOOT")\","

# Uptime in seconds
UPTIME_SECS=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo "0")
echo "\"uptime_seconds\": $(safe_num "$UPTIME_SECS"),"

# Reboot Required
REBOOT_REQUIRED="false"
if [ -f /var/run/reboot-required ]; then
    REBOOT_REQUIRED="true"
fi
echo "\"reboot_required\": $REBOOT_REQUIRED,"

# =============================================================================
# CPU TEMPERATURE
# =============================================================================
CPU_TEMP=0
CPU_TEMP_STATUS="unknown"

# Try different sources for CPU temperature
if command -v sensors >/dev/null 2>&1; then
    # lm-sensors available
    CPU_TEMP=$(sensors 2>/dev/null | grep -E "^(Package|Core 0|Tctl|CPU)" | head -1 | grep -oP '\+\K[0-9]+' | head -1)
elif [ -f /sys/class/thermal/thermal_zone0/temp ]; then
    # Kernel thermal zone
    RAW_TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
    if [ -n "$RAW_TEMP" ]; then
        CPU_TEMP=$((RAW_TEMP / 1000))
    fi
fi

if [ -n "$CPU_TEMP" ] && [ "$CPU_TEMP" -gt 0 ]; then
    if [ "$CPU_TEMP" -ge 85 ]; then
        CPU_TEMP_STATUS="critical"
    elif [ "$CPU_TEMP" -ge 70 ]; then
        CPU_TEMP_STATUS="warning"
    else
        CPU_TEMP_STATUS="ok"
    fi
else
    CPU_TEMP=0
    CPU_TEMP_STATUS="unknown"
fi

echo "\"cpu_temp\": $(safe_num "$CPU_TEMP"),"
echo "\"cpu_temp_status\": \"$CPU_TEMP_STATUS\","

# =============================================================================
# LOAD AVERAGE
# =============================================================================
LOAD_1=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0")
LOAD_5=$(awk '{print $2}' /proc/loadavg 2>/dev/null || echo "0")
LOAD_15=$(awk '{print $3}' /proc/loadavg 2>/dev/null || echo "0")
CPU_CORES=$(nproc 2>/dev/null || echo "1")

# Calculate load status based on cores
LOAD_THRESHOLD_WARN=$(echo "$CPU_CORES * 0.8" | bc 2>/dev/null || echo "$CPU_CORES")
LOAD_THRESHOLD_CRIT=$(echo "$CPU_CORES * 1.5" | bc 2>/dev/null || echo "$((CPU_CORES * 2))")
LOAD_STATUS="ok"

# Use awk for float comparison (bc might not be available)
LOAD_STATUS=$(awk -v load="$LOAD_1" -v warn="$CPU_CORES" -v crit="$((CPU_CORES * 2))" 'BEGIN {
    if (load >= crit) print "critical"
    else if (load >= warn) print "warning"
    else print "ok"
}')

echo "\"load_1\": $(safe_float "$LOAD_1"),"
echo "\"load_5\": $(safe_float "$LOAD_5"),"
echo "\"load_15\": $(safe_float "$LOAD_15"),"
echo "\"load_status\": \"$LOAD_STATUS\","

# =============================================================================
# MEMORY & SWAP
# =============================================================================
MEM_TOTAL=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
MEM_AVAIL=$(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}')
MEM_FREE=$(grep MemFree /proc/meminfo 2>/dev/null | awk '{print $2}')

# Fallback if MemAvailable not present (older kernels)
if [ -z "$MEM_AVAIL" ]; then
    MEM_AVAIL=$MEM_FREE
fi

if [ -n "$MEM_TOTAL" ] && [ "$MEM_TOTAL" -gt 0 ]; then
    MEM_USED=$((MEM_TOTAL - MEM_AVAIL))
    MEM_PERCENT=$((MEM_USED * 100 / MEM_TOTAL))
else
    MEM_PERCENT=0
fi

MEM_STATUS="ok"
if [ "$MEM_PERCENT" -ge 95 ]; then
    MEM_STATUS="critical"
elif [ "$MEM_PERCENT" -ge 85 ]; then
    MEM_STATUS="warning"
fi

# Swap
SWAP_TOTAL=$(grep SwapTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
SWAP_FREE=$(grep SwapFree /proc/meminfo 2>/dev/null | awk '{print $2}')
SWAP_PERCENT=0
SWAP_STATUS="ok"

if [ -n "$SWAP_TOTAL" ] && [ "$SWAP_TOTAL" -gt 0 ]; then
    SWAP_USED=$((SWAP_TOTAL - SWAP_FREE))
    SWAP_PERCENT=$((SWAP_USED * 100 / SWAP_TOTAL))
    if [ "$SWAP_PERCENT" -ge 80 ]; then
        SWAP_STATUS="critical"
    elif [ "$SWAP_PERCENT" -ge 50 ]; then
        SWAP_STATUS="warning"
    fi
fi

echo "\"mem_percent\": $(safe_num "$MEM_PERCENT"),"
echo "\"mem_status\": \"$MEM_STATUS\","
echo "\"swap_percent\": $(safe_num "$SWAP_PERCENT"),"
echo "\"swap_status\": \"$SWAP_STATUS\","

# =============================================================================
# DISK USAGE (Root Partition)
# =============================================================================
DISK_PERCENT=$(df / 2>/dev/null | awk 'NR==2 {gsub(/%/,""); print $5}')
DISK_STATUS="ok"

if [ -n "$DISK_PERCENT" ]; then
    if [ "$DISK_PERCENT" -ge 95 ]; then
        DISK_STATUS="critical"
    elif [ "$DISK_PERCENT" -ge 85 ]; then
        DISK_STATUS="warning"
    fi
else
    DISK_PERCENT=0
fi

echo "\"disk_percent\": $(safe_num "$DISK_PERCENT"),"
echo "\"disk_status\": \"$DISK_STATUS\","

# =============================================================================
# FAILED SERVICES (systemd)
# =============================================================================
FAILED_SERVICES=0
FAILED_LIST=""

if command -v systemctl >/dev/null 2>&1; then
    FAILED_OUTPUT=$(systemctl --failed --no-legend --plain 2>/dev/null)
    FAILED_SERVICES=$(echo "$FAILED_OUTPUT" | grep -c "failed" 2>/dev/null || echo "0")
    # Get first 5 failed service names
    FAILED_LIST=$(echo "$FAILED_OUTPUT" | head -5 | awk '{print $1}' | tr '\n' ',' | sed 's/,$//')
fi

SERVICES_STATUS="ok"
if [ "$FAILED_SERVICES" -gt 0 ]; then
    SERVICES_STATUS="critical"
fi

echo "\"failed_services\": $(safe_num "$FAILED_SERVICES"),"
echo "\"failed_services_list\": \"$(safe_str "$FAILED_LIST")\","
echo "\"services_status\": \"$SERVICES_STATUS\","

# =============================================================================
# ZOMBIE PROCESSES
# =============================================================================
ZOMBIE_COUNT=$(ps aux 2>/dev/null | awk '$8 ~ /Z/ {count++} END {print count+0}')
ZOMBIE_STATUS="ok"

if [ "$ZOMBIE_COUNT" -gt 10 ]; then
    ZOMBIE_STATUS="critical"
elif [ "$ZOMBIE_COUNT" -gt 0 ]; then
    ZOMBIE_STATUS="warning"
fi

echo "\"zombie_processes\": $(safe_num "$ZOMBIE_COUNT"),"
echo "\"zombie_status\": \"$ZOMBIE_STATUS\","

# =============================================================================
# TIME SYNC STATUS
# =============================================================================
TIME_SYNC="unknown"
TIME_STATUS="unknown"

# Check timedatectl first
if command -v timedatectl >/dev/null 2>&1; then
    if timedatectl status 2>/dev/null | grep -qE "synchronized: yes|NTP synchronized: yes"; then
        TIME_SYNC="synced"
        TIME_STATUS="ok"
    else
        TIME_SYNC="not synced"
        TIME_STATUS="warning"
    fi
# Check chronyc
elif command -v chronyc >/dev/null 2>&1; then
    if chronyc tracking 2>/dev/null | grep -q "Leap status.*Normal"; then
        TIME_SYNC="synced (chrony)"
        TIME_STATUS="ok"
    else
        TIME_SYNC="not synced"
        TIME_STATUS="warning"
    fi
# Check ntpstat
elif command -v ntpstat >/dev/null 2>&1; then
    if ntpstat >/dev/null 2>&1; then
        TIME_SYNC="synced (ntp)"
        TIME_STATUS="ok"
    else
        TIME_SYNC="not synced"
        TIME_STATUS="warning"
    fi
fi

echo "\"time_sync\": \"$(safe_str "$TIME_SYNC")\","
echo "\"time_status\": \"$TIME_STATUS\","

# =============================================================================
# NETWORK CONNECTIVITY (Quick check)
# =============================================================================
NET_STATUS="unknown"
NET_GATEWAY=""

# Get default gateway
NET_GATEWAY=$(ip route 2>/dev/null | grep default | head -1 | awk '{print $3}')

if [ -n "$NET_GATEWAY" ]; then
    # Quick ping to gateway (1 packet, 2 sec timeout)
    if ping -c 1 -W 2 "$NET_GATEWAY" >/dev/null 2>&1; then
        NET_STATUS="ok"
    else
        NET_STATUS="warning"
    fi
fi

echo "\"net_gateway\": \"$(safe_str "$NET_GATEWAY")\","
echo "\"net_status\": \"$NET_STATUS\","

# =============================================================================
# APT UPDATES
# =============================================================================
APT_TOTAL=0
APT_SECURITY=0
APT_PACKAGES="[]"

# Check if apt is available
if command -v apt-get >/dev/null 2>&1; then
    # Update package lists (quiet, don't fail)
    apt-get update -qq 2>/dev/null || true

    # Get upgradable packages
    APT_LIST=$(apt list --upgradable 2>/dev/null | grep -v "^Listing")
    APT_TOTAL=$(echo "$APT_LIST" | grep -c "upgradable" 2>/dev/null || echo "0")

    # Security updates (different detection methods)
    if [ -n "$APT_LIST" ]; then
        APT_SECURITY=$(echo "$APT_LIST" | grep -ci "security" 2>/dev/null || echo "0")
    fi

    # Build package list (max 50 for performance)
    if [ -n "$APT_LIST" ] && [ "$APT_TOTAL" -gt 0 ]; then
        APT_PACKAGES="["
        FIRST=true
        COUNT=0
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            [ $COUNT -ge 50 ] && break

            # Parse: package/suite version arch [upgradable from: old_version]
            PKG_NAME=$(echo "$line" | cut -d'/' -f1)
            NEW_VER=$(echo "$line" | awk '{print $2}')
            OLD_VER=$(echo "$line" | grep -oP 'from: \K[^\]]+' | head -1)
            IS_SEC="false"
            echo "$line" | grep -qi "security" && IS_SEC="true"

            if [ "$FIRST" = "true" ]; then
                FIRST=false
            else
                APT_PACKAGES+=","
            fi
            APT_PACKAGES+="{\"name\":\"$(safe_str "$PKG_NAME")\",\"new_version\":\"$(safe_str "$NEW_VER")\",\"old_version\":\"$(safe_str "$OLD_VER")\",\"is_security\":$IS_SEC}"
            COUNT=$((COUNT + 1))
        done <<< "$APT_LIST"
        APT_PACKAGES+="]"
    fi
fi

APT_STATUS="ok"
if [ "$APT_SECURITY" -gt 0 ]; then
    APT_STATUS="critical"
elif [ "$APT_TOTAL" -gt 0 ]; then
    APT_STATUS="warning"
fi

echo "\"apt_updates\": $(safe_num "$APT_TOTAL"),"
echo "\"apt_security\": $(safe_num "$APT_SECURITY"),"
echo "\"apt_status\": \"$APT_STATUS\","
echo "\"apt_packages\": $APT_PACKAGES,"

# =============================================================================
# PROXMOX SPECIFIC
# =============================================================================
IS_PROXMOX="false"
PVE_VERSION=""
PVE_REPO="unknown"

if command -v pveversion >/dev/null 2>&1; then
    IS_PROXMOX="true"
    PVE_VERSION=$(pveversion 2>/dev/null | grep -oP 'pve-manager/\K[0-9]+\.[0-9]+[.-][0-9]+' | head -1)

    # Detect active repository
    if [ -f /etc/apt/sources.list.d/pve-enterprise.list ]; then
        if grep -q "^deb.*enterprise" /etc/apt/sources.list.d/pve-enterprise.list 2>/dev/null; then
            PVE_REPO="enterprise"
        fi
    fi
    if [ -f /etc/apt/sources.list.d/pve-no-subscription.list ]; then
        if grep -q "^deb.*no-subscription" /etc/apt/sources.list.d/pve-no-subscription.list 2>/dev/null; then
            PVE_REPO="no-subscription"
        fi
    fi
    if [ -f /etc/apt/sources.list.d/pve-public-repo.list ]; then
        if grep -q "^deb.*no-subscription" /etc/apt/sources.list.d/pve-public-repo.list 2>/dev/null; then
            PVE_REPO="no-subscription"
        fi
    fi
    # PVE 9 style (deb822 format)
    if [ -f /etc/apt/sources.list.d/proxmox.sources ]; then
        if grep -q "pve-no-subscription" /etc/apt/sources.list.d/proxmox.sources 2>/dev/null; then
            PVE_REPO="no-subscription"
        elif grep -q "enterprise" /etc/apt/sources.list.d/proxmox.sources 2>/dev/null; then
            PVE_REPO="enterprise"
        fi
    fi
fi

echo "\"is_proxmox\": $IS_PROXMOX,"
echo "\"pve_version\": \"$(safe_str "$PVE_VERSION")\","
echo "\"pve_repo\": \"$(safe_str "$PVE_REPO")\","

# =============================================================================
# DOCKER (optional)
# =============================================================================
DOCKER_UPDATES=0
if command -v docker >/dev/null 2>&1; then
    DOCKER_UPDATES=$(docker images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -v "<none>" | wc -l)
fi
echo "\"docker_images\": $(safe_num "$DOCKER_UPDATES"),"

# =============================================================================
# DISK SPACE FOR UPDATES
# =============================================================================
APT_CACHE_FREE=0
if [ -d /var/cache/apt/archives ]; then
    APT_CACHE_FREE=$(df /var/cache/apt/archives 2>/dev/null | awk 'NR==2 {print int($4/1024)}')
fi
echo "\"apt_cache_free_mb\": $(safe_num "$APT_CACHE_FREE"),"

# =============================================================================
# NPM GLOBAL UPDATES (optional)
# =============================================================================
NPM_OUTDATED=0
if command -v npm >/dev/null 2>&1; then
    NPM_OUTDATED=$(npm outdated -g 2>/dev/null | tail -n +2 | wc -l || echo "0")
fi
echo "\"npm_outdated\": $(safe_num "$NPM_OUTDATED"),"

# =============================================================================
# OVERALL HEALTH SCORE
# =============================================================================
# Calculate overall health (simple scoring)
HEALTH_SCORE=100
HEALTH_STATUS="healthy"
ISSUES=""

# Deduct points for issues
[ "$CPU_TEMP_STATUS" = "warning" ] && HEALTH_SCORE=$((HEALTH_SCORE - 5)) && ISSUES="${ISSUES}CPU Temp, "
[ "$CPU_TEMP_STATUS" = "critical" ] && HEALTH_SCORE=$((HEALTH_SCORE - 15)) && ISSUES="${ISSUES}CPU Temp Critical, "
[ "$LOAD_STATUS" = "warning" ] && HEALTH_SCORE=$((HEALTH_SCORE - 5)) && ISSUES="${ISSUES}High Load, "
[ "$LOAD_STATUS" = "critical" ] && HEALTH_SCORE=$((HEALTH_SCORE - 15)) && ISSUES="${ISSUES}Very High Load, "
[ "$MEM_STATUS" = "warning" ] && HEALTH_SCORE=$((HEALTH_SCORE - 5)) && ISSUES="${ISSUES}Memory, "
[ "$MEM_STATUS" = "critical" ] && HEALTH_SCORE=$((HEALTH_SCORE - 15)) && ISSUES="${ISSUES}Memory Critical, "
[ "$SWAP_STATUS" = "warning" ] && HEALTH_SCORE=$((HEALTH_SCORE - 3)) && ISSUES="${ISSUES}Swap, "
[ "$SWAP_STATUS" = "critical" ] && HEALTH_SCORE=$((HEALTH_SCORE - 10)) && ISSUES="${ISSUES}Swap Critical, "
[ "$DISK_STATUS" = "warning" ] && HEALTH_SCORE=$((HEALTH_SCORE - 10)) && ISSUES="${ISSUES}Disk Space, "
[ "$DISK_STATUS" = "critical" ] && HEALTH_SCORE=$((HEALTH_SCORE - 25)) && ISSUES="${ISSUES}Disk Critical, "
[ "$SERVICES_STATUS" = "critical" ] && HEALTH_SCORE=$((HEALTH_SCORE - 10)) && ISSUES="${ISSUES}Failed Services, "
[ "$ZOMBIE_STATUS" = "warning" ] && HEALTH_SCORE=$((HEALTH_SCORE - 3)) && ISSUES="${ISSUES}Zombies, "
[ "$ZOMBIE_STATUS" = "critical" ] && HEALTH_SCORE=$((HEALTH_SCORE - 10)) && ISSUES="${ISSUES}Many Zombies, "
[ "$TIME_STATUS" = "warning" ] && HEALTH_SCORE=$((HEALTH_SCORE - 5)) && ISSUES="${ISSUES}Time Sync, "
[ "$REBOOT_REQUIRED" = "true" ] && HEALTH_SCORE=$((HEALTH_SCORE - 5)) && ISSUES="${ISSUES}Reboot Required, "
[ "$APT_STATUS" = "warning" ] && HEALTH_SCORE=$((HEALTH_SCORE - 3)) && ISSUES="${ISSUES}Updates Available, "
[ "$APT_STATUS" = "critical" ] && HEALTH_SCORE=$((HEALTH_SCORE - 10)) && ISSUES="${ISSUES}Security Updates, "

# Clamp score
[ "$HEALTH_SCORE" -lt 0 ] && HEALTH_SCORE=0

# Determine overall status
if [ "$HEALTH_SCORE" -ge 90 ]; then
    HEALTH_STATUS="healthy"
elif [ "$HEALTH_SCORE" -ge 70 ]; then
    HEALTH_STATUS="warning"
else
    HEALTH_STATUS="critical"
fi

# Remove trailing comma and space from issues
ISSUES=$(echo "$ISSUES" | sed 's/, $//')

echo "\"health_score\": $(safe_num "$HEALTH_SCORE"),"
echo "\"health_status\": \"$HEALTH_STATUS\","
echo "\"health_issues\": \"$(safe_str "$ISSUES")\""

echo "}"

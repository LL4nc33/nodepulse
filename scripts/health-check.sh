#!/bin/bash
# nodepulse Health-Check Script
# Prueft System-Updates, Reboot-Status, Kernel-Version

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

# --- APT Updates ---
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

echo "\"apt_updates\": $(safe_num "$APT_TOTAL"),"
echo "\"apt_security\": $(safe_num "$APT_SECURITY"),"
echo "\"apt_packages\": $APT_PACKAGES,"

# --- Proxmox Specific ---
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

# --- Docker Updates (optional) ---
DOCKER_UPDATES=0
if command -v docker >/dev/null 2>&1; then
    # Count images that could have updates (simplified - just count images)
    DOCKER_UPDATES=$(docker images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -v "<none>" | wc -l)
fi
echo "\"docker_images\": $(safe_num "$DOCKER_UPDATES"),"

# --- Disk Space for Updates ---
APT_CACHE_FREE=0
if [ -d /var/cache/apt/archives ]; then
    APT_CACHE_FREE=$(df /var/cache/apt/archives 2>/dev/null | awk 'NR==2 {print int($4/1024)}')
fi
echo "\"apt_cache_free_mb\": $(safe_num "$APT_CACHE_FREE"),"

# --- NPM Global Updates (optional) ---
NPM_OUTDATED=0
if command -v npm >/dev/null 2>&1; then
    NPM_OUTDATED=$(npm outdated -g 2>/dev/null | tail -n +2 | wc -l || echo "0")
fi
echo "\"npm_outdated\": $(safe_num "$NPM_OUTDATED")"

echo "}"

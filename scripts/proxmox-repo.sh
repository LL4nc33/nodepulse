#!/bin/bash
# nodepulse Proxmox Repository Management Script
# Wechselt zwischen Enterprise und No-Subscription Repository

ACTION="$1"  # "status", "enterprise", "no-subscription"

# Safe string output
safe_str() {
    local val="$1"
    if [ -z "$val" ]; then
        echo ""
    else
        echo "$val" | sed 's/"/\\"/g' | tr -d '\n'
    fi
}

# Check if running on Proxmox
if ! command -v pveversion >/dev/null 2>&1; then
    echo '{"success": false, "error": "Not a Proxmox system"}'
    exit 1
fi

# Detect PVE version and codename
PVE_MAJOR=$(pveversion 2>/dev/null | grep -oP 'pve-manager/\K[0-9]+' | head -1)
OS_CODENAME=$(grep "VERSION_CODENAME=" /etc/os-release 2>/dev/null | cut -d'=' -f2 | xargs)

if [ -z "$OS_CODENAME" ]; then
    OS_CODENAME=$(lsb_release -cs 2>/dev/null || echo "bookworm")
fi

# Detect current repository status
get_repo_status() {
    local enterprise="disabled"
    local no_subscription="disabled"
    local ceph_enterprise="disabled"

    # Enterprise repo
    if [ -f /etc/apt/sources.list.d/pve-enterprise.list ]; then
        if grep -q "^deb" /etc/apt/sources.list.d/pve-enterprise.list 2>/dev/null; then
            enterprise="enabled"
        fi
    fi

    # Ceph enterprise repo
    if [ -f /etc/apt/sources.list.d/ceph.list ]; then
        if grep -q "^deb.*enterprise" /etc/apt/sources.list.d/ceph.list 2>/dev/null; then
            ceph_enterprise="enabled"
        fi
    fi

    # No-subscription repo (multiple possible locations)
    if [ -f /etc/apt/sources.list.d/pve-no-subscription.list ]; then
        if grep -q "^deb" /etc/apt/sources.list.d/pve-no-subscription.list 2>/dev/null; then
            no_subscription="enabled"
        fi
    fi
    if [ -f /etc/apt/sources.list.d/pve-public-repo.list ]; then
        if grep -q "^deb.*no-subscription" /etc/apt/sources.list.d/pve-public-repo.list 2>/dev/null; then
            no_subscription="enabled"
        fi
    fi
    # PVE 9 style (deb822 format)
    if [ -f /etc/apt/sources.list.d/proxmox.sources ]; then
        if grep -q "pve-no-subscription" /etc/apt/sources.list.d/proxmox.sources 2>/dev/null; then
            no_subscription="enabled"
        fi
    fi

    echo "{"
    echo "\"success\": true,"
    echo "\"pve_version\": \"$PVE_MAJOR\","
    echo "\"os_codename\": \"$(safe_str "$OS_CODENAME")\","
    echo "\"enterprise\": \"$enterprise\","
    echo "\"ceph_enterprise\": \"$ceph_enterprise\","
    echo "\"no_subscription\": \"$no_subscription\","

    # Determine effective mode
    if [ "$no_subscription" = "enabled" ]; then
        echo "\"mode\": \"no-subscription\""
    elif [ "$enterprise" = "enabled" ]; then
        echo "\"mode\": \"enterprise\""
    else
        echo "\"mode\": \"none\""
    fi
    echo "}"
}

# Switch to enterprise repository
switch_to_enterprise() {
    local errors=""

    # Enable enterprise repo
    if [ -f /etc/apt/sources.list.d/pve-enterprise.list ]; then
        # Uncomment any commented deb lines
        sed -i 's/^#\s*deb/deb/g' /etc/apt/sources.list.d/pve-enterprise.list 2>/dev/null
    else
        # Create enterprise repo file
        echo "deb https://enterprise.proxmox.com/debian/pve $OS_CODENAME pve-enterprise" > /etc/apt/sources.list.d/pve-enterprise.list
    fi

    # Disable no-subscription repos
    if [ -f /etc/apt/sources.list.d/pve-no-subscription.list ]; then
        sed -i 's/^deb/#deb/g' /etc/apt/sources.list.d/pve-no-subscription.list 2>/dev/null
    fi
    if [ -f /etc/apt/sources.list.d/pve-public-repo.list ]; then
        sed -i 's/^deb/#deb/g' /etc/apt/sources.list.d/pve-public-repo.list 2>/dev/null
    fi

    # Update apt
    apt-get update -qq 2>&1 || errors="apt update failed"

    if [ -z "$errors" ]; then
        echo '{"success": true, "mode": "enterprise", "message": "Switched to enterprise repository. Subscription required."}'
    else
        echo "{\"success\": false, \"error\": \"$(safe_str "$errors")\"}"
    fi
}

# Switch to no-subscription repository
switch_to_no_subscription() {
    local errors=""

    # Disable enterprise repo
    if [ -f /etc/apt/sources.list.d/pve-enterprise.list ]; then
        sed -i 's/^deb/#deb/g' /etc/apt/sources.list.d/pve-enterprise.list 2>/dev/null
    fi

    # Disable ceph enterprise repo
    if [ -f /etc/apt/sources.list.d/ceph.list ]; then
        sed -i 's/^deb/#deb/g' /etc/apt/sources.list.d/ceph.list 2>/dev/null
    fi

    # Enable no-subscription repo based on PVE version
    if [ "$PVE_MAJOR" -ge 9 ]; then
        # PVE 9+ uses deb822 format
        cat > /etc/apt/sources.list.d/proxmox.sources << EOF
Enabled: true
Types: deb
URIs: http://download.proxmox.com/debian/pve
Suites: $OS_CODENAME
Components: pve-no-subscription
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
EOF
    else
        # PVE 8 and earlier
        echo "deb http://download.proxmox.com/debian/pve $OS_CODENAME pve-no-subscription" > /etc/apt/sources.list.d/pve-no-subscription.list
    fi

    # Also ensure Debian repos are correct
    local sources_file="/etc/apt/sources.list"
    if [ -f "$sources_file" ]; then
        # Backup
        cp "$sources_file" "${sources_file}.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null
    fi

    # Create proper Debian sources if missing essential repos
    if ! grep -q "deb.*$OS_CODENAME.*main" "$sources_file" 2>/dev/null; then
        cat > "$sources_file" << EOF
# Debian $OS_CODENAME repositories
deb http://deb.debian.org/debian $OS_CODENAME main contrib non-free non-free-firmware
deb http://deb.debian.org/debian ${OS_CODENAME}-updates main contrib non-free non-free-firmware
deb http://security.debian.org/debian-security ${OS_CODENAME}-security main contrib non-free non-free-firmware
EOF
    fi

    # Update apt
    apt-get update -qq 2>&1 || errors="apt update failed"

    if [ -z "$errors" ]; then
        echo '{"success": true, "mode": "no-subscription", "message": "Switched to no-subscription repository. Free but without official support."}'
    else
        echo "{\"success\": false, \"error\": \"$(safe_str "$errors")\"}"
    fi
}

# Run apt upgrade
run_upgrade() {
    local log_file="/var/log/nodepulse-upgrade-$(date +%Y%m%d-%H%M%S).log"

    # Check disk space
    local available_space=$(df /var/cache/apt/archives 2>/dev/null | awk 'NR==2 {print int($4/1024)}')
    if [ "$available_space" -lt 500 ]; then
        echo "{\"success\": false, \"error\": \"Insufficient disk space. Available: ${available_space}MB, required: 500MB\"}"
        exit 1
    fi

    # Run upgrade
    export DEBIAN_FRONTEND=noninteractive
    export NEEDRESTART_MODE=a
    export UCF_FORCE_CONFOLD=1

    apt-get update -qq 2>&1

    local upgradable=$(apt list --upgradable 2>/dev/null | grep -c "upgradable" || echo "0")

    if [ "$upgradable" -eq 0 ]; then
        echo '{"success": true, "message": "System is already up to date", "packages_upgraded": 0}'
        exit 0
    fi

    apt-get -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        dist-upgrade > "$log_file" 2>&1

    local result=$?

    # Cleanup
    apt-get -y autoremove > /dev/null 2>&1
    apt-get -y autoclean > /dev/null 2>&1

    # Check reboot required
    local reboot_required="false"
    if [ -f /var/run/reboot-required ]; then
        reboot_required="true"
    fi
    if grep -q "linux-image" "$log_file" 2>/dev/null; then
        reboot_required="true"
    fi

    if [ $result -eq 0 ]; then
        echo "{\"success\": true, \"message\": \"Upgrade completed\", \"packages_upgraded\": $upgradable, \"reboot_required\": $reboot_required, \"log_file\": \"$(safe_str "$log_file")\"}"
    else
        echo "{\"success\": false, \"error\": \"Upgrade failed. Check log: $log_file\", \"log_file\": \"$(safe_str "$log_file")\"}"
    fi
}

# Main
case "$ACTION" in
    "status")
        get_repo_status
        ;;
    "enterprise")
        switch_to_enterprise
        ;;
    "no-subscription")
        switch_to_no_subscription
        ;;
    "upgrade")
        run_upgrade
        ;;
    *)
        echo '{"success": false, "error": "Invalid action. Use: status, enterprise, no-subscription, upgrade"}'
        exit 1
        ;;
esac

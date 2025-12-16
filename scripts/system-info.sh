#!/bin/bash
# nodepulse System Info Script
# Sammelt ALLE verfuegbaren System-Informationen per SSH

# Escape string for JSON
json_escape() {
    printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

echo "{"

# === BASIC INFO ===
echo "\"basic\": {"
echo "  \"hostname\": \"$(json_escape "$(hostname)")\","
echo "  \"kernel\": \"$(json_escape "$(uname -r)")\","
echo "  \"kernel_full\": \"$(json_escape "$(uname -a)")\","
UPTIME_SECS=$(cat /proc/uptime 2>/dev/null | cut -d' ' -f1 | cut -d'.' -f1)
echo "  \"uptime_seconds\": ${UPTIME_SECS:-0},"
BOOT_TIME=$(who -b 2>/dev/null | awk '{print $3, $4}' || echo "")
echo "  \"boot_time\": \"$(json_escape "$BOOT_TIME")\","
TIMEZONE=$(timedatectl 2>/dev/null | grep "Time zone" | awk '{print $3}' || cat /etc/timezone 2>/dev/null || echo "unknown")
echo "  \"timezone\": \"$(json_escape "$TIMEZONE")\","
LOCALE=$(locale 2>/dev/null | grep LANG= | cut -d= -f2 || echo "")
echo "  \"locale\": \"$(json_escape "$LOCALE")\""
echo "},"

# === USERS & LOGINS ===
echo "\"users\": {"

# Current users
echo "  \"logged_in\": ["
who 2>/dev/null | awk '{printf "%s{\"user\": \"%s\", \"tty\": \"%s\", \"from\": \"%s\"}", (NR>1?",":""), $1, $2, $5}' || echo ""
echo "  ],"

# User accounts (non-system)
echo "  \"accounts\": ["
FIRST=1
while IFS=: read -r user _ uid gid _ home shell; do
    if [ "$uid" -ge 1000 ] && [ "$uid" -lt 65534 ] 2>/dev/null; then
        [ $FIRST -eq 0 ] && echo ","
        echo "    {\"user\": \"$(json_escape "$user")\", \"uid\": $uid, \"home\": \"$(json_escape "$home")\", \"shell\": \"$(json_escape "$shell")\"}"
        FIRST=0
    fi
done < /etc/passwd 2>/dev/null
echo "  ],"

# Last logins
echo "  \"last_logins\": ["
last -n 10 2>/dev/null | head -n -2 | awk '{printf "%s{\"user\": \"%s\", \"tty\": \"%s\", \"from\": \"%s\", \"time\": \"%s %s %s\"}", (NR>1?",":""), $1, $2, $3, $4, $5, $6}' 2>/dev/null || echo ""
echo "  ],"

# Failed logins
FAILED_COUNT=$(grep -c "Failed password" /var/log/auth.log 2>/dev/null || journalctl -u sshd 2>/dev/null | grep -c "Failed password" || echo "0")
echo "  \"failed_logins_24h\": $FAILED_COUNT"
echo "},"

# === PROCESSES ===
echo "\"processes\": {"
echo "  \"total\": $(ps aux 2>/dev/null | wc -l),"
echo "  \"running\": $(ps aux 2>/dev/null | awk '$8 ~ /R/ {count++} END {print count+0}'),"
LOAD=$(cat /proc/loadavg 2>/dev/null)
echo "  \"load_1m\": $(echo "$LOAD" | awk '{print $1}'),"
echo "  \"load_5m\": $(echo "$LOAD" | awk '{print $2}'),"
echo "  \"load_15m\": $(echo "$LOAD" | awk '{print $3}'),"

# Top 10 by CPU
echo "  \"top_cpu\": ["
ps aux --sort=-%cpu 2>/dev/null | head -11 | tail -10 | awk '{printf "%s{\"user\": \"%s\", \"pid\": %s, \"cpu\": %s, \"mem\": %s, \"command\": \"%s\"}", (NR>1?",":""), $1, $2, $3, $4, $11}' 2>/dev/null || echo ""
echo "  ],"

# Top 10 by Memory
echo "  \"top_mem\": ["
ps aux --sort=-%mem 2>/dev/null | head -11 | tail -10 | awk '{printf "%s{\"user\": \"%s\", \"pid\": %s, \"cpu\": %s, \"mem\": %s, \"command\": \"%s\"}", (NR>1?",":""), $1, $2, $3, $4, $11}' 2>/dev/null || echo ""
echo "  ]"
echo "},"

# === NETWORK ===
echo "\"network\": {"

# Open ports
echo "  \"listening_ports\": ["
ss -tulpn 2>/dev/null | tail -n +2 | awk '{
    split($5, a, ":");
    port = a[length(a)];
    proto = $1;
    process = $7;
    gsub(/.*"/, "", process);
    gsub(/".*/, "", process);
    printf "%s{\"proto\": \"%s\", \"port\": \"%s\", \"process\": \"%s\"}", (NR>1?",":""), proto, port, process
}' 2>/dev/null || echo ""
echo "  ],"

# Active connections count
echo "  \"connections\": {"
echo "    \"established\": $(ss -t state established 2>/dev/null | wc -l),"
echo "    \"time_wait\": $(ss -t state time-wait 2>/dev/null | wc -l),"
echo "    \"close_wait\": $(ss -t state close-wait 2>/dev/null | wc -l)"
echo "  },"

# DNS servers
echo "  \"dns_servers\": ["
grep "^nameserver" /etc/resolv.conf 2>/dev/null | awk '{printf "%s\"%s\"", (NR>1?",":""), $2}' || echo ""
echo "  ],"

# Default gateway
GATEWAY=$(ip route 2>/dev/null | grep default | awk '{print $3}' | head -1)
echo "  \"default_gateway\": \"$(json_escape "$GATEWAY")\""
echo "},"

# === STORAGE ===
echo "\"storage\": {"

# Filesystems
echo "  \"filesystems\": ["
df -hT 2>/dev/null | tail -n +2 | awk '{printf "%s{\"device\": \"%s\", \"type\": \"%s\", \"size\": \"%s\", \"used\": \"%s\", \"avail\": \"%s\", \"use_percent\": \"%s\", \"mount\": \"%s\"}", (NR>1?",":""), $1, $2, $3, $4, $5, $6, $7}' 2>/dev/null || echo ""
echo "  ],"

# Block devices
echo "  \"block_devices\": ["
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,MODEL 2>/dev/null | tail -n +2 | awk '{printf "%s{\"name\": \"%s\", \"size\": \"%s\", \"type\": \"%s\", \"mount\": \"%s\", \"fstype\": \"%s\", \"model\": \"%s\"}", (NR>1?",":""), $1, $2, $3, $4, $5, $6}' 2>/dev/null || echo ""
echo "  ],"

# RAID status
MDSTAT=""
if [ -f /proc/mdstat ]; then
    MDSTAT=$(cat /proc/mdstat 2>/dev/null | grep -E "^md|^\[")
fi
echo "  \"raid_status\": \"$(json_escape "$MDSTAT")\","

# ZFS status
ZFS_STATUS=""
if command -v zpool &>/dev/null; then
    ZFS_STATUS=$(zpool status 2>/dev/null | head -20)
fi
echo "  \"zfs_status\": \"$(json_escape "$ZFS_STATUS")\""
echo "},"

# === PACKAGES ===
echo "\"packages\": {"

# Package manager detection
PKG_MANAGER="unknown"
PKG_COUNT=0
UPDATES_COUNT=0

if command -v apt &>/dev/null; then
    PKG_MANAGER="apt"
    PKG_COUNT=$(dpkg -l 2>/dev/null | grep -c "^ii")
    UPDATES_COUNT=$(apt list --upgradable 2>/dev/null | grep -c upgradable || echo "0")
elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
    PKG_COUNT=$(rpm -qa 2>/dev/null | wc -l)
    UPDATES_COUNT=$(dnf check-update 2>/dev/null | grep -c "^[a-zA-Z]" || echo "0")
elif command -v yum &>/dev/null; then
    PKG_MANAGER="yum"
    PKG_COUNT=$(rpm -qa 2>/dev/null | wc -l)
elif command -v pacman &>/dev/null; then
    PKG_MANAGER="pacman"
    PKG_COUNT=$(pacman -Q 2>/dev/null | wc -l)
elif command -v apk &>/dev/null; then
    PKG_MANAGER="apk"
    PKG_COUNT=$(apk list --installed 2>/dev/null | wc -l)
fi

echo "  \"manager\": \"$PKG_MANAGER\","
echo "  \"installed_count\": $PKG_COUNT,"
echo "  \"updates_available\": $UPDATES_COUNT"
echo "},"

# === SECURITY ===
echo "\"security\": {"

# Firewall status
FW_STATUS="unknown"
FW_RULES=""
if command -v ufw &>/dev/null; then
    FW_STATUS=$(ufw status 2>/dev/null | head -1)
    FW_RULES=$(ufw status numbered 2>/dev/null | tail -n +4 | head -10)
elif command -v firewall-cmd &>/dev/null; then
    FW_STATUS=$(firewall-cmd --state 2>/dev/null)
    FW_RULES=$(firewall-cmd --list-all 2>/dev/null | head -20)
elif command -v iptables &>/dev/null; then
    FW_STATUS="iptables"
    FW_RULES=$(iptables -L -n 2>/dev/null | head -30)
fi
echo "  \"firewall_status\": \"$(json_escape "$FW_STATUS")\","
echo "  \"firewall_rules\": \"$(json_escape "$FW_RULES")\","

# SELinux/AppArmor
if command -v getenforce &>/dev/null; then
    SELINUX=$(getenforce 2>/dev/null)
    echo "  \"selinux\": \"$(json_escape "$SELINUX")\","
else
    echo "  \"selinux\": null,"
fi

if [ -d /etc/apparmor.d ]; then
    APPARMOR=$(aa-status 2>/dev/null | head -5 || echo "installed")
    echo "  \"apparmor\": \"$(json_escape "$APPARMOR")\","
else
    echo "  \"apparmor\": null,"
fi

# SSH config
SSH_PORT=$(grep "^Port" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22")
ROOT_LOGIN=$(grep "^PermitRootLogin" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "unknown")
PASS_AUTH=$(grep "^PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "unknown")
echo "  \"ssh_port\": \"$SSH_PORT\","
echo "  \"ssh_root_login\": \"$ROOT_LOGIN\","
echo "  \"ssh_password_auth\": \"$PASS_AUTH\""
echo "},"

# === SERVICES ===
echo "\"services\": {"

# Running services count
if command -v systemctl &>/dev/null; then
    RUNNING=$(systemctl list-units --type=service --state=running 2>/dev/null | grep -c "running")
    FAILED=$(systemctl list-units --type=service --state=failed 2>/dev/null | grep -c "failed")
    echo "  \"running\": $RUNNING,"
    echo "  \"failed\": $FAILED,"

    # Failed services list
    echo "  \"failed_list\": ["
    systemctl list-units --type=service --state=failed 2>/dev/null | grep "failed" | awk '{printf "%s\"%s\"", (NR>1?",":""), $2}' 2>/dev/null || echo ""
    echo "  ]"
else
    echo "  \"running\": null,"
    echo "  \"failed\": null,"
    echo "  \"failed_list\": []"
fi
echo "},"

# === CRON JOBS ===
echo "\"cron\": {"

# System cron
echo "  \"system\": ["
if [ -f /etc/crontab ]; then
    grep -v "^#" /etc/crontab 2>/dev/null | grep -v "^$" | head -10 | while read -r line; do
        printf '"%s",' "$(json_escape "$line")"
    done | sed 's/,$//'
fi
echo "  ],"

# User cron
echo "  \"user\": ["
crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" | head -10 | while read -r line; do
    printf '"%s",' "$(json_escape "$line")"
done | sed 's/,$//'
echo "  ]"
echo "},"

# === HARDWARE EXTRA ===
echo "\"hardware_extra\": {"

# USB devices
echo "  \"usb_devices\": ["
if command -v lsusb &>/dev/null; then
    lsusb 2>/dev/null | awk -F': ' '{printf "%s{\"bus\": \"%s\", \"device\": \"%s\"}", (NR>1?",":""), $1, $2}' 2>/dev/null || echo ""
fi
echo "  ],"

# PCI devices summary
echo "  \"pci_devices\": ["
if command -v lspci &>/dev/null; then
    lspci 2>/dev/null | head -20 | while IFS= read -r line; do
        printf '"%s",' "$(json_escape "$line")"
    done | sed 's/,$//'
fi
echo "  ],"

# Kernel modules
echo "  \"kernel_modules\": ["
lsmod 2>/dev/null | tail -n +2 | head -20 | awk '{printf "%s\"%s\"", (NR>1?",":""), $1}' 2>/dev/null || echo ""
echo "  ],"

# Sensors/Temperature
echo "  \"sensors\": ["
if command -v sensors &>/dev/null; then
    sensors 2>/dev/null | grep -E "°C|temp" | head -10 | while IFS= read -r line; do
        printf '"%s",' "$(json_escape "$line")"
    done | sed 's/,$//'
fi
echo "  ]"
echo "},"

# === LOGS (recent) ===
echo "\"logs\": {"

# Last syslog entries
echo "  \"syslog\": ["
if [ -f /var/log/syslog ]; then
    tail -20 /var/log/syslog 2>/dev/null | while IFS= read -r line; do
        printf '"%s",' "$(json_escape "$line")"
    done | sed 's/,$//'
elif command -v journalctl &>/dev/null; then
    journalctl -n 20 --no-pager 2>/dev/null | while IFS= read -r line; do
        printf '"%s",' "$(json_escape "$line")"
    done | sed 's/,$//'
fi
echo "  ],"

# Auth log (last entries)
echo "  \"auth\": ["
if [ -f /var/log/auth.log ]; then
    tail -10 /var/log/auth.log 2>/dev/null | while IFS= read -r line; do
        printf '"%s",' "$(json_escape "$line")"
    done | sed 's/,$//'
fi
echo "  ],"

# Dmesg (hardware messages)
echo "  \"dmesg\": ["
dmesg 2>/dev/null | tail -10 | while IFS= read -r line; do
    printf '"%s",' "$(json_escape "$line")"
done | sed 's/,$//'
echo "  ]"
echo "}"

echo "}"

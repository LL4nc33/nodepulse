#!/bin/bash
# nodepulse System Info Script
# Sammelt ALLE verfuegbaren System-Informationen per SSH
# Robuste JSON-Ausgabe mit korrektem Escaping

# Escape string for JSON - handles all special characters
json_escape() {
    local str="$1"
    # Remove control characters, escape backslashes and quotes
    printf '%s' "$str" | \
        tr -d '\000-\011\013-\037' | \
        sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | \
        tr '\n' ' '
}

# Safe number output (returns 0 if empty/invalid)
safe_num() {
    local val="$1"
    if [ -z "$val" ] || ! [[ "$val" =~ ^[0-9.]+$ ]]; then
        echo "0"
    else
        echo "$val"
    fi
}

echo "{"

# === BASIC INFO ===
echo "\"basic\": {"
HOSTNAME_VAL=$(hostname 2>/dev/null || echo "unknown")
echo "  \"hostname\": \"$(json_escape "$HOSTNAME_VAL")\","
KERNEL_VAL=$(uname -r 2>/dev/null || echo "unknown")
echo "  \"kernel\": \"$(json_escape "$KERNEL_VAL")\","
KERNEL_FULL=$(uname -a 2>/dev/null || echo "unknown")
echo "  \"kernel_full\": \"$(json_escape "$KERNEL_FULL")\","
UPTIME_SECS=$(cat /proc/uptime 2>/dev/null | cut -d' ' -f1 | cut -d'.' -f1)
echo "  \"uptime_seconds\": $(safe_num "$UPTIME_SECS"),"
BOOT_TIME=$(who -b 2>/dev/null | awk '{print $3, $4}')
echo "  \"boot_time\": \"$(json_escape "$BOOT_TIME")\","
TIMEZONE=$(timedatectl 2>/dev/null | grep "Time zone" | awk '{print $3}')
[ -z "$TIMEZONE" ] && TIMEZONE=$(cat /etc/timezone 2>/dev/null)
[ -z "$TIMEZONE" ] && TIMEZONE="unknown"
echo "  \"timezone\": \"$(json_escape "$TIMEZONE")\","
LOCALE=$(locale 2>/dev/null | grep LANG= | cut -d= -f2)
echo "  \"locale\": \"$(json_escape "$LOCALE")\""
echo "},"

# === USERS & LOGINS ===
echo "\"users\": {"

# Current users - collect to temp var for proper JSON
echo "  \"logged_in\": ["
LOGGED_IN=""
while IFS= read -r line; do
    USER_NAME=$(echo "$line" | awk '{print $1}')
    USER_TTY=$(echo "$line" | awk '{print $2}')
    USER_FROM=$(echo "$line" | awk '{print $5}')
    [ -n "$LOGGED_IN" ] && LOGGED_IN="$LOGGED_IN,"
    LOGGED_IN="$LOGGED_IN{\"user\": \"$(json_escape "$USER_NAME")\", \"tty\": \"$(json_escape "$USER_TTY")\", \"from\": \"$(json_escape "$USER_FROM")\"}"
done < <(who 2>/dev/null)
echo "$LOGGED_IN"
echo "  ],"

# User accounts (non-system)
echo "  \"accounts\": ["
ACCOUNTS=""
while IFS=: read -r user _ uid gid _ home shell; do
    if [ -n "$uid" ] && [ "$uid" -ge 1000 ] 2>/dev/null && [ "$uid" -lt 65534 ] 2>/dev/null; then
        [ -n "$ACCOUNTS" ] && ACCOUNTS="$ACCOUNTS,"
        ACCOUNTS="$ACCOUNTS{\"user\": \"$(json_escape "$user")\", \"uid\": $uid, \"home\": \"$(json_escape "$home")\", \"shell\": \"$(json_escape "$shell")\"}"
    fi
done < /etc/passwd 2>/dev/null
echo "$ACCOUNTS"
echo "  ],"

# Last logins
echo "  \"last_logins\": ["
LAST_LOGINS=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    L_USER=$(echo "$line" | awk '{print $1}')
    L_TTY=$(echo "$line" | awk '{print $2}')
    L_FROM=$(echo "$line" | awk '{print $3}')
    L_TIME=$(echo "$line" | awk '{print $4, $5, $6}')
    [ -n "$LAST_LOGINS" ] && LAST_LOGINS="$LAST_LOGINS,"
    LAST_LOGINS="$LAST_LOGINS{\"user\": \"$(json_escape "$L_USER")\", \"tty\": \"$(json_escape "$L_TTY")\", \"from\": \"$(json_escape "$L_FROM")\", \"time\": \"$(json_escape "$L_TIME")\"}"
done < <(last -n 10 2>/dev/null | head -n -2 | head -10)
echo "$LAST_LOGINS"
echo "  ],"

# Failed logins
FAILED_COUNT=$(grep -c "Failed password" /var/log/auth.log 2>/dev/null || echo "0")
[ -z "$FAILED_COUNT" ] && FAILED_COUNT=0
echo "  \"failed_logins_24h\": $(safe_num "$FAILED_COUNT")"
echo "},"

# === PROCESSES ===
echo "\"processes\": {"
PROC_TOTAL=$(ps aux 2>/dev/null | wc -l)
echo "  \"total\": $(safe_num "$PROC_TOTAL"),"
PROC_RUNNING=$(ps aux 2>/dev/null | awk '$8 ~ /R/ {count++} END {print count+0}')
echo "  \"running\": $(safe_num "$PROC_RUNNING"),"
LOAD=$(cat /proc/loadavg 2>/dev/null)
LOAD_1=$(echo "$LOAD" | awk '{print $1}')
LOAD_5=$(echo "$LOAD" | awk '{print $2}')
LOAD_15=$(echo "$LOAD" | awk '{print $3}')
echo "  \"load_1m\": $(safe_num "$LOAD_1"),"
echo "  \"load_5m\": $(safe_num "$LOAD_5"),"
echo "  \"load_15m\": $(safe_num "$LOAD_15"),"

# Top 10 by CPU
echo "  \"top_cpu\": ["
TOP_CPU=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    P_USER=$(echo "$line" | awk '{print $1}')
    P_PID=$(echo "$line" | awk '{print $2}')
    P_CPU=$(echo "$line" | awk '{print $3}')
    P_MEM=$(echo "$line" | awk '{print $4}')
    P_CMD=$(echo "$line" | awk '{print $11}')
    [ -n "$TOP_CPU" ] && TOP_CPU="$TOP_CPU,"
    TOP_CPU="$TOP_CPU{\"user\": \"$(json_escape "$P_USER")\", \"pid\": $(safe_num "$P_PID"), \"cpu\": $(safe_num "$P_CPU"), \"mem\": $(safe_num "$P_MEM"), \"command\": \"$(json_escape "$P_CMD")\"}"
done < <(ps aux --sort=-%cpu 2>/dev/null | head -11 | tail -10)
echo "$TOP_CPU"
echo "  ],"

# Top 10 by Memory
echo "  \"top_mem\": ["
TOP_MEM=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    P_USER=$(echo "$line" | awk '{print $1}')
    P_PID=$(echo "$line" | awk '{print $2}')
    P_CPU=$(echo "$line" | awk '{print $3}')
    P_MEM=$(echo "$line" | awk '{print $4}')
    P_CMD=$(echo "$line" | awk '{print $11}')
    [ -n "$TOP_MEM" ] && TOP_MEM="$TOP_MEM,"
    TOP_MEM="$TOP_MEM{\"user\": \"$(json_escape "$P_USER")\", \"pid\": $(safe_num "$P_PID"), \"cpu\": $(safe_num "$P_CPU"), \"mem\": $(safe_num "$P_MEM"), \"command\": \"$(json_escape "$P_CMD")\"}"
done < <(ps aux --sort=-%mem 2>/dev/null | head -11 | tail -10)
echo "$TOP_MEM"
echo "  ]"
echo "},"

# === NETWORK ===
echo "\"network\": {"

# Open ports
echo "  \"listening_ports\": ["
PORTS=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    PROTO=$(echo "$line" | awk '{print $1}')
    LOCAL=$(echo "$line" | awk '{print $5}')
    PORT=$(echo "$LOCAL" | rev | cut -d: -f1 | rev)
    PROC=$(echo "$line" | awk '{print $7}' | sed 's/.*"\([^"]*\)".*/\1/')
    [ -n "$PORTS" ] && PORTS="$PORTS,"
    PORTS="$PORTS{\"proto\": \"$(json_escape "$PROTO")\", \"port\": \"$(json_escape "$PORT")\", \"process\": \"$(json_escape "$PROC")\"}"
done < <(ss -tulpn 2>/dev/null | tail -n +2 | head -50)
echo "$PORTS"
echo "  ],"

# Active connections count
CONN_EST=$(ss -t state established 2>/dev/null | wc -l)
CONN_TW=$(ss -t state time-wait 2>/dev/null | wc -l)
CONN_CW=$(ss -t state close-wait 2>/dev/null | wc -l)
echo "  \"connections\": {"
echo "    \"established\": $(safe_num "$CONN_EST"),"
echo "    \"time_wait\": $(safe_num "$CONN_TW"),"
echo "    \"close_wait\": $(safe_num "$CONN_CW")"
echo "  },"

# DNS servers
echo "  \"dns_servers\": ["
DNS=""
while IFS= read -r line; do
    NS=$(echo "$line" | awk '{print $2}')
    [ -z "$NS" ] && continue
    [ -n "$DNS" ] && DNS="$DNS,"
    DNS="$DNS\"$(json_escape "$NS")\""
done < <(grep "^nameserver" /etc/resolv.conf 2>/dev/null)
echo "$DNS"
echo "  ],"

# Default gateway
GATEWAY=$(ip route 2>/dev/null | grep default | awk '{print $3}' | head -1)
echo "  \"default_gateway\": \"$(json_escape "$GATEWAY")\""
echo "},"

# === STORAGE ===
echo "\"storage\": {"

# Filesystems
echo "  \"filesystems\": ["
FS_LIST=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    F_DEV=$(echo "$line" | awk '{print $1}')
    F_TYPE=$(echo "$line" | awk '{print $2}')
    F_SIZE=$(echo "$line" | awk '{print $3}')
    F_USED=$(echo "$line" | awk '{print $4}')
    F_AVAIL=$(echo "$line" | awk '{print $5}')
    F_PERC=$(echo "$line" | awk '{print $6}')
    F_MOUNT=$(echo "$line" | awk '{print $7}')
    [ -n "$FS_LIST" ] && FS_LIST="$FS_LIST,"
    FS_LIST="$FS_LIST{\"device\": \"$(json_escape "$F_DEV")\", \"type\": \"$(json_escape "$F_TYPE")\", \"size\": \"$(json_escape "$F_SIZE")\", \"used\": \"$(json_escape "$F_USED")\", \"avail\": \"$(json_escape "$F_AVAIL")\", \"use_percent\": \"$(json_escape "$F_PERC")\", \"mount\": \"$(json_escape "$F_MOUNT")\"}"
done < <(df -hT 2>/dev/null | tail -n +2)
echo "$FS_LIST"
echo "  ],"

# Block devices
echo "  \"block_devices\": ["
BLK_LIST=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    B_NAME=$(echo "$line" | awk '{print $1}')
    B_SIZE=$(echo "$line" | awk '{print $2}')
    B_TYPE=$(echo "$line" | awk '{print $3}')
    B_MOUNT=$(echo "$line" | awk '{print $4}')
    B_FS=$(echo "$line" | awk '{print $5}')
    B_MODEL=$(echo "$line" | awk '{print $6}')
    [ -n "$BLK_LIST" ] && BLK_LIST="$BLK_LIST,"
    BLK_LIST="$BLK_LIST{\"name\": \"$(json_escape "$B_NAME")\", \"size\": \"$(json_escape "$B_SIZE")\", \"type\": \"$(json_escape "$B_TYPE")\", \"mount\": \"$(json_escape "$B_MOUNT")\", \"fstype\": \"$(json_escape "$B_FS")\", \"model\": \"$(json_escape "$B_MODEL")\"}"
done < <(lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,MODEL 2>/dev/null | tail -n +2)
echo "$BLK_LIST"
echo "  ],"

# RAID status
MDSTAT=""
if [ -f /proc/mdstat ]; then
    MDSTAT=$(cat /proc/mdstat 2>/dev/null | grep -E "^md|^\[" | head -5)
fi
echo "  \"raid_status\": \"$(json_escape "$MDSTAT")\","

# ZFS status
ZFS_STATUS=""
if command -v zpool &>/dev/null; then
    ZFS_STATUS=$(zpool status 2>/dev/null | head -10)
fi
echo "  \"zfs_status\": \"$(json_escape "$ZFS_STATUS")\""
echo "},"

# === PACKAGES ===
echo "\"packages\": {"
PKG_MANAGER="unknown"
PKG_COUNT=0
UPDATES_COUNT=0

if command -v apt &>/dev/null; then
    PKG_MANAGER="apt"
    PKG_COUNT=$(dpkg -l 2>/dev/null | grep -c "^ii" || echo "0")
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
echo "  \"installed_count\": $(safe_num "$PKG_COUNT"),"
echo "  \"updates_available\": $(safe_num "$UPDATES_COUNT")"
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
    FW_RULES=$(firewall-cmd --list-all 2>/dev/null | head -10)
elif command -v iptables &>/dev/null; then
    FW_STATUS="iptables"
    FW_RULES=$(iptables -L -n 2>/dev/null | head -20)
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
    APPARMOR=$(aa-status 2>/dev/null | head -3 || echo "installed")
    echo "  \"apparmor\": \"$(json_escape "$APPARMOR")\","
else
    echo "  \"apparmor\": null,"
fi

# SSH config
SSH_PORT=$(grep "^Port" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
[ -z "$SSH_PORT" ] && SSH_PORT="22"
ROOT_LOGIN=$(grep "^PermitRootLogin" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
[ -z "$ROOT_LOGIN" ] && ROOT_LOGIN="unknown"
PASS_AUTH=$(grep "^PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
[ -z "$PASS_AUTH" ] && PASS_AUTH="unknown"
echo "  \"ssh_port\": \"$SSH_PORT\","
echo "  \"ssh_root_login\": \"$ROOT_LOGIN\","
echo "  \"ssh_password_auth\": \"$PASS_AUTH\""
echo "},"

# === SERVICES ===
echo "\"services\": {"
if command -v systemctl &>/dev/null; then
    RUNNING=$(systemctl list-units --type=service --state=running 2>/dev/null | grep -c "running" || echo "0")
    FAILED=$(systemctl list-units --type=service --state=failed 2>/dev/null | grep -c "failed" || echo "0")
    echo "  \"running\": $(safe_num "$RUNNING"),"
    echo "  \"failed\": $(safe_num "$FAILED"),"

    # Failed services list
    echo "  \"failed_list\": ["
    FAIL_LIST=""
    while IFS= read -r line; do
        SVC=$(echo "$line" | awk '{print $2}')
        [ -z "$SVC" ] && continue
        [ -n "$FAIL_LIST" ] && FAIL_LIST="$FAIL_LIST,"
        FAIL_LIST="$FAIL_LIST\"$(json_escape "$SVC")\""
    done < <(systemctl list-units --type=service --state=failed 2>/dev/null | grep "failed")
    echo "$FAIL_LIST"
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
CRON_SYS=""
if [ -f /etc/crontab ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        [ -n "$CRON_SYS" ] && CRON_SYS="$CRON_SYS,"
        CRON_SYS="$CRON_SYS\"$(json_escape "$line")\""
    done < <(grep -v "^#" /etc/crontab 2>/dev/null | grep -v "^$" | head -10)
fi
echo "$CRON_SYS"
echo "  ],"

# User cron
echo "  \"user\": ["
CRON_USER=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    [ -n "$CRON_USER" ] && CRON_USER="$CRON_USER,"
    CRON_USER="$CRON_USER\"$(json_escape "$line")\""
done < <(crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" | head -10)
echo "$CRON_USER"
echo "  ]"
echo "},"

# === HARDWARE EXTRA ===
echo "\"hardware_extra\": {"

# USB devices
echo "  \"usb_devices\": ["
USB_LIST=""
if command -v lsusb &>/dev/null; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        USB_BUS=$(echo "$line" | cut -d: -f1)
        USB_DEV=$(echo "$line" | cut -d: -f2-)
        [ -n "$USB_LIST" ] && USB_LIST="$USB_LIST,"
        USB_LIST="$USB_LIST{\"bus\": \"$(json_escape "$USB_BUS")\", \"device\": \"$(json_escape "$USB_DEV")\"}"
    done < <(lsusb 2>/dev/null | head -20)
fi
echo "$USB_LIST"
echo "  ],"

# PCI devices summary
echo "  \"pci_devices\": ["
PCI_LIST=""
if command -v lspci &>/dev/null; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        [ -n "$PCI_LIST" ] && PCI_LIST="$PCI_LIST,"
        PCI_LIST="$PCI_LIST\"$(json_escape "$line")\""
    done < <(lspci 2>/dev/null | head -15)
fi
echo "$PCI_LIST"
echo "  ],"

# Kernel modules
echo "  \"kernel_modules\": ["
MOD_LIST=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    MOD_NAME=$(echo "$line" | awk '{print $1}')
    [ -n "$MOD_LIST" ] && MOD_LIST="$MOD_LIST,"
    MOD_LIST="$MOD_LIST\"$(json_escape "$MOD_NAME")\""
done < <(lsmod 2>/dev/null | tail -n +2 | head -20)
echo "$MOD_LIST"
echo "  ],"

# Sensors/Temperature
echo "  \"sensors\": ["
SENSOR_LIST=""
if command -v sensors &>/dev/null; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        [ -n "$SENSOR_LIST" ] && SENSOR_LIST="$SENSOR_LIST,"
        SENSOR_LIST="$SENSOR_LIST\"$(json_escape "$line")\""
    done < <(sensors 2>/dev/null | grep -E "°C|temp" | head -10)
fi
echo "$SENSOR_LIST"
echo "  ]"
echo "},"

# === LOGS (recent) ===
echo "\"logs\": {"

# Last syslog entries
echo "  \"syslog\": ["
SYSLOG_LIST=""
if [ -f /var/log/syslog ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        [ -n "$SYSLOG_LIST" ] && SYSLOG_LIST="$SYSLOG_LIST,"
        SYSLOG_LIST="$SYSLOG_LIST\"$(json_escape "$line")\""
    done < <(tail -15 /var/log/syslog 2>/dev/null)
elif command -v journalctl &>/dev/null; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        [ -n "$SYSLOG_LIST" ] && SYSLOG_LIST="$SYSLOG_LIST,"
        SYSLOG_LIST="$SYSLOG_LIST\"$(json_escape "$line")\""
    done < <(journalctl -n 15 --no-pager 2>/dev/null)
fi
echo "$SYSLOG_LIST"
echo "  ],"

# Auth log (last entries)
echo "  \"auth\": ["
AUTH_LIST=""
if [ -f /var/log/auth.log ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        [ -n "$AUTH_LIST" ] && AUTH_LIST="$AUTH_LIST,"
        AUTH_LIST="$AUTH_LIST\"$(json_escape "$line")\""
    done < <(tail -10 /var/log/auth.log 2>/dev/null)
fi
echo "$AUTH_LIST"
echo "  ],"

# Dmesg (hardware messages)
echo "  \"dmesg\": ["
DMESG_LIST=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    [ -n "$DMESG_LIST" ] && DMESG_LIST="$DMESG_LIST,"
    DMESG_LIST="$DMESG_LIST\"$(json_escape "$line")\""
done < <(dmesg 2>/dev/null | tail -10)
echo "$DMESG_LIST"
echo "  ]"
echo "}"

echo "}"

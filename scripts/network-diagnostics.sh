#!/bin/bash
# nodepulse Network Diagnostics Script
# Sammelt Netzwerk-Informationen und fuehrt Diagnose-Tests durch

# Escape string for JSON
json_escape() {
    printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

echo "{"

# === INTERFACES ===
echo "\"interfaces\": ["
ip -o link show 2>/dev/null | while read -r num name rest; do
    IFACE=$(echo "$name" | tr -d ':')
    STATE=$(echo "$rest" | grep -oP 'state \K\w+' || echo "unknown")
    MAC=$(echo "$rest" | grep -oP 'link/ether \K[0-9a-f:]+' || echo "")
    MTU=$(echo "$rest" | grep -oP 'mtu \K\d+' || echo "")

    # Get IP addresses
    IPV4=$(ip -4 addr show "$IFACE" 2>/dev/null | grep -oP 'inet \K[0-9./]+' | head -1)
    IPV6=$(ip -6 addr show "$IFACE" 2>/dev/null | grep -oP 'inet6 \K[0-9a-f:/]+' | grep -v "^fe80" | head -1)

    # Get RX/TX stats
    RX_BYTES=$(cat /sys/class/net/"$IFACE"/statistics/rx_bytes 2>/dev/null || echo "0")
    TX_BYTES=$(cat /sys/class/net/"$IFACE"/statistics/tx_bytes 2>/dev/null || echo "0")
    RX_PACKETS=$(cat /sys/class/net/"$IFACE"/statistics/rx_packets 2>/dev/null || echo "0")
    TX_PACKETS=$(cat /sys/class/net/"$IFACE"/statistics/tx_packets 2>/dev/null || echo "0")
    RX_ERRORS=$(cat /sys/class/net/"$IFACE"/statistics/rx_errors 2>/dev/null || echo "0")
    TX_ERRORS=$(cat /sys/class/net/"$IFACE"/statistics/tx_errors 2>/dev/null || echo "0")

    # Get speed if available
    SPEED=$(cat /sys/class/net/"$IFACE"/speed 2>/dev/null || echo "null")
    [ "$SPEED" = "-1" ] && SPEED="null"

    printf '%s{"name": "%s", "state": "%s", "mac": "%s", "mtu": "%s", "ipv4": "%s", "ipv6": "%s", "speed": %s, "rx_bytes": %s, "tx_bytes": %s, "rx_packets": %s, "tx_packets": %s, "rx_errors": %s, "tx_errors": %s}' \
        "${FIRST_IFACE:-}" "$IFACE" "$STATE" "$MAC" "$MTU" "$IPV4" "$IPV6" "$SPEED" "$RX_BYTES" "$TX_BYTES" "$RX_PACKETS" "$TX_PACKETS" "$RX_ERRORS" "$TX_ERRORS"
    FIRST_IFACE=","
done
echo "],"

# === ROUTING TABLE ===
echo "\"routes\": ["
FIRST=1
ip route 2>/dev/null | while IFS= read -r line; do
    DST=$(echo "$line" | awk '{print $1}')
    VIA=$(echo "$line" | grep -oP 'via \K[0-9.]+' || echo "")
    DEV=$(echo "$line" | grep -oP 'dev \K\w+' || echo "")
    METRIC=$(echo "$line" | grep -oP 'metric \K\d+' || echo "0")
    PROTO=$(echo "$line" | grep -oP 'proto \K\w+' || echo "")

    [ $FIRST -eq 0 ] && printf ","
    printf '{"destination": "%s", "gateway": "%s", "device": "%s", "metric": %s, "protocol": "%s"}' \
        "$(json_escape "$DST")" "$VIA" "$DEV" "$METRIC" "$PROTO"
    FIRST=0
done
echo "],"

# === DNS CONFIGURATION ===
echo "\"dns\": {"

# Nameservers
echo "  \"nameservers\": ["
grep "^nameserver" /etc/resolv.conf 2>/dev/null | awk '{printf "%s\"%s\"", (NR>1?",":""), $2}' || echo ""
echo "  ],"

# Search domains
echo "  \"search_domains\": ["
grep "^search" /etc/resolv.conf 2>/dev/null | cut -d' ' -f2- | tr ' ' '\n' | awk '{printf "%s\"%s\"", (NR>1?",":""), $1}' || echo ""
echo "  ],"

# DNS options
DNS_OPTIONS=$(grep "^options" /etc/resolv.conf 2>/dev/null | cut -d' ' -f2- || echo "")
echo "  \"options\": \"$(json_escape "$DNS_OPTIONS")\""
echo "},"

# === ARP TABLE ===
echo "\"arp\": ["
ip neigh 2>/dev/null | grep -v "FAILED" | head -50 | awk '{
    ip=$1
    dev=$3
    mac=$5
    state=$NF
    printf "%s{\"ip\": \"%s\", \"device\": \"%s\", \"mac\": \"%s\", \"state\": \"%s\"}", (NR>1?",":""), ip, dev, mac, state
}' 2>/dev/null || echo ""
echo "],"

# === LISTENING PORTS ===
echo "\"listening_ports\": ["
ss -tulpn 2>/dev/null | tail -n +2 | awk '{
    proto = $1
    state = $2
    local = $5
    split(local, a, ":")
    port = a[length(a)]
    addr = substr(local, 1, length(local)-length(port)-1)
    if (addr == "") addr = "*"
    process = $7
    gsub(/.*"/, "", process)
    gsub(/".*/, "", process)
    gsub(/users:\(\(/, "", process)
    gsub(/,.*/, "", process)
    printf "%s{\"proto\": \"%s\", \"address\": \"%s\", \"port\": \"%s\", \"process\": \"%s\"}", (NR>1?",":""), proto, addr, port, process
}' 2>/dev/null || echo ""
echo "],"

# === ACTIVE CONNECTIONS ===
echo "\"connections\": {"
echo "  \"established\": $(ss -t state established 2>/dev/null | tail -n +2 | wc -l),"
echo "  \"time_wait\": $(ss -t state time-wait 2>/dev/null | tail -n +2 | wc -l),"
echo "  \"close_wait\": $(ss -t state close-wait 2>/dev/null | tail -n +2 | wc -l),"
echo "  \"syn_sent\": $(ss -t state syn-sent 2>/dev/null | tail -n +2 | wc -l),"
echo "  \"syn_recv\": $(ss -t state syn-recv 2>/dev/null | tail -n +2 | wc -l),"
echo "  \"fin_wait1\": $(ss -t state fin-wait-1 2>/dev/null | tail -n +2 | wc -l),"
echo "  \"fin_wait2\": $(ss -t state fin-wait-2 2>/dev/null | tail -n +2 | wc -l),"
echo "  \"last_ack\": $(ss -t state last-ack 2>/dev/null | tail -n +2 | wc -l),"
echo "  \"closing\": $(ss -t state closing 2>/dev/null | tail -n +2 | wc -l)"
echo "},"

# === TOP CONNECTIONS BY REMOTE ===
echo "\"top_connections\": ["
ss -tn state established 2>/dev/null | tail -n +2 | awk '{print $4}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10 | awk '{
    printf "%s{\"remote_ip\": \"%s\", \"count\": %d}", (NR>1?",":""), $2, $1
}' 2>/dev/null || echo ""
echo "],"

# === GATEWAY INFO ===
echo "\"gateway\": {"
DEFAULT_GW=$(ip route 2>/dev/null | grep "^default" | head -1)
GW_IP=$(echo "$DEFAULT_GW" | grep -oP 'via \K[0-9.]+')
GW_DEV=$(echo "$DEFAULT_GW" | grep -oP 'dev \K\w+')
echo "  \"ip\": \"$GW_IP\","
echo "  \"device\": \"$GW_DEV\","

# Test gateway reachability
if [ -n "$GW_IP" ]; then
    GW_PING=$(ping -c 1 -W 2 "$GW_IP" 2>/dev/null)
    if [ $? -eq 0 ]; then
        GW_LATENCY=$(echo "$GW_PING" | grep -oP 'time=\K[0-9.]+')
        echo "  \"reachable\": true,"
        echo "  \"latency_ms\": $GW_LATENCY"
    else
        echo "  \"reachable\": false,"
        echo "  \"latency_ms\": null"
    fi
else
    echo "  \"reachable\": null,"
    echo "  \"latency_ms\": null"
fi
echo "},"

# === INTERNET CONNECTIVITY ===
echo "\"internet\": {"

# Test DNS resolution
DNS_TEST=$(host -W 2 google.com 2>/dev/null)
if [ $? -eq 0 ]; then
    DNS_OK="true"
else
    DNS_OK="false"
fi
echo "  \"dns_working\": $DNS_OK,"

# Test HTTP connectivity (try multiple targets)
HTTP_OK="false"
HTTP_TARGET=""
for target in "1.1.1.1" "8.8.8.8" "google.com"; do
    if ping -c 1 -W 2 "$target" >/dev/null 2>&1; then
        HTTP_OK="true"
        HTTP_TARGET="$target"
        break
    fi
done
echo "  \"connectivity\": $HTTP_OK,"
echo "  \"tested_target\": \"$HTTP_TARGET\""
echo "},"

# === FIREWALL STATUS ===
echo "\"firewall\": {"

FW_TYPE="none"
FW_STATUS="inactive"
FW_RULES_COUNT=0

if command -v ufw &>/dev/null; then
    FW_TYPE="ufw"
    UFW_STATUS=$(ufw status 2>/dev/null | head -1)
    if echo "$UFW_STATUS" | grep -q "active"; then
        FW_STATUS="active"
        FW_RULES_COUNT=$(ufw status numbered 2>/dev/null | grep -c "^\[")
    else
        FW_STATUS="inactive"
    fi
elif command -v firewall-cmd &>/dev/null; then
    FW_TYPE="firewalld"
    if firewall-cmd --state 2>/dev/null | grep -q "running"; then
        FW_STATUS="active"
        FW_RULES_COUNT=$(firewall-cmd --list-all 2>/dev/null | grep -c "")
    fi
elif command -v iptables &>/dev/null; then
    FW_TYPE="iptables"
    FW_RULES_COUNT=$(iptables -L -n 2>/dev/null | grep -c "^[A-Z]")
    if [ "$FW_RULES_COUNT" -gt 3 ]; then
        FW_STATUS="active"
    fi
elif command -v nft &>/dev/null; then
    FW_TYPE="nftables"
    NFT_RULES=$(nft list ruleset 2>/dev/null | wc -l)
    if [ "$NFT_RULES" -gt 0 ]; then
        FW_STATUS="active"
        FW_RULES_COUNT=$NFT_RULES
    fi
fi

echo "  \"type\": \"$FW_TYPE\","
echo "  \"status\": \"$FW_STATUS\","
echo "  \"rules_count\": $FW_RULES_COUNT"
echo "},"

# === NETWORK STATISTICS ===
echo "\"statistics\": {"

# TCP stats
TCP_ACTIVE=$(cat /proc/net/snmp 2>/dev/null | grep "^Tcp:" | tail -1 | awk '{print $6}')
TCP_PASSIVE=$(cat /proc/net/snmp 2>/dev/null | grep "^Tcp:" | tail -1 | awk '{print $7}')
TCP_FAILED=$(cat /proc/net/snmp 2>/dev/null | grep "^Tcp:" | tail -1 | awk '{print $8}')
TCP_RESETS=$(cat /proc/net/snmp 2>/dev/null | grep "^Tcp:" | tail -1 | awk '{print $9}')

echo "  \"tcp_active_opens\": ${TCP_ACTIVE:-0},"
echo "  \"tcp_passive_opens\": ${TCP_PASSIVE:-0},"
echo "  \"tcp_failed_attempts\": ${TCP_FAILED:-0},"
echo "  \"tcp_resets\": ${TCP_RESETS:-0},"

# UDP stats
UDP_IN=$(cat /proc/net/snmp 2>/dev/null | grep "^Udp:" | tail -1 | awk '{print $2}')
UDP_OUT=$(cat /proc/net/snmp 2>/dev/null | grep "^Udp:" | tail -1 | awk '{print $5}')
UDP_ERRORS=$(cat /proc/net/snmp 2>/dev/null | grep "^Udp:" | tail -1 | awk '{print $4}')

echo "  \"udp_in_datagrams\": ${UDP_IN:-0},"
echo "  \"udp_out_datagrams\": ${UDP_OUT:-0},"
echo "  \"udp_errors\": ${UDP_ERRORS:-0}"
echo "}"

echo "}"

#!/bin/bash
# nodepulse Network Diagnostics Script
# Sammelt Netzwerk-Informationen und fuehrt Diagnose-Tests durch
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
    if [ -z "$val" ] || ! [[ "$val" =~ ^[0-9.]+$ ]]; then
        echo "0"
    else
        echo "$val"
    fi
}

echo "{"

# === INTERFACES ===
echo "\"interfaces\": ["
IFACE_LIST=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    IFACE=$(echo "$line" | awk '{print $2}' | tr -d ':')
    [ -z "$IFACE" ] && continue

    STATE=$(echo "$line" | grep -oP 'state \K\w+' || echo "unknown")
    MAC=$(echo "$line" | grep -oP 'link/ether \K[0-9a-f:]+' || echo "")
    MTU=$(echo "$line" | grep -oP 'mtu \K\d+' || echo "")

    IPV4=$(ip -4 addr show "$IFACE" 2>/dev/null | grep -oP 'inet \K[0-9./]+' | head -1)
    IPV6=$(ip -6 addr show "$IFACE" 2>/dev/null | grep -oP 'inet6 \K[0-9a-f:/]+' | grep -v "^fe80" | head -1)

    RX_BYTES=$(cat /sys/class/net/"$IFACE"/statistics/rx_bytes 2>/dev/null || echo "0")
    TX_BYTES=$(cat /sys/class/net/"$IFACE"/statistics/tx_bytes 2>/dev/null || echo "0")
    RX_PACKETS=$(cat /sys/class/net/"$IFACE"/statistics/rx_packets 2>/dev/null || echo "0")
    TX_PACKETS=$(cat /sys/class/net/"$IFACE"/statistics/tx_packets 2>/dev/null || echo "0")
    RX_ERRORS=$(cat /sys/class/net/"$IFACE"/statistics/rx_errors 2>/dev/null || echo "0")
    TX_ERRORS=$(cat /sys/class/net/"$IFACE"/statistics/tx_errors 2>/dev/null || echo "0")

    SPEED=$(cat /sys/class/net/"$IFACE"/speed 2>/dev/null || echo "-1")
    [ "$SPEED" = "-1" ] && SPEED="null"

    [ -n "$IFACE_LIST" ] && IFACE_LIST="$IFACE_LIST,"
    IFACE_LIST="$IFACE_LIST{\"name\": \"$(json_escape "$IFACE")\", \"state\": \"$(json_escape "$STATE")\", \"mac\": \"$(json_escape "$MAC")\", \"mtu\": \"$(json_escape "$MTU")\", \"ipv4\": \"$(json_escape "$IPV4")\", \"ipv6\": \"$(json_escape "$IPV6")\", \"speed\": $SPEED, \"rx_bytes\": $(safe_num "$RX_BYTES"), \"tx_bytes\": $(safe_num "$TX_BYTES"), \"rx_packets\": $(safe_num "$RX_PACKETS"), \"tx_packets\": $(safe_num "$TX_PACKETS"), \"rx_errors\": $(safe_num "$RX_ERRORS"), \"tx_errors\": $(safe_num "$TX_ERRORS")}"
done < <(ip -o link show 2>/dev/null)
echo "$IFACE_LIST"
echo "],"

# === ROUTING TABLE ===
echo "\"routes\": ["
ROUTE_LIST=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    DST=$(echo "$line" | awk '{print $1}')
    VIA=$(echo "$line" | grep -oP 'via \K[0-9.]+' || echo "")
    DEV=$(echo "$line" | grep -oP 'dev \K\w+' || echo "")
    METRIC=$(echo "$line" | grep -oP 'metric \K\d+' || echo "0")
    PROTO=$(echo "$line" | grep -oP 'proto \K\w+' || echo "")

    [ -n "$ROUTE_LIST" ] && ROUTE_LIST="$ROUTE_LIST,"
    ROUTE_LIST="$ROUTE_LIST{\"destination\": \"$(json_escape "$DST")\", \"gateway\": \"$(json_escape "$VIA")\", \"device\": \"$(json_escape "$DEV")\", \"metric\": $(safe_num "$METRIC"), \"protocol\": \"$(json_escape "$PROTO")\"}"
done < <(ip route 2>/dev/null | head -20)
echo "$ROUTE_LIST"
echo "],"

# === DNS CONFIGURATION ===
echo "\"dns\": {"

# Nameservers
echo "  \"nameservers\": ["
NS_LIST=""
while IFS= read -r line; do
    NS=$(echo "$line" | awk '{print $2}')
    [ -z "$NS" ] && continue
    [ -n "$NS_LIST" ] && NS_LIST="$NS_LIST,"
    NS_LIST="$NS_LIST\"$(json_escape "$NS")\""
done < <(grep "^nameserver" /etc/resolv.conf 2>/dev/null)
echo "$NS_LIST"
echo "  ],"

# Search domains
echo "  \"search_domains\": ["
SEARCH_LIST=""
SEARCH_LINE=$(grep "^search" /etc/resolv.conf 2>/dev/null | cut -d' ' -f2-)
for domain in $SEARCH_LINE; do
    [ -z "$domain" ] && continue
    [ -n "$SEARCH_LIST" ] && SEARCH_LIST="$SEARCH_LIST,"
    SEARCH_LIST="$SEARCH_LIST\"$(json_escape "$domain")\""
done
echo "$SEARCH_LIST"
echo "  ],"

# DNS options
DNS_OPTIONS=$(grep "^options" /etc/resolv.conf 2>/dev/null | cut -d' ' -f2-)
echo "  \"options\": \"$(json_escape "$DNS_OPTIONS")\""
echo "},"

# === ARP TABLE ===
echo "\"arp\": ["
ARP_LIST=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    echo "$line" | grep -q "FAILED" && continue
    ARP_IP=$(echo "$line" | awk '{print $1}')
    ARP_DEV=$(echo "$line" | awk '{print $3}')
    ARP_MAC=$(echo "$line" | awk '{print $5}')
    ARP_STATE=$(echo "$line" | awk '{print $NF}')
    [ -z "$ARP_IP" ] && continue

    [ -n "$ARP_LIST" ] && ARP_LIST="$ARP_LIST,"
    ARP_LIST="$ARP_LIST{\"ip\": \"$(json_escape "$ARP_IP")\", \"device\": \"$(json_escape "$ARP_DEV")\", \"mac\": \"$(json_escape "$ARP_MAC")\", \"state\": \"$(json_escape "$ARP_STATE")\"}"
done < <(ip neigh 2>/dev/null | head -50)
echo "$ARP_LIST"
echo "],"

# === LISTENING PORTS ===
echo "\"listening_ports\": ["
PORT_LIST=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    PROTO=$(echo "$line" | awk '{print $1}')
    LOCAL=$(echo "$line" | awk '{print $5}')
    PORT=$(echo "$LOCAL" | rev | cut -d: -f1 | rev)
    ADDR=$(echo "$LOCAL" | rev | cut -d: -f2- | rev)
    [ "$ADDR" = "" ] && ADDR="*"
    PROC=$(echo "$line" | awk '{print $7}' | sed 's/.*"\([^"]*\)".*/\1/' | cut -d, -f1)

    [ -n "$PORT_LIST" ] && PORT_LIST="$PORT_LIST,"
    PORT_LIST="$PORT_LIST{\"proto\": \"$(json_escape "$PROTO")\", \"address\": \"$(json_escape "$ADDR")\", \"port\": \"$(json_escape "$PORT")\", \"process\": \"$(json_escape "$PROC")\"}"
done < <(ss -tulpn 2>/dev/null | tail -n +2 | head -50)
echo "$PORT_LIST"
echo "],"

# === ACTIVE CONNECTIONS ===
CONN_EST=$(ss -t state established 2>/dev/null | tail -n +2 | wc -l)
CONN_TW=$(ss -t state time-wait 2>/dev/null | tail -n +2 | wc -l)
CONN_CW=$(ss -t state close-wait 2>/dev/null | tail -n +2 | wc -l)
CONN_SS=$(ss -t state syn-sent 2>/dev/null | tail -n +2 | wc -l)
CONN_SR=$(ss -t state syn-recv 2>/dev/null | tail -n +2 | wc -l)
CONN_FW1=$(ss -t state fin-wait-1 2>/dev/null | tail -n +2 | wc -l)
CONN_FW2=$(ss -t state fin-wait-2 2>/dev/null | tail -n +2 | wc -l)
CONN_LA=$(ss -t state last-ack 2>/dev/null | tail -n +2 | wc -l)
CONN_CL=$(ss -t state closing 2>/dev/null | tail -n +2 | wc -l)

echo "\"connections\": {"
echo "  \"established\": $(safe_num "$CONN_EST"),"
echo "  \"time_wait\": $(safe_num "$CONN_TW"),"
echo "  \"close_wait\": $(safe_num "$CONN_CW"),"
echo "  \"syn_sent\": $(safe_num "$CONN_SS"),"
echo "  \"syn_recv\": $(safe_num "$CONN_SR"),"
echo "  \"fin_wait1\": $(safe_num "$CONN_FW1"),"
echo "  \"fin_wait2\": $(safe_num "$CONN_FW2"),"
echo "  \"last_ack\": $(safe_num "$CONN_LA"),"
echo "  \"closing\": $(safe_num "$CONN_CL")"
echo "},"

# === TOP CONNECTIONS BY REMOTE ===
echo "\"top_connections\": ["
TOP_CONN=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    COUNT=$(echo "$line" | awk '{print $1}')
    REMOTE=$(echo "$line" | awk '{print $2}')
    [ -z "$REMOTE" ] && continue

    [ -n "$TOP_CONN" ] && TOP_CONN="$TOP_CONN,"
    TOP_CONN="$TOP_CONN{\"remote_ip\": \"$(json_escape "$REMOTE")\", \"count\": $(safe_num "$COUNT")}"
done < <(ss -tn state established 2>/dev/null | tail -n +2 | awk '{print $4}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10)
echo "$TOP_CONN"
echo "],"

# === GATEWAY INFO ===
echo "\"gateway\": {"
DEFAULT_GW=$(ip route 2>/dev/null | grep "^default" | head -1)
GW_IP=$(echo "$DEFAULT_GW" | grep -oP 'via \K[0-9.]+')
GW_DEV=$(echo "$DEFAULT_GW" | grep -oP 'dev \K\w+')
echo "  \"ip\": \"$(json_escape "$GW_IP")\","
echo "  \"device\": \"$(json_escape "$GW_DEV")\","

# Test gateway reachability
if [ -n "$GW_IP" ]; then
    GW_PING=$(ping -c 1 -W 2 "$GW_IP" 2>/dev/null)
    if [ $? -eq 0 ]; then
        GW_LATENCY=$(echo "$GW_PING" | grep -oP 'time=\K[0-9.]+')
        echo "  \"reachable\": true,"
        echo "  \"latency_ms\": $(safe_num "$GW_LATENCY")"
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
host -W 2 google.com >/dev/null 2>&1
if [ $? -eq 0 ]; then
    DNS_OK="true"
else
    DNS_OK="false"
fi
echo "  \"dns_working\": $DNS_OK,"

# Test HTTP connectivity
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
echo "  \"tested_target\": \"$(json_escape "$HTTP_TARGET")\""
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
        FW_RULES_COUNT=$(ufw status numbered 2>/dev/null | grep -c "^\[" || echo "0")
    else
        FW_STATUS="inactive"
    fi
elif command -v firewall-cmd &>/dev/null; then
    FW_TYPE="firewalld"
    if firewall-cmd --state 2>/dev/null | grep -q "running"; then
        FW_STATUS="active"
        FW_RULES_COUNT=$(firewall-cmd --list-all 2>/dev/null | wc -l || echo "0")
    fi
elif command -v iptables &>/dev/null; then
    FW_TYPE="iptables"
    FW_RULES_COUNT=$(iptables -L -n 2>/dev/null | grep -c "^[A-Z]" || echo "0")
    if [ "$FW_RULES_COUNT" -gt 3 ] 2>/dev/null; then
        FW_STATUS="active"
    fi
elif command -v nft &>/dev/null; then
    FW_TYPE="nftables"
    NFT_RULES=$(nft list ruleset 2>/dev/null | wc -l || echo "0")
    if [ "$NFT_RULES" -gt 0 ] 2>/dev/null; then
        FW_STATUS="active"
        FW_RULES_COUNT=$NFT_RULES
    fi
fi

echo "  \"type\": \"$FW_TYPE\","
echo "  \"status\": \"$FW_STATUS\","
echo "  \"rules_count\": $(safe_num "$FW_RULES_COUNT")"
echo "},"

# === NETWORK STATISTICS ===
echo "\"statistics\": {"

# TCP stats from /proc/net/snmp
TCP_LINE=$(cat /proc/net/snmp 2>/dev/null | grep "^Tcp:" | tail -1)
TCP_ACTIVE=$(echo "$TCP_LINE" | awk '{print $6}')
TCP_PASSIVE=$(echo "$TCP_LINE" | awk '{print $7}')
TCP_FAILED=$(echo "$TCP_LINE" | awk '{print $8}')
TCP_RESETS=$(echo "$TCP_LINE" | awk '{print $9}')

echo "  \"tcp_active_opens\": $(safe_num "$TCP_ACTIVE"),"
echo "  \"tcp_passive_opens\": $(safe_num "$TCP_PASSIVE"),"
echo "  \"tcp_failed_attempts\": $(safe_num "$TCP_FAILED"),"
echo "  \"tcp_resets\": $(safe_num "$TCP_RESETS"),"

# UDP stats
UDP_LINE=$(cat /proc/net/snmp 2>/dev/null | grep "^Udp:" | tail -1)
UDP_IN=$(echo "$UDP_LINE" | awk '{print $2}')
UDP_OUT=$(echo "$UDP_LINE" | awk '{print $5}')
UDP_ERRORS=$(echo "$UDP_LINE" | awk '{print $4}')

echo "  \"udp_in_datagrams\": $(safe_num "$UDP_IN"),"
echo "  \"udp_out_datagrams\": $(safe_num "$UDP_OUT"),"
echo "  \"udp_errors\": $(safe_num "$UDP_ERRORS")"
echo "}"

echo "}"

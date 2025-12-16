#!/bin/bash
# nodepulse Proxmox Resources Script
# Sammelt ISOs, Templates, Storage und Bridges fuer VM/CT Erstellung
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
    if [ -z "$val" ] || ! [[ "$val" =~ ^[0-9]+$ ]]; then
        echo "0"
    else
        echo "$val"
    fi
}

echo "{"

# === ISOs ===
echo "\"isos\": ["
ISO_LIST=""

# Get all storages
STORAGE_LIST=$(pvesm status 2>/dev/null | tail -n +2 | awk '{print $1}')
for storage in $STORAGE_LIST; do
    # Check if storage supports iso content
    CONTENT=$(pvesm config "$storage" 2>/dev/null | grep "^content" | cut -d' ' -f2)
    if echo "$CONTENT" | grep -q "iso"; then
        # List ISOs from this storage
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            VOLID=$(echo "$line" | awk '{print $1}')
            SIZE=$(echo "$line" | awk '{print $2}')
            [ -z "$VOLID" ] && continue

            FILENAME=$(basename "$VOLID")

            [ -n "$ISO_LIST" ] && ISO_LIST="$ISO_LIST,"
            ISO_LIST="$ISO_LIST{\"storage\": \"$(json_escape "$storage")\", \"volid\": \"$(json_escape "$VOLID")\", \"filename\": \"$(json_escape "$FILENAME")\", \"size_bytes\": $(safe_num "$SIZE")}"
        done < <(pvesm list "$storage" --content iso 2>/dev/null | tail -n +2)
    fi
done
echo "$ISO_LIST"
echo "],"

# === CT Templates ===
echo "\"templates\": ["
TPL_LIST=""

for storage in $STORAGE_LIST; do
    CONTENT=$(pvesm config "$storage" 2>/dev/null | grep "^content" | cut -d' ' -f2)
    if echo "$CONTENT" | grep -q "vztmpl"; then
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            VOLID=$(echo "$line" | awk '{print $1}')
            SIZE=$(echo "$line" | awk '{print $2}')
            [ -z "$VOLID" ] && continue

            FILENAME=$(basename "$VOLID")

            [ -n "$TPL_LIST" ] && TPL_LIST="$TPL_LIST,"
            TPL_LIST="$TPL_LIST{\"storage\": \"$(json_escape "$storage")\", \"volid\": \"$(json_escape "$VOLID")\", \"filename\": \"$(json_escape "$FILENAME")\", \"size_bytes\": $(safe_num "$SIZE")}"
        done < <(pveam list "$storage" 2>/dev/null | tail -n +2)
    fi
done
echo "$TPL_LIST"
echo "],"

# === Storage with content types ===
echo "\"storage\": ["
STOR_LIST=""

while IFS= read -r line; do
    [ -z "$line" ] && continue
    NAME=$(echo "$line" | awk '{print $1}')
    TYPE=$(echo "$line" | awk '{print $2}')
    STATUS=$(echo "$line" | awk '{print $3}')
    TOTAL=$(echo "$line" | awk '{print $4}')
    USED=$(echo "$line" | awk '{print $5}')
    AVAIL=$(echo "$line" | awk '{print $6}')
    [ -z "$NAME" ] && continue

    # Get content types
    CONTENT=$(pvesm config "$NAME" 2>/dev/null | grep "^content" | cut -d' ' -f2)

    # Build content array
    CONTENT_JSON="["
    FIRST_CONTENT=1
    IFS=',' read -ra CONTENT_ARR <<< "$CONTENT"
    for c in "${CONTENT_ARR[@]}"; do
        c=$(echo "$c" | tr -d ' ')
        [ -z "$c" ] && continue
        [ $FIRST_CONTENT -eq 0 ] && CONTENT_JSON="${CONTENT_JSON},"
        CONTENT_JSON="${CONTENT_JSON}\"$(json_escape "$c")\""
        FIRST_CONTENT=0
    done
    CONTENT_JSON="${CONTENT_JSON}]"

    [ -n "$STOR_LIST" ] && STOR_LIST="$STOR_LIST,"
    STOR_LIST="$STOR_LIST{\"name\": \"$(json_escape "$NAME")\", \"type\": \"$(json_escape "$TYPE")\", \"status\": \"$(json_escape "$STATUS")\", \"content\": $CONTENT_JSON, \"total_bytes\": $(safe_num "$TOTAL"), \"used_bytes\": $(safe_num "$USED"), \"available_bytes\": $(safe_num "$AVAIL")}"
done < <(pvesm status 2>/dev/null | tail -n +2)
echo "$STOR_LIST"
echo "],"

# === Network Bridges ===
echo "\"bridges\": ["
BR_LIST=""

# Method 1: Try pvesh (most reliable on Proxmox)
if command -v pvesh &>/dev/null; then
    HOSTNAME=$(hostname 2>/dev/null || echo "localhost")
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        echo "$line" | grep -q "bridge" || continue

        IFACE=$(echo "$line" | grep -oP '"iface"\s*:\s*"\K[^"]+' 2>/dev/null)
        [ -z "$IFACE" ] && continue

        CIDR=$(echo "$line" | grep -oP '"cidr"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")
        COMMENT=$(echo "$line" | grep -oP '"comments"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")

        [ -n "$BR_LIST" ] && BR_LIST="$BR_LIST,"
        BR_LIST="$BR_LIST{\"name\": \"$(json_escape "$IFACE")\", \"cidr\": \"$(json_escape "$CIDR")\", \"comment\": \"$(json_escape "$COMMENT")\"}"
    done < <(pvesh get /nodes/"$HOSTNAME"/network --type bridge --output-format json 2>/dev/null | tr '}' '\n' | tr '{' '\n')
fi

# Method 2: Fallback - parse /etc/network/interfaces
if [ -z "$BR_LIST" ] && [ -f /etc/network/interfaces ]; then
    while IFS= read -r br; do
        [ -z "$br" ] && continue
        [ -n "$BR_LIST" ] && BR_LIST="$BR_LIST,"
        BR_LIST="$BR_LIST{\"name\": \"$(json_escape "$br")\", \"cidr\": \"\", \"comment\": \"\"}"
    done < <(grep -E '^\s*iface\s+vmbr[0-9]+' /etc/network/interfaces 2>/dev/null | awk '{print $2}')
fi

# Method 3: Fallback - ip link
if [ -z "$BR_LIST" ]; then
    while IFS= read -r br; do
        [ -z "$br" ] && continue
        [ -n "$BR_LIST" ] && BR_LIST="$BR_LIST,"
        BR_LIST="$BR_LIST{\"name\": \"$(json_escape "$br")\", \"cidr\": \"\", \"comment\": \"\"}"
    done < <(ip link show type bridge 2>/dev/null | grep -oP '^\d+:\s+\K[^:@]+')
fi

echo "$BR_LIST"
echo "],"

# === Next available VMID ===
NEXTID=$(pvesh get /cluster/nextid 2>/dev/null)
if [ -z "$NEXTID" ] || ! [[ "$NEXTID" =~ ^[0-9]+$ ]]; then
    NEXTID="100"
fi
echo "\"nextid\": $NEXTID"

echo "}"

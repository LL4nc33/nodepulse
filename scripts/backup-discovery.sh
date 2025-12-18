#!/bin/bash
# Backup Discovery Script fuer NodePulse
# Sammelt: Backup Storages, Backups (vzdump), Backup Jobs
# Output: JSON

set -e

echo "{"

# =====================================================
# Backup-faehige Storages
# =====================================================
echo '"storages": ['
first=true
if command -v pvesm &> /dev/null; then
  # pvesm status gibt alle Storages mit ihren Eigenschaften
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    storage=$(echo "$line" | awk '{print $1}')
    type=$(echo "$line" | awk '{print $2}')
    status=$(echo "$line" | awk '{print $3}')
    total=$(echo "$line" | awk '{print $4}')
    used=$(echo "$line" | awk '{print $5}')
    avail=$(echo "$line" | awk '{print $6}')

    # Nur Storages mit backup content
    content=$(pvesm status --storage "$storage" 2>/dev/null | grep -oP 'content=\K[^ ]+' || echo "")
    if [ -z "$content" ]; then
      content=$(grep -A5 "^${type}: ${storage}$" /etc/pve/storage.cfg 2>/dev/null | grep "content" | awk '{print $2}' || echo "")
    fi

    # Pruefen ob backup in content enthalten ist
    if echo "$content" | grep -q "backup"; then
      [ "$first" = true ] && first=false || echo ","
      # Konvertiere KB zu Bytes
      total_bytes=$((total * 1024))
      used_bytes=$((used * 1024))
      avail_bytes=$((avail * 1024))

      # Path ermitteln
      path=$(grep -A10 "^${type}: ${storage}$" /etc/pve/storage.cfg 2>/dev/null | grep -E "^\s+path" | awk '{print $2}' || echo "")
      shared=$(grep -A10 "^${type}: ${storage}$" /etc/pve/storage.cfg 2>/dev/null | grep -E "^\s+shared" | awk '{print $2}' || echo "0")

      printf '{"storage":"%s","type":"%s","status":"%s","total":%s,"used":%s,"avail":%s,"content":"%s","path":"%s","shared":%s,"enabled":%s}' \
        "$storage" "$type" "$status" "$total_bytes" "$used_bytes" "$avail_bytes" "$content" "$path" "${shared:-0}" "$([ "$status" = "active" ] && echo 1 || echo 0)"
    fi
  done < <(pvesm status 2>/dev/null | tail -n +2)
fi
echo '],'

# =====================================================
# Backups (vzdump Dateien)
# =====================================================
echo '"backups": ['
first=true
if command -v pvesh &> /dev/null; then
  hostname=$(hostname)
  # Fuer jeden Backup-Storage die Backups auflisten
  while IFS= read -r storage; do
    [ -z "$storage" ] && continue

    # pvesh get /nodes/{node}/storage/{storage}/content --content backup
    backups_json=$(pvesh get "/nodes/$hostname/storage/$storage/content" --content backup --output-format json 2>/dev/null || echo "[]")

    # Parse JSON mit awk (ES5-kompatibel)
    echo "$backups_json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for b in data:
        vmid = b.get('vmid', 0)
        vmtype = b.get('vmtype', 'qemu')
        volid = b.get('volid', '')
        size = b.get('size', 0)
        ctime = b.get('ctime', 0)
        notes = b.get('notes', '').replace('\"', '\\\\\"').replace('\n', ' ')
        fmt = b.get('format', '')
        protected = 1 if b.get('protected') else 0

        print('{\"storage\":\"%s\",\"vmid\":%s,\"vmtype\":\"%s\",\"volid\":\"%s\",\"size\":%s,\"ctime\":%s,\"notes\":\"%s\",\"format\":\"%s\",\"protected\":%s}' %
              ('$storage', vmid, vmtype, volid, size, ctime, notes, fmt, protected))
except:
    pass
" 2>/dev/null | while IFS= read -r backup_line; do
      [ -z "$backup_line" ] && continue
      [ "$first" = true ] && first=false || echo ","
      echo "$backup_line"
    done
  done < <(pvesm status 2>/dev/null | tail -n +2 | while read -r line; do
    storage=$(echo "$line" | awk '{print $1}')
    content=$(grep -A10 "^[a-z]*: ${storage}$" /etc/pve/storage.cfg 2>/dev/null | grep "content" | awk '{print $2}' || echo "")
    if echo "$content" | grep -q "backup"; then
      echo "$storage"
    fi
  done)
fi
echo '],'

# =====================================================
# Backup Jobs
# =====================================================
echo '"jobs": ['
first=true
if command -v pvesh &> /dev/null; then
  jobs_json=$(pvesh get /cluster/backup --output-format json 2>/dev/null || echo "[]")

  echo "$jobs_json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    first = True
    for j in data:
        job_id = j.get('id', '')
        schedule = j.get('schedule', '')
        vmid = j.get('vmid', '')
        storage = j.get('storage', '')
        mode = j.get('mode', 'snapshot')
        compress = j.get('compress', 'zstd')
        enabled = 1 if j.get('enabled', True) else 0
        mailnotification = j.get('mailnotification', 'failure')
        all_vms = 1 if j.get('all', False) else 0

        if not first:
            print(',')
        first = False
        print('{\"id\":\"%s\",\"schedule\":\"%s\",\"vmid\":\"%s\",\"storage\":\"%s\",\"mode\":\"%s\",\"compress\":\"%s\",\"enabled\":%s,\"mailnotification\":\"%s\",\"all\":%s}' %
              (job_id, schedule, vmid, storage, mode, compress, enabled, mailnotification, all_vms))
except:
    pass
" 2>/dev/null
fi
echo ']'

echo "}"

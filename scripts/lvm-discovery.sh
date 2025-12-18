#!/bin/bash
# LVM Discovery Script fuer NodePulse
# Sammelt: PVs, VGs, LVs, Thin Pools, verfuegbare Disks, Proxmox Storages
# Output: JSON

set -e

echo "{"

# =====================================================
# Physical Volumes
# =====================================================
echo '"pvs": '
if command -v pvs &> /dev/null; then
  pvs --reportformat json --units b -o pv_name,vg_name,pv_size,pv_free,pv_uuid 2>/dev/null || echo '{"report":[]}'
else
  echo '{"report":[]}'
fi
echo ","

# =====================================================
# Volume Groups
# =====================================================
echo '"vgs": '
if command -v vgs &> /dev/null; then
  vgs --reportformat json --units b -o vg_name,vg_size,vg_free,pv_count,lv_count,vg_uuid 2>/dev/null || echo '{"report":[]}'
else
  echo '{"report":[]}'
fi
echo ","

# =====================================================
# Logical Volumes (inkl. Thin Pools)
# =====================================================
echo '"lvs": '
if command -v lvs &> /dev/null; then
  lvs --reportformat json --units b -o lv_name,vg_name,lv_size,lv_path,lv_attr,pool_lv,data_percent 2>/dev/null || echo '{"report":[]}'
else
  echo '{"report":[]}'
fi
echo ","

# =====================================================
# Proxmox Registered Storages (wenn Proxmox vorhanden)
# =====================================================
echo '"proxmox_storages": '
if command -v pvesm &> /dev/null; then
  # pvesm status gibt: Name Type Status Total Used Available %
  # Wir brauchen nur LVM/LVM-Thin Storages
  result=$(pvesm status 2>/dev/null | awk 'NR>1 && ($2=="lvm" || $2=="lvmthin") {
    printf "{\"storage\":\"%s\",\"type\":\"%s\",\"status\":\"%s\",\"total\":%s,\"used\":%s,\"available\":%s},",
           $1, $2, $3, $4*1024, $5*1024, $6*1024
  }' | sed 's/,$//')
  if [ -n "$result" ]; then
    echo "[$result]"
  else
    echo '[]'
  fi
else
  echo '[]'
fi
echo ","

# =====================================================
# Proxmox Storage Config (fuer VG/Pool Namen)
# =====================================================
echo '"proxmox_storage_config": '
if [ -f /etc/pve/storage.cfg ]; then
  # Parse storage.cfg fuer lvm/lvmthin Eintraege
  result=$(awk '
    /^lvm:/ { name=$2; type="lvm"; vgname=""; thinpool="" }
    /^lvmthin:/ { name=$2; type="lvmthin"; vgname=""; thinpool="" }
    /vgname/ && name { vgname=$2 }
    /thinpool/ && name { thinpool=$2 }
    /^$/ || /^[a-z]+:/ {
      if (name != "" && type != "") {
        printf "{\"storage\":\"%s\",\"type\":\"%s\",\"vgname\":\"%s\",\"thinpool\":\"%s\"},", name, type, vgname, thinpool
        name=""
      }
    }
    END {
      if (name != "" && type != "") {
        printf "{\"storage\":\"%s\",\"type\":\"%s\",\"vgname\":\"%s\",\"thinpool\":\"%s\"}", name, type, vgname, thinpool
      }
    }
  ' /etc/pve/storage.cfg 2>/dev/null | sed 's/,$//')
  if [ -n "$result" ]; then
    echo "[$result]"
  else
    echo '[]'
  fi
else
  echo '[]'
fi
echo ","

# =====================================================
# Available Disks (nicht in Verwendung)
# =====================================================
echo '"available_disks": ['
first=true

# Alle Block-Devices durchgehen
for disk in /sys/block/sd* /sys/block/nvme* /sys/block/vd*; do
  [ -d "$disk" ] || continue
  devname=$(basename "$disk")
  devpath="/dev/$devname"

  # Skip partitions (nvme0n1p1, sda1, etc.)
  case "$devname" in
    *p[0-9]*|sd?[0-9]*|vd?[0-9]*) continue ;;
  esac

  # Groesse in Bytes
  size_sectors=$(cat "$disk/size" 2>/dev/null || echo 0)
  size_bytes=$((size_sectors * 512))

  # Zu klein ignorieren (< 1GB)
  [ "$size_bytes" -lt 1073741824 ] && continue

  # Rotational (1=HDD, 0=SSD)
  rotational=$(cat "$disk/queue/rotational" 2>/dev/null || echo 1)

  # Model (trimmed)
  model=$(cat "$disk/device/model" 2>/dev/null | tr -d '\n' | sed 's/[[:space:]]*$//' | sed 's/"/\\"/g' || echo "")

  # Serial
  serial=$(cat "$disk/device/serial" 2>/dev/null | tr -d '\n' | sed 's/"/\\"/g' || echo "")

  # Hat Partitionen?
  has_partitions=0
  for part in "$disk/${devname}"*[0-9] "$disk/${devname}p"*[0-9]; do
    if [ -d "$part" ]; then
      has_partitions=1
      break
    fi
  done

  # In Verwendung? (Teil einer VG oder gemountet)
  in_use=0
  if command -v pvs &> /dev/null && pvs --noheadings -o pv_name 2>/dev/null | grep -q "$devpath"; then
    in_use=1
  elif mount | grep -q "^$devpath"; then
    in_use=1
  elif [ -f /proc/mdstat ] && grep -q "$devname" /proc/mdstat 2>/dev/null; then
    in_use=1
  fi

  [ "$first" = true ] && first=false || echo ","
  printf '{"device_path":"%s","size_bytes":%s,"model":"%s","serial":"%s","rotational":%s,"has_partitions":%s,"in_use":%s}' \
    "$devpath" "$size_bytes" "$model" "$serial" "$rotational" "$has_partitions" "$in_use"
done
echo ']'

echo "}"

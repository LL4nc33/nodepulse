# NodePulse: Erweiterte Hardware-Discovery (ProxMenux-Style)

## Zusammenfassung

Basierend auf der ProxMenux WebUI Analyse soll die Hardware-Discovery in NodePulse erweitert werden, um detailliertere Informationen wie in ProxMenux anzuzeigen.

---

## Aktueller Stand vs. Ziel

### CPU

| Feature | Aktuell | Ziel (ProxMenux-Style) |
|---------|---------|------------------------|
| Model | ✅ `AMD Ryzen 7 3700X` | ✅ Gleich |
| Cores | ✅ `8` | `1 x 8 = 8 cores` (Sockets x Cores) |
| Threads | ✅ (in DB, nicht angezeigt) | ✅ `16` anzeigen |
| L3 Cache | ✅ `32M` | `32 MiB (2 instances)` |
| Virtualization | ✅ `svm` | `AMD-V` / `VT-x` (human-readable) |

**Neue Befehle:**
```bash
# Sockets
lscpu | grep "Socket(s):"

# Cache instances
lscpu | grep "L3 cache"  # Gibt "32 MiB" und ggf. instances
```

### Motherboard

| Feature | Aktuell | Ziel (ProxMenux-Style) |
|---------|---------|------------------------|
| Manufacturer | ✅ `Micro-Star International` | ✅ Gleich |
| Model | ✅ `B450-A PRO MAX` | ✅ Gleich |
| BIOS Version | ✅ `M.N2` | ✅ Gleich |
| BIOS Vendor | ❌ | `American Megatrends` |
| BIOS Date | ❌ | `09/02/2024` |

**Neue Befehle:**
```bash
dmidecode -s bios-vendor
dmidecode -s bios-release-date
```

### RAM (DIMM-Slots)

| Feature | Aktuell | Ziel (ProxMenux-Style) |
|---------|---------|------------------------|
| Total | ✅ `48 GB` | ✅ Gleich |
| Type | ✅ `DDR4` | ✅ Gleich |
| Speed | ✅ `3600 MHz` | `3600 MT/s` |
| Per DIMM | ❌ | ✅ Jeder Slot einzeln |
| Manufacturer | ❌ | ✅ Pro DIMM |

**Neue Befehle:**
```bash
# Alle DIMM-Slots einzeln
dmidecode -t memory | grep -A16 "Memory Device" | \
  grep -E "Size:|Type:|Speed:|Manufacturer:|Locator:"
```

**Neues JSON-Format:**
```json
{
  "dimms": [
    {"locator": "DIMM 0", "size_gb": 8, "type": "DDR4", "speed_mt": 3600, "manufacturer": "Unknown"},
    {"locator": "DIMM 1", "size_gb": 16, "type": "DDR4", "speed_mt": 3600, "manufacturer": "Unknown"}
  ]
}
```

### Thermal (Temperaturen)

| Feature | Aktuell | Ziel (ProxMenux-Style) |
|---------|---------|------------------------|
| CPU Temp | ✅ 1 Wert | ✅ Mehrere Sensoren (CPU Package, etc.) |
| NVMe Temp | ❌ | ✅ Pro NVMe-Disk |
| GPU Temp | ❌ | ✅ Falls nvidia-smi verfuegbar |
| Disk Temp | ❌ | ✅ Via smartctl |

**Neue Befehle:**
```bash
# Alle Sensoren
sensors -j 2>/dev/null  # JSON-Output

# NVMe Temperaturen
nvme smart-log /dev/nvme0n1 2>/dev/null | grep -i temperature

# SMART Disk-Temperaturen
smartctl -A /dev/sda 2>/dev/null | grep -i temperature

# GPU (NVIDIA)
nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>/dev/null
```

**Neues JSON-Format:**
```json
{
  "sensors": [
    {"name": "CPU Package", "type": "cpu", "temp_c": 41.8, "adapter": "PCI adapter"},
    {"name": "NVMe SSD", "type": "nvme", "temp_c": 34.9, "device": "/dev/nvme0n1"},
    {"name": "sda", "type": "disk", "temp_c": 44, "device": "/dev/sda"}
  ]
}
```

### Storage (Disks)

| Feature | Aktuell | Ziel (ProxMenux-Style) |
|---------|---------|------------------------|
| Name | ✅ `sda`, `nvme0n1` | ✅ Gleich |
| Size | ✅ `476.9G` | ✅ Gleich |
| Model | ✅ `Vi550 S3` | ✅ Gleich |
| Is SSD | ✅ Boolean | ✅ Type-Badge (SSD/NVMe/HDD) |
| Transport | ✅ `sata`, `nvme` | ✅ Gleich |
| SMART Status | ❌ | ✅ `passed` / `failed` |
| Power-On Time | ❌ | ✅ `209d`, `3y 32d` |
| Serial | ❌ | ✅ `4935243884613996` |
| SATA Version | ❌ | ✅ `SATA 3.2, 6.0 Gb/s` |
| PCIe Gen/Width | ❌ | ✅ `3.0 x4` (fuer NVMe) |
| Temperature | ❌ | ✅ `44°C` |
| Health | ❌ | ✅ `Healthy` / `Warning` |

**Neue Befehle:**
```bash
# SMART Info (fuer jede Disk)
smartctl -i /dev/sda 2>/dev/null  # Allgemein
smartctl -A /dev/sda 2>/dev/null  # Attribute (Power-On, Temp)
smartctl -H /dev/sda 2>/dev/null  # Health Status

# NVMe Info
nvme id-ctrl /dev/nvme0n1 2>/dev/null  # Controller Info
nvme smart-log /dev/nvme0n1 2>/dev/null  # SMART Log

# Extrahieren:
smartctl -i /dev/sda | grep "Serial Number:"
smartctl -i /dev/sda | grep "SATA Version"
smartctl -A /dev/sda | grep "Power_On_Hours"
smartctl -A /dev/sda | grep "Temperature"
smartctl -H /dev/sda | grep "SMART overall-health"
```

**Neues JSON-Format:**
```json
{
  "disks": [
    {
      "name": "sda",
      "size_bytes": 512110190592,
      "model": "Vi550 S3",
      "type": "SSD",
      "transport": "sata",
      "serial": "4935243884613996",
      "smart_status": "passed",
      "smart_health": "Healthy",
      "power_on_hours": 5016,
      "power_on_formatted": "209d",
      "temp_c": 44,
      "sata_version": "SATA 3.2",
      "sata_speed": "6.0 Gb/s"
    },
    {
      "name": "nvme0n1",
      "size_bytes": 1024209543168,
      "model": "Lexar SSD NM620 1TB",
      "type": "NVMe SSD",
      "transport": "nvme",
      "serial": "MLB7802004647P1012",
      "smart_status": "passed",
      "smart_health": "Healthy",
      "power_on_hours": 26832,
      "power_on_formatted": "3y 32d",
      "temp_c": 35,
      "pcie_gen": "3.0",
      "pcie_width": "x4"
    }
  ]
}
```

### GPU

| Feature | Aktuell | Ziel (ProxMenux-Style) |
|---------|---------|------------------------|
| Description | ✅ Basic lspci | ✅ Detaillierter |
| Model | ❌ (in description) | ✅ Separat `TU106 [GeForce RTX 2060 12GB]` |
| Vendor | ❌ | ✅ `NVIDIA Corporation` |
| Driver | ❌ | ✅ `vfio-pci`, `nouveau`, `nvidia` |
| PCI Slot | ❌ | ✅ `26:00.0` |
| Kernel Modules | ❌ | ✅ `nvidiafb, nouveau` |
| Temperature | ❌ | ✅ Falls nvidia-smi vorhanden |

**Neue Befehle:**
```bash
# GPU Details
lspci -v -s $(lspci | grep -iE 'vga|3d|display' | awk '{print $1}')

# Extrahieren:
lspci -nn | grep -iE 'vga|3d|display'  # Vendor + Device IDs
lspci -k | grep -A3 -iE 'vga|3d|display'  # Kernel driver/modules

# NVIDIA spezifisch
nvidia-smi --query-gpu=name,driver_version,temperature.gpu --format=csv,noheader 2>/dev/null
```

**Neues JSON-Format:**
```json
{
  "gpus": [
    {
      "description": "TU106 [GeForce RTX 2060 12GB]",
      "vendor": "NVIDIA Corporation",
      "pci_slot": "26:00.0",
      "driver": "vfio-pci",
      "kernel_modules": ["nvidiafb", "nouveau"],
      "temp_c": null
    }
  ]
}
```

### PCI Devices

| Feature | Aktuell | Ziel (ProxMenux-Style) |
|---------|---------|------------------------|
| List | ❌ | ✅ Alle PCI-Geraete |
| Type | ❌ | ✅ Storage/USB/Network/Audio/Graphics |
| Description | ❌ | ✅ Full description |
| Vendor | ❌ | ✅ Manufacturer |
| Driver | ❌ | ✅ Kernel driver |
| PCI Slot | ❌ | ✅ Bus:Device.Function |

**Neue Befehle:**
```bash
# Alle PCI-Geraete mit Details
lspci -vmm | grep -E "Slot:|Class:|Vendor:|Device:|Driver:"
```

**Neues JSON-Format:**
```json
{
  "pci_devices": [
    {
      "slot": "01:00.0",
      "type": "Storage Controller",
      "description": "FORESEE XP1000 / Lexar Professional",
      "vendor": "Shenzhen Longsys Electronics",
      "driver": "nvme"
    },
    {
      "slot": "22:00.0",
      "type": "Network Controller",
      "description": "RTL8111/8168 PCI Express Gigabit Ethernet",
      "vendor": "Realtek Semiconductor",
      "driver": "r8169"
    }
  ]
}
```

### Network Interfaces

| Feature | Aktuell | Ziel (ProxMenux-Style) |
|---------|---------|------------------------|
| Name | ✅ `enp34s0` | ✅ Gleich |
| MAC | ✅ | ✅ Gleich |
| State | ✅ `up`/`down` | ✅ Gleich |
| IPv4 | ✅ | ✅ Gleich |
| Speed | ❌ | ✅ `1.0 Gbps` |
| Duplex | ❌ | ✅ `full` / `half` |
| MTU | ❌ | ✅ `1500` |
| Driver | ❌ | ✅ `r8169` |
| Type | ❌ | ✅ `Physical` / `Bridge` / `Virtual` |

**Neue Befehle:**
```bash
# Speed und Duplex
ethtool enp34s0 2>/dev/null | grep -E "Speed:|Duplex:"

# MTU
cat /sys/class/net/enp34s0/mtu

# Driver
ethtool -i enp34s0 2>/dev/null | grep "driver:"

# Interface Type
# Physical: /sys/class/net/*/device exists
# Bridge: /sys/class/net/*/bridge exists
# Virtual: /sys/class/net/*/tun_flags exists oder name starts with veth/tap/docker
```

**Neues JSON-Format:**
```json
{
  "network": [
    {
      "name": "enp34s0",
      "type": "Physical",
      "mac": "00:d8:61:c8:12:fb",
      "state": "up",
      "ipv4": "192.168.178.25",
      "ipv6": null,
      "speed_mbps": 1000,
      "duplex": "full",
      "mtu": 1500,
      "driver": "r8169"
    },
    {
      "name": "vmbr0",
      "type": "Bridge",
      "mac": "00:d8:61:c8:12:fb",
      "state": "up",
      "ipv4": "192.168.178.25",
      "bridge_ports": ["enp34s0"],
      "mtu": 1500
    }
  ]
}
```

---

## Implementierungsplan

### Phase 1: Backend (Shell-Script + DB)

**Aufgabe 1.1: `hardware.sh` erweitern**
- [ ] BIOS Vendor + Date hinzufuegen
- [ ] CPU Sockets + Cache instances
- [ ] DIMM-Slots einzeln auslesen
- [ ] Thermal Sensors (sensors -j)
- [ ] SMART-Daten fuer Disks (smartctl)
- [ ] GPU Details (lspci -k)
- [ ] PCI Devices Liste
- [ ] Network Speed/Duplex/MTU/Driver

**Aufgabe 1.2: DB-Schema erweitern**

```sql
-- Neue Tabelle fuer detaillierte Hardware
CREATE TABLE IF NOT EXISTS node_hardware_extended (
    node_id INTEGER PRIMARY KEY,

    -- BIOS
    bios_vendor TEXT,
    bios_date TEXT,

    -- CPU extended
    cpu_sockets INTEGER DEFAULT 1,
    cpu_cache_l3_instances INTEGER,

    -- DIMM Slots (JSON array)
    dimms_json TEXT,

    -- Thermal Sensors (JSON array)
    sensors_json TEXT,

    -- PCI Devices (JSON array)
    pci_devices_json TEXT,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Erweiterte Disk-Infos (JSON in node_hardware.disks_json erweitern)
-- Erweiterte Network-Infos (JSON in node_hardware.network_json erweitern)
```

**Aufgabe 1.3: Collector anpassen**
- [ ] `runHardware()` erweitern
- [ ] Neue DB-Methoden in `db/index.js`

### Phase 2: Frontend (Views + CSS)

**Aufgabe 2.1: Overview-Tab erweitern**
- [ ] CPU: Threads, Cache-Details anzeigen
- [ ] RAM: DIMM-Slots anzeigen
- [ ] Motherboard: BIOS Vendor/Date

**Aufgabe 2.2: Neuer Hardware-Tab (ProxMenux-Style)**
- [ ] System Information Section
- [ ] Memory Modules Section (DIMM-Karten)
- [ ] Thermal Monitoring Section (Sensor-Gruppen)
- [ ] Graphics Cards Section
- [ ] PCI Devices Section
- [ ] Storage Summary Section (mit SMART)
- [ ] Network Summary Section

**Aufgabe 2.3: CSS (ProxMenux-inspiriert)**
- [ ] Section-Cards mit Icons
- [ ] Badge-System fuer Typen (SSD, NVMe, DDR4)
- [ ] Temperature-Anzeige mit Farbcodierung
- [ ] SMART-Status-Badges (Healthy/Warning/Failed)
- [ ] Collapsible Sections

### Phase 3: API

**Aufgabe 3.1: API-Endpunkte**
- [ ] `GET /api/nodes/:id/hardware/extended`
- [ ] `GET /api/nodes/:id/thermal`
- [ ] `GET /api/nodes/:id/smart`

---

## Abhaengigkeiten auf Target-Nodes

Die erweiterten Features benoetigen folgende Tools auf den Nodes:

| Tool | Paket | Fuer |
|------|-------|------|
| `dmidecode` | dmidecode | BIOS, RAM DIMMs |
| `smartctl` | smartmontools | SMART Status, Power-On Time |
| `sensors` | lm-sensors | Temperaturen |
| `ethtool` | ethtool | Network Speed/Duplex |
| `nvme` | nvme-cli | NVMe Details |
| `nvidia-smi` | nvidia-driver | NVIDIA GPU Temp |

**Fallback-Verhalten:**
- Wenn Tool nicht verfuegbar: `null` oder leeres Array zurueckgeben
- Keine Fehler werfen, graceful degradation

---

## Prioritaeten

### Prio 1 (Quick Wins)
1. SMART Status + Power-On Time (sehr nuetzlich!)
2. Thermal Sensors (CPU, Disk Temps)
3. Network Speed/Duplex/MTU

### Prio 2 (Nice to Have)
4. DIMM-Slots einzeln
5. GPU Details + Driver
6. PCI Devices Liste

### Prio 3 (Vollstaendigkeit)
7. BIOS Vendor/Date
8. CPU Sockets/Instances
9. PCIe Gen/Width fuer NVMe

---

## Geschaetzter Aufwand

| Phase | Aufgaben | Aufwand |
|-------|----------|---------|
| 1.1 | hardware.sh erweitern | 3-4 Std |
| 1.2 | DB-Schema | 30 min |
| 1.3 | Collector | 1 Std |
| 2.1 | Overview-Tab | 2 Std |
| 2.2 | Hardware-Tab (neu) | 4-6 Std |
| 2.3 | CSS | 2 Std |
| 3.1 | API | 1 Std |

**Gesamt: 14-18 Stunden**

---

## Naechste Schritte

1. **Sofort starten mit Prio 1:**
   - SMART-Daten sammeln (smartctl)
   - Thermal Sensors (sensors)
   - Network Details (ethtool)

2. **hardware.sh testen auf:**
   - Proxmox Host (node01)
   - Raspberry Pi (raspi4)
   - Docker VM

3. **Frontend iterativ bauen:**
   - Erst Overview-Tab erweitern
   - Dann separaten Hardware-Tab

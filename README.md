# nodepulse

Ein leichtgewichtiges Homelab Dashboard zur Verwaltung von Servern, Proxmox-Hosts und Docker-Containern.

![Version](https://img.shields.io/badge/version-0.6.0-green)
![Status](https://img.shields.io/badge/status-beta-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## Vision

**nodepulse** ist ein All-in-One Dashboard für dein gesamtes Homelab. Eine einheitliche Oberfläche für Proxmox VMs, Docker Container, Linux-Server und bare-metal Systeme. Leichtgewichtig genug für einen Raspberry Pi 2B.

**Highlights:**
- SSH-Native - Keine Agents nötig
- Touch-optimiert (Tablet als Kontrollzentrum)
- Self-Hosted, keine Cloud
- Unterstützt alte Browser (Chrome 50+, Fire HD 10 2017)

---

## Features

### Proxmox Integration
- VMs/Container verwalten (Start, Stop, Shutdown, Reboot)
- Snapshots erstellen und löschen
- **LVM Storage Management** - VGs, Thin Pools erstellen und in Proxmox registrieren
- **Backup & Restore** - vzdump Backups erstellen, löschen, wiederherstellen
- **Task History** - Alle Proxmox Tasks mit Live-Logs und Status

### Docker Management
- Container auflisten, starten, stoppen, Logs anzeigen
- Images, Volumes, Networks verwalten
- Prune-Funktionen

### Monitoring
- Echtzeit CPU, RAM, Disk, Netzwerk, Temperatur
- Historische Daten mit Charts
- Konfigurierbares Alert-System
- TOON-Format für 81% kleinere API-Responses (opt-in)

### Linux / Bare-Metal
- Hardware-Erkennung, SMART-Daten, Temperatur-Sensoren
- Systemd Services verwalten
- SSH-Terminal im Browser
- Network Diagnostics (Ping, DNS, Traceroute)

---

## Installation

### Quick Install (empfohlen)

```bash
curl -fsSL https://raw.githubusercontent.com/LL4nc33/nodepulse/main/scripts/install.sh -o /tmp/np-install.sh && bash /tmp/np-install.sh
```

Der Installer:
- Installiert Node.js falls nicht vorhanden
- Klont das Repository
- Installiert Dependencies
- Richtet systemd Service ein
- Startet NodePulse automatisch

**Auto-Mode** (ohne Fragen, Port 3000):
```bash
bash /tmp/np-install.sh --auto
```

Danach erreichbar unter: `http://<ip>:3000`

### Update

```bash
cd ~/nodepulse && ./scripts/install.sh
```

Wähle Option 1 für vollständiges Update (git pull + npm install + service restart).

### Manuell

```bash
git clone https://github.com/LL4nc33/nodepulse.git
cd nodepulse && npm install
npm start
```

### Service-Befehle

```bash
sudo systemctl status nodepulse   # Status anzeigen
sudo systemctl restart nodepulse  # Neustarten
sudo systemctl stop nodepulse     # Stoppen
journalctl -u nodepulse -f        # Logs anzeigen
```

---

## Deinstallation

```bash
cd ~/nodepulse && ./scripts/uninstall.sh
```

Optionen:
1. **Data only** - Löscht nur Datenbank (Fresh Start)
2. **Service only** - Entfernt systemd Service
3. **Data + Service** - Beides, behält Code
4. **Everything** - Komplette Entfernung

**Auto-Mode** (komplette Entfernung ohne Fragen):
```bash
./scripts/uninstall.sh --auto
```

---

## CLI-Tool (np)

```bash
np status                    # Alle Nodes anzeigen
np docker <node> ps          # Container auflisten
np pve <node> vms            # VMs auflisten
np shell <node>              # SSH-Session
np exec <node> "uptime"      # Befehl ausführen
```

---

## Tech Stack

| Komponente | Technologie |
|------------|-------------|
| Backend | Node.js, Express, SQLite |
| Frontend | EJS, Vanilla JS (ES5), CSS3 |
| SSH | ssh2 |
| Charts | Chart.js |

---

## Roadmap

### Abgeschlossen

- **v0.6.0** - UI/UX Overhaul
  - Sidebar Panels (Add Node, Alerts, Settings als Slide-in)
  - Edit Node als Side-Panel statt separate Seite
  - Health Check Button im Header
  - Live-Metriken mit Sparklines in Hero Cards
  - Mini Resource Bars in Sidebar pro Node
  - Konsolidierte Tags (5 Hauptkategorien)
  - Sidebar Search mit "/" Shortcut
  - Design System Verbesserungen
- **v0.5.0** - Task History & Logs, Storage-Tab Fixes
- **v0.4.5** - Backup & Restore (vzdump erstellen, löschen, wiederherstellen)
- **v0.4.4** - LVM Storage Management (VGs, Thin Pools, Proxmox-Registrierung)
- **v0.4.0** - TOON Format (81% kleinere Responses), Performance-Optimierungen
- **v0.3.0** - UI Modernization, Terminal Panel, Health-Checks

### Geplant

**v0.7.0 - Console & Compose**
- VNC/SPICE Console für VMs
- Docker Compose Support
- Live Migration

**v0.8.0 - Advanced Features**
- Backup-Scheduling
- Firewall Management
- Multi-User mit Rollen

**v1.0.0 - Stable Release**
- Cluster-Unterstützung
- Plugin-System
- Audit-Log

---

## Lizenz

MIT License

---

**OidaNice** - *Gebaut mit Liebe fürs Homelab*

# nodepulse

Ein leichtgewichtiges Homelab Dashboard zur Verwaltung von Servern, Proxmox-Hosts und Docker-Containern.

![Version](https://img.shields.io/badge/version-0.4.5-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## Vision

**nodepulse** ist ein All-in-One Dashboard fuer dein gesamtes Homelab. Eine einheitliche Oberflaeche fuer Proxmox VMs, Docker Container, Linux-Server und bare-metal Systeme. Leichtgewichtig genug fuer einen Raspberry Pi 2B.

**Highlights:**
- SSH-Native - Keine Agents noetig
- Touch-optimiert (Tablet als Kontrollzentrum)
- Self-Hosted, keine Cloud
- Unterstuetzt alte Browser (Chrome 50+, Fire HD 10 2017)

---

## Features

### Proxmox Integration
- VMs/Container verwalten (Start, Stop, Clone, Snapshot, Resize)
- **LVM Storage Management** - VGs, Thin Pools erstellen und in Proxmox registrieren
- **Backup & Restore** - vzdump Backups erstellen, loeschen, wiederherstellen
- VM/CT Erstellung direkt aus dem UI

### Docker Management
- Container auflisten, starten, stoppen, Logs anzeigen
- Images, Volumes, Networks verwalten
- Prune-Funktionen

### Monitoring
- Echtzeit CPU, RAM, Disk, Netzwerk, Temperatur
- Historische Daten mit Charts
- Konfigurierbares Alert-System
- TOON-Format fuer 81% kleinere API-Responses (opt-in)

### Linux / Bare-Metal
- Hardware-Erkennung, SMART-Daten, Temperatur-Sensoren
- Systemd Services verwalten
- SSH-Terminal im Browser
- Network Diagnostics (Ping, DNS, Traceroute)

---

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/LL4nc33/nodepulse/main/scripts/install.sh | bash
```

Danach: `http://<ip>:3000`

### Manuell

```bash
git clone https://github.com/LL4nc33/nodepulse.git
cd nodepulse && npm install
npm start
```

---

## CLI-Tool (np)

```bash
np status                    # Alle Nodes anzeigen
np docker <node> ps          # Container auflisten
np pve <node> vms            # VMs auflisten
np shell <node>              # SSH-Session
np exec <node> "uptime"      # Befehl ausfuehren
```

---

## Roadmap

### Abgeschlossen

- **v0.4.5** - Backup & Restore (vzdump erstellen, loeschen, wiederherstellen)
- **v0.4.4** - LVM Storage Management (VGs, Thin Pools, Proxmox-Registrierung)
- **v0.4.0** - TOON Format (81% kleinere Responses), Performance-Optimierungen
- **v0.3.0** - UI Modernization, Terminal Panel, Health-Checks

### In Arbeit: Proxmox Advanced Features

- [x] **Sprint 1:** LVM Storage Management
- [x] **Sprint 2:** Backup & Restore
- [ ] **Sprint 3:** Task History & Logs
- [ ] **Sprint 4:** Live Migration
- [ ] **Sprint 5:** Firewall Management

### Geplant

**v0.6.0 - Console & Compose**
- VNC/SPICE Console fuer VMs
- Docker Compose Support
- Docker Exec (Shell in Container)

**v0.7.0 - Advanced Features**
- Backup-Scheduling
- Multi-User mit Rollen
- API-Tokens

**v1.0.0 - Production Ready**
- Cluster-Unterstuetzung
- HA (High Availability)
- Audit-Log
- Plugin-System

---

## Tech Stack

| Komponente | Technologie |
|------------|-------------|
| Backend | Node.js, Express, SQLite |
| Frontend | EJS, Vanilla JS (ES5), CSS3 |
| SSH | ssh2 |
| Charts | Chart.js |

---

## Lizenz

MIT License

---

**OidaNice** - *Gebaut mit Liebe fuers Homelab*

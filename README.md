# nodepulse

Ein leichtgewichtiges Homelab Dashboard und CLI-Tool zur Verwaltung von Servern, Proxmox-Hosts und Docker-Containern.

![Version](https://img.shields.io/badge/version-0.3.2-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## Vision

**nodepulse** ist wie ein besseres Portainer - aber nicht nur fuer Docker, sondern fuer dein gesamtes Homelab. Eine einheitliche Oberflaeche fuer Server, VMs, Container und bare-metal Linux. Inspiriert von Proxmox VE und Docker Desktop, aber leichtgewichtig genug fuer einen Raspberry Pi.

### Warum nodepulse?

- **Mehr als nur Docker** - Portainer kann nur Container. nodepulse verwaltet auch Proxmox VMs, Linux-Server und Services
- **SSH-Native** - Keine Agents noetig. Alles laeuft ueber SSH - auch beliebige Linux-Befehle
- **Unified Dashboard** - Alle Nodes auf einen Blick, egal ob Proxmox, Docker oder bare-metal Linux
- **Touch-First** - Optimiert fuer Tablets als Homelab-Kontrollzentrum an der Wand
- **Self-Hosted** - Laeuft komplett lokal, keine Cloud-Abhaengigkeit
- **Lightweight** - Minimal Dependencies, schnelle Ladezeiten, alte Browser unterstuetzt

---

## Features

### Node-Management
- Multi-Node Dashboard mit Status-Uebersicht
- Node-Hierarchie (Parent/Child Beziehungen)
- Auto-Discovery von Hardware und Services
- Tags fuer Organisation und Filterung
- SSH-Terminal direkt im Browser
- Beliebige Befehle per SSH ausfuehren

### Linux / Bare-Metal
- Hardware-Erkennung (CPU, RAM, Disk, NICs)
- System-Informationen (OS, Kernel, Uptime)
- Temperatur-Sensoren auslesen
- Netzwerk-Interfaces und IPs
- Package-Manager erkennen (apt, yum, dnf, pacman)
- Beliebige Shell-Befehle remote ausfuehren

### Proxmox Integration
- VMs und Container auflisten
- Power-Control (Start, Stop, Shutdown, Reboot, Suspend, Resume)
- CPU/RAM Konfiguration aendern
- Disk-Resize
- Clone und Template erstellen
- Snapshots verwalten (Create, Delete)
- Storage-Uebersicht mit Auslastung

### Docker Management
- Container auflisten (running/all)
- Power-Control (Start, Stop, Restart, Pause, Unpause)
- Container-Logs anzeigen
- Images, Volumes, Networks auflisten
- Ressourcen loeschen (Container, Images, Volumes, Networks)
- Prune-Funktionen (System aufräumen)

### Monitoring & Alerts
- Echtzeit CPU, RAM, Disk, Netzwerk Stats
- Temperatur-Ueberwachung (falls verfuegbar)
- Historische Daten mit Charts
- Konfigurierbares Alert-System
- Schwellwerte fuer Warning/Critical

### Service-Management
- Systemd Services auflisten
- Services starten/stoppen/neustarten
- Service-Status auf einen Blick

### UI/UX
- Responsive Design (Desktop, Tablet, Mobile)
- Light/Dark Mode mit Persistenz
- Touch-optimiert (44px min. Tap-Targets)
- Side-Panel mit Quick-Navigation
- Filter und Suche
- Toast-Benachrichtigungen bei Aktionen
- Einheitliche Loading-States und Error-Handling
- Tab-Persistenz (URL-Hash + localStorage)

---

## Screenshots

*Coming soon*

---

## Quick Install (Raspberry Pi)

**One-Liner** - Kopieren, einfuegen, fertig:

```bash
curl -fsSL https://raw.githubusercontent.com/LL4nc33/nodepulse/main/scripts/install.sh | bash
```

Nach der Installation: `http://<raspberry-pi-ip>:3000`

### Private Repos (PAT erforderlich)

```bash
git clone https://LL4nc33:<DEIN_PAT>@github.com/LL4nc33/nodepulse.git ~/nodepulse
cd ~/nodepulse && npm install
sudo cp scripts/nodepulse.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now nodepulse
```

---

## Installation (Manuell)

### Voraussetzungen

- Node.js >= 18.0.0
- npm
- SSH-Zugang zu den zu verwaltenden Nodes

### Setup

```bash
# Repository klonen
git clone https://github.com/LL4nc33/nodepulse.git
cd nodepulse

# Abhaengigkeiten installieren
npm install

# Umgebungsvariablen (optional)
cp .env.example .env

# Starten
npm start
```

Dashboard ist erreichbar unter `http://localhost:3000`

---

## CLI-Tool (np)

nodepulse kommt mit einem CLI-Tool fuer schnelle Aktionen:

```bash
# Node-Status
np status                    # Alle Nodes anzeigen
np status <node-name>        # Einzelnen Node pruefen

# Docker-Befehle
np docker <node> ps          # Container auflisten
np docker <node> logs <id>   # Container-Logs
np docker <node> start <id>  # Container starten
np docker <node> stop <id>   # Container stoppen

# Proxmox-Befehle
np pve <node> vms            # VMs auflisten
np pve <node> cts            # Container auflisten
np pve <node> start <vmid>   # VM starten
np pve <node> stop <vmid>    # VM stoppen

# SSH-Shell
np shell <node>              # Interaktive SSH-Session

# Direkte Befehle
np exec <node> "uptime"      # Befehl auf Node ausfuehren
```

---

## Konfiguration

### Umgebungsvariablen (.env)

```env
# Server
PORT=3000
HOST=0.0.0.0

# Logging (optional)
LOG_LEVEL=info
```

### Settings (im Dashboard)

| Setting | Beschreibung | Standard |
|---------|--------------|----------|
| Monitoring Interval | Wie oft Stats gesammelt werden | 60s |
| Stats Retention | Wie lange Historie gespeichert wird | 168h (7 Tage) |
| CPU Warning/Critical | Schwellwerte fuer CPU-Alerts | 80% / 95% |
| RAM Warning/Critical | Schwellwerte fuer RAM-Alerts | 85% / 95% |
| Disk Warning/Critical | Schwellwerte fuer Disk-Alerts | 80% / 95% |
| Temp Warning/Critical | Schwellwerte fuer Temperatur | 70C / 85C |

---

## Headless Setup (systemd)

### Service erstellen

```bash
sudo tee /etc/systemd/system/nodepulse.service > /dev/null <<EOF
[Unit]
Description=nodepulse Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/nodepulse
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
```

### Service aktivieren

```bash
sudo systemctl daemon-reload
sudo systemctl enable nodepulse
sudo systemctl start nodepulse
```

### Nuetzliche Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `sudo systemctl status nodepulse` | Status anzeigen |
| `sudo systemctl restart nodepulse` | Neustarten |
| `sudo systemctl stop nodepulse` | Stoppen |
| `journalctl -u nodepulse -f` | Live-Logs |

---

## Roadmap

### v0.4.0 - Creation & Console
- [ ] VM erstellen (Proxmox)
- [ ] Container erstellen (Docker)
- [ ] LXC Container erstellen (Proxmox)
- [ ] VNC/SPICE Console fuer VMs
- [ ] Docker Exec (Shell in Container)

### v0.5.0 - Backup & Compose
- [ ] Proxmox Backup (vzdump)
- [ ] Proxmox Restore
- [ ] Docker Compose Support
- [ ] Stack-Management (up/down)

### v0.6.0 - Advanced Features
- [ ] Image Pull/Build (Docker)
- [ ] Backup-Scheduling
- [ ] Multi-User mit Rollen
- [ ] API-Tokens

### v1.0.0 - Production Ready
- [ ] Cluster-Unterstuetzung
- [ ] HA (High Availability)
- [ ] Audit-Log
- [ ] Plugin-System

---

## Technologie-Stack

| Komponente | Technologie |
|------------|-------------|
| Backend | Node.js, Express.js |
| Datenbank | SQLite (sql.js) |
| Frontend | EJS Templates, Vanilla JS (ES5) |
| Styling | CSS3 mit Custom Properties |
| SSH | ssh2 |
| JS-Lib | NP.API, NP.UI, NP.Tabs (main.js) |

### Browser-Kompatibilitaet

Optimiert fuer aeltere Browser (Chrome 50+):
- Flexbox mit -webkit- Prefixes
- Kein CSS Grid
- ES5 JavaScript (keine Arrow Functions)
- CSS Custom Properties (ab Chrome 49)

---

## Projektstruktur

```
nodepulse/
├── src/
│   ├── cli/            # CLI-Tool (np)
│   ├── collector/      # Stats-Sammlung
│   ├── config/         # Konfiguration
│   ├── db/             # SQLite Schema & Queries
│   ├── routes/         # Express Routes (API + Web)
│   ├── services/       # Business Logic (Alerts)
│   ├── ssh/            # SSH-Verbindungen
│   ├── views/          # EJS Templates
│   │   ├── partials/   # Header, Footer, Sidebar
│   │   ├── nodes/      # Node-Seiten
│   │   ├── monitoring/ # Monitoring-Seiten
│   │   ├── settings/   # Einstellungen
│   │   └── alerts/     # Alert-Log
│   ├── public/         # Statische Dateien
│   │   ├── css/        # Stylesheets (style.css)
│   │   ├── js/         # Client-Side JS (main.js mit NP.*)
│   │   └── img/        # Bilder, Icons
│   └── index.js        # Entry Point
├── bin/                # CLI Entry Point
├── scripts/            # Install/Deploy Scripts
├── data/               # SQLite Datenbank
└── package.json
```

---

## Entwicklung

```bash
# Development Mode mit Auto-Reload
npm run dev

# Production
npm start
```

### API-Dokumentation

Die REST-API ist unter `/api/` erreichbar:

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/nodes` | GET | Alle Nodes |
| `/api/nodes/:id` | GET | Einzelner Node |
| `/api/nodes/:id/stats` | GET | Node-Statistiken |
| `/api/nodes/:id/docker/containers` | GET | Docker Container |
| `/api/nodes/:id/proxmox/vms` | GET | Proxmox VMs |
| `/api/alerts` | GET | Aktive Alerts |
| `/api/settings` | GET/PUT | Einstellungen |

---

## Contributing

Contributions sind willkommen! Bitte:

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/amazing-feature`)
3. Committe deine Aenderungen (`git commit -m 'Add amazing feature'`)
4. Push zum Branch (`git push origin feature/amazing-feature`)
5. Oeffne einen Pull Request

### Code-Style

- ES5 JavaScript (fuer Browser-Kompatibilitaet)
- CSS mit -webkit- Prefixes
- Deutsche Kommentare sind OK

---

## Lizenz

MIT License - siehe [LICENSE](LICENSE) Datei.

---

## Autor

**OidaNice**

---

*Gebaut mit Liebe fuers Homelab*

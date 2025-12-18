# nodepulse

Ein leichtgewichtiges Homelab Dashboard und CLI-Tool zur Verwaltung von Servern, Proxmox-Hosts und Docker-Containern.

![Version](https://img.shields.io/badge/version-0.4.2-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-orange)
![TOON](https://img.shields.io/badge/TOON-v1.0-blue)

---

## Vision

**nodepulse** ist wie ein besseres Portainer - aber nicht nur fuer Docker, sondern fuer dein gesamtes Homelab. Eine einheitliche Oberflaeche fuer Server, VMs, Container und bare-metal Linux. Inspiriert von Proxmox VE und Docker Desktop, aber leichtgewichtig genug fuer einen Raspberry Pi 2B.

### Warum nodepulse?

- **Mehr als nur Docker** - Portainer kann nur Container. nodepulse verwaltet auch Proxmox VMs, Linux-Server und Services
- **SSH-Native** - Keine Agents noetig. Alles laeuft ueber SSH - auch beliebige Linux-Befehle
- **Unified Dashboard** - Alle Nodes auf einen Blick, egal ob Proxmox, Docker oder bare-metal Linux
- **Touch-First** - Optimiert fuer Tablets als Homelab-Kontrollzentrum an der Wand
- **Self-Hosted** - Laeuft komplett lokal, keine Cloud-Abhaengigkeit
- **Lightweight** - Minimal Dependencies, schnelle Ladezeiten, alte Browser unterstuetzt (Chrome 50+, Fire HD 10 2017)

---

## Features

### Node-Management
- **Multi-Node Dashboard** mit Status-Uebersicht (Liste, Karten, Baum-View)
- **Node-Hierarchie** (Parent/Child Beziehungen fuer Proxmox VMs/CTs)
- **Auto-Discovery** von Hardware, Services, Proxmox, Docker
- **Tags** fuer Organisation und Filterung (klickbar im Dashboard)
- **SSH-Terminal** direkt im Browser (Bottom-Panel, PowerShell-Style)
- Beliebige Befehle per SSH ausfuehren mit Security-Checks

### Linux / Bare-Metal
- **Hardware-Erkennung** (CPU, RAM, Disk, NICs)
- **System-Informationen** (OS, Kernel, Uptime, BIOS, Mainboard)
- **Temperatur-Sensoren** (thermal_zone*, hwmon*, CPU cores)
- **Power-Sensoren** (Intel RAPL, hwmon power metrics)
- **SMART-Daten** (Disk Health, Temperatur, Power-On Hours)
- **Netzwerk-Interfaces** (Speed, MTU, Duplex, Driver, Bridge-Ports)
- Package-Manager erkennen (apt, yum, dnf, pacman)
- **System Health-Check** (APT Updates, Kernel, Reboot Required, Docker Images, NPM Outdated)

### Proxmox Integration
- **VMs und Container** auflisten mit Status
- **Power-Control** (Start, Stop, Shutdown, Reboot, Suspend, Resume)
- **CPU/RAM Konfiguration** aendern (Resize)
- **Disk-Resize** (VM/CT erweitern)
- **Clone und Template** erstellen
- **Snapshots** verwalten (Create, Delete, Rollback)
- **Storage-Uebersicht** mit Auslastung
- **Repository Management** (Enterprise <-> No-Subscription Switch)
- **System Upgrade** (apt dist-upgrade mit Proxmox-Config)
- **VM/CT Erstellung** direkt aus dem UI

### Docker Management
- **Container auflisten** (running/all) mit Filter
- **Power-Control** (Start, Stop, Restart, Pause, Unpause, Kill)
- **Container-Logs** anzeigen (Tail, Follow)
- **Images, Volumes, Networks** auflisten
- **Ressourcen loeschen** (Container, Images, Volumes, Networks)
- **Prune-Funktionen** (System aufräumen)
- **Container Stats** (CPU, RAM, Network, Disk I/O)

### Monitoring & Alerts
- **Echtzeit CPU, RAM, Disk, Netzwerk Stats** (Mini-Balken in Liste, Cards-View)
- **Temperatur-Ueberwachung** (falls verfuegbar)
- **Historische Daten** mit Charts (Chart.js)
- **Konfigurierbares Alert-System** (Warning/Critical Levels)
- **Schwellwerte** fuer CPU, RAM, Disk, Temperatur
- **Auto-Refresh** Dashboard (konfigurierbar 5-300s)
- **Settings-Cache** fuer RPi 2B Performance (~93% weniger DB-Queries)
- **TOON-Format** (Token-Oriented Object Notation) - 81% kleinere API-Responses, 4x schnelleres Parsing (opt-in)

### Service-Management
- **Systemd Services** auflisten mit Status
- Services **starten/stoppen/neustarten/reload**
- Service-Status auf einen Blick
- Filter nach Status (running, stopped, failed)

### Network Diagnostics
- **Ping Tests** mit Statistiken
- **DNS Lookup** (A, AAAA, MX, NS Records)
- **Traceroute** mit Hop-Details
- Alle Tools remote via SSH ausfuehrbar

### UI/UX
- **Responsive Design** (Desktop, Tablet, Mobile)
- **Light/Dark Mode** mit Persistenz (localStorage)
- **Touch-optimiert** (44px min. Tap-Targets fuer Fire HD 10)
- **Side-Panel** mit Quick-Navigation (Collapsible)
- **Filter und Suche** (Debounced 300ms)
- **Toast-Benachrichtigungen** (konfigurierbar)
- Einheitliche Loading-States und Error-Handling
- **Tab-Persistenz** (URL-Hash + localStorage)
- **Keyboard-Shortcuts** (/ fokussiert Suche, Ctrl+` toggle Terminal)
- **Skip-Link** fuer Accessibility
- **Auto-Refresh** ohne Page-Reload (AJAX-basiert)
- **Design-System** (CSS-Variablen fuer Spacing, Typography, Radius, Transitions)
- **Vereinheitlichte Progress-Bars** (3 Varianten: mini, standard, large)

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
| **Auto-Discovery** | Automatisch bei Node-Add ausfuehren | true |
| **Rediscovery on Connect** | Discovery wenn Node online geht | false |
| **Monitoring Interval** | Stats-Sammel-Intervall fuer neue Nodes | 30s |
| **Dashboard Refresh** | Auto-Refresh Intervall fuer Dashboard | 5s |
| **Stats Retention** | Wie lange Historie gespeichert wird | 168h (7d) |
| **Chart Default Hours** | Standard-Zeitraum fuer Charts | 24h |
| **CPU Warning/Critical** | Schwellwerte fuer CPU-Alerts | 80% / 95% |
| **RAM Warning/Critical** | Schwellwerte fuer RAM-Alerts | 85% / 95% |
| **Disk Warning/Critical** | Schwellwerte fuer Disk-Alerts | 80% / 95% |
| **Temp Warning/Critical** | Schwellwerte fuer Temperatur | 70C / 85C |
| **Toast Notifications** | Toast-Benachrichtigungen aktivieren | true |
| **Import Inherit Credentials** | SSH-Credentials vom Parent erben | true |
| **TOON Format** | Kompaktes Format fuer API-Responses (81% kleiner) | false |

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

### ✅ v0.3.0 - UI Modernization & Performance (ABGESCHLOSSEN)
- ✅ Dashboard mit Liste/Karten/Baum-View
- ✅ Mini-Metriken in Listen-View (Proxmox-Style)
- ✅ Auto-Refresh ohne Page-Reload
- ✅ Filter-Debouncing (300ms)
- ✅ Accessibility (Skip-Link, Keyboard-Shortcuts)
- ✅ Terminal Bottom-Panel (PowerShell-Style)
- ✅ Code-Modularisierung (CSS 11 Module, JS 6 Module)
- ✅ Code-Deduplizierung (~400 Zeilen eliminiert)
- ✅ Settings-Cache (93% weniger DB-Queries)
- ✅ Hardware-Discovery erweitert (Thermal, Power, SMART, Network)
- ✅ System Health-Check & Proxmox Repository Management

### ✅ v0.4.2 - Design System Foundations (ABGESCHLOSSEN)
- ✅ CSS-Variablen: Spacing Scale (--space-xs bis --space-2xl)
- ✅ CSS-Variablen: Typography Scale (--font-size-xs bis --font-size-2xl)
- ✅ CSS-Variablen: Font Weights, Line Heights, Border Radius, Transitions
- ✅ CSS Deduplizierung (-117 Zeilen)
- ✅ Progress-Bar vereinheitlicht (3 Varianten: mini, standard, large)
- ✅ docs/frontend-design.md Dokumentation

### ✅ v0.4.1 - Security & Stability Fixes (ABGESCHLOSSEN)
- ✅ **9 kritische Bugs behoben** aus Code-Review Sprint 1-3
- ✅ Command Injection Prevention (Whitelist-Ansatz)
- ✅ XSS-Fixes in onclick Handler (JSON.stringify)
- ✅ Path Traversal Prevention in Proxmox-API
- ✅ ES5-Kompatibilitaet wiederhergestellt (Promise.finally entfernt)
- ✅ SSH Connection Leaks behoben (async stop())
- ✅ Dashboard Metrics Spacing verbessert
- ✅ localStorage Error Handling (Graceful Fallback)

### ✅ v0.4.0 - TOON Integration & Performance (ABGESCHLOSSEN)
- ✅ **TOON Format v1.0** (Token-Oriented Object Notation)
- ✅ 81% Response-Size-Reduktion (16-25 KB → 3-5 KB bei 50 Nodes)
- ✅ 4x schnelleres Parsing (<5ms vs ~20ms JSON)
- ✅ Metadata Hash System (MD5-basiert, 5min TTL In-Memory-Cache)
- ✅ Circuit Breaker Pattern (3 Failures → 60s Cooldown)
- ✅ Safe Storage Wrapper (LRU Eviction, 2 MB Limit fuer Fire HD 10)
- ✅ VMs/Container-Counts in node_stats_current (30-50% DB-Performance-Gewinn)
- ✅ Defensive Parsing (NaN/Infinity Sanitization, Timestamp Validation, Counter Reset Detection)
- ✅ ES5-kompatibel (Chrome 50+, Fire HD 10 2017)
- ✅ Zero Breaking Changes (JSON bleibt Default, TOON opt-in)

### v0.5.0 - Creation & Console
- [ ] VM erstellen (Proxmox) ✅ (UI vorhanden, Testing erforderlich)
- [ ] Container erstellen (Docker)
- [ ] LXC Container erstellen (Proxmox) ✅ (UI vorhanden, Testing erforderlich)
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
| Datenbank | SQLite (better-sqlite3) |
| Frontend | EJS Templates, Vanilla JS (ES5) |
| Styling | CSS3 mit Custom Properties (Modular) |
| SSH | ssh2 |
| Charts | Chart.js |
| JS-Lib | NP.API, NP.UI, NP.Tabs, NP.TOON, NP.SafeStorage (main.js) |
| Build-System | Custom Scripts (build-css.js, build-detail-js.js) |
| API-Format | JSON (Default) + TOON v1.0 (opt-in) |

### Code-Qualitaet

- **Modular-Architektur**: CSS (11 Module), JS (6 Detail-Module), API (11 Route-Module)
- **DRY-Prinzip**: Zentrale Utility-Module fuer Validation, Thresholds, Params
- **Performance**: Settings-Cache, AJAX-Refresh, Debouncing
- **Max. 2500 Zeilen** pro Datei (Build-System fuer Production)
- **~400 Zeilen Duplikation** eliminiert

### Browser-Kompatibilitaet

Optimiert fuer aeltere Browser (Chrome 50+, Fire HD 10 2017):
- Flexbox mit -webkit- Prefixes
- Kein CSS Grid
- ES5 JavaScript (keine Arrow Functions, kein const/let)
- CSS Custom Properties (ab Chrome 49)
- Polyfills wo noetig

---

## Projektstruktur

```
nodepulse/
├── src/
│   ├── cli/            # CLI-Tool (np)
│   ├── collector/      # Stats-Sammlung & Discovery
│   ├── config/         # Konfiguration
│   ├── db/             # SQLite Schema & Queries
│   ├── lib/            # Zentrale Utility-Module
│   │   ├── validators.js     # Validierungs-Funktionen
│   │   ├── thresholds.js     # Alert-Thresholds & Settings
│   │   ├── params.js         # Parameter-Parsing
│   │   ├── utils.js          # formatBytes & Utilities
│   │   └── circuit-breaker.js # Circuit Breaker Pattern (SSH-Spam-Prevention)
│   ├── middleware/     # Express Middleware (Sidebar)
│   ├── routes/         # Express Routes
│   │   ├── api/        # API Routes (11 Module)
│   │   │   ├── index.js
│   │   │   ├── nodes.js
│   │   │   ├── proxmox.js
│   │   │   ├── docker.js
│   │   │   ├── stats.js     # TOON-Formatter & Metadata-Hash
│   │   │   ├── alerts.js
│   │   │   ├── commands.js
│   │   │   ├── services.js
│   │   │   ├── settings.js
│   │   │   ├── tags.js
│   │   │   ├── health.js
│   │   │   ├── metrics.js
│   │   │   └── helpers.js
│   │   └── web.js      # Web Routes
│   ├── services/       # Business Logic (Alerts)
│   ├── ssh/            # SSH-Verbindungen
│   ├── views/          # EJS Templates
│   │   ├── partials/   # Wiederverwendbare Komponenten
│   │   │   ├── header.ejs
│   │   │   ├── footer.ejs
│   │   │   ├── side-panel.ejs
│   │   │   ├── progress-bar.ejs
│   │   │   ├── empty-state.ejs
│   │   │   └── node-detail/  # Node-Detail Partials
│   │   ├── nodes/      # Node-Seiten
│   │   ├── monitoring/ # Monitoring-Seiten
│   │   ├── settings/   # Einstellungen
│   │   └── alerts/     # Alert-Log
│   ├── public/         # Statische Dateien
│   │   ├── css/
│   │   │   ├── modules/    # CSS-Module (11 Dateien)
│   │   │   └── style.css   # Gebaut aus Modulen
│   │   ├── js/
│   │   │   ├── detail/     # Detail-Page Module (7 Dateien)
│   │   │   ├── detail-page.js  # Gebaut aus Modulen
│   │   │   ├── main.js         # Global JS (NP.API, NP.UI, TOON Auto-Detection)
│   │   │   ├── toon-parser.js  # TOON Parser v1.0 (ES5)
│   │   │   ├── safe-storage.js # Safe Storage LRU Eviction (ES5)
│   │   │   ├── charts.js       # Chart.js Helper
│   │   │   └── notifications.js
│   │   └── img/        # Bilder, Icons
│   └── index.js        # Entry Point
├── scripts/            # Utility Scripts
│   ├── install.sh      # Install Script fuer RPi
│   ├── build-css.js    # CSS Build-System
│   ├── build-detail-js.js  # JS Build-System
│   ├── hardware.sh     # Hardware Discovery
│   ├── health-check.sh # System Health
│   └── proxmox-repo.sh # Proxmox Repo Management
├── bin/                # CLI Entry Point
├── data/               # SQLite Datenbank
├── docs/               # Dokumentation
│   ├── adr/            # Architecture Decision Records
│   │   └── 001-toon-format-integration.md
│   ├── code-review-sprint-1-3.md
│   ├── frontend-design.md      # Design-System Dokumentation
│   └── TOON-IMPLEMENTATION-SUMMARY.md
└── package.json
```

---

## Entwicklung

```bash
# Development Mode mit Auto-Reload
npm run dev

# Production
npm start

# CSS aus Modulen bauen
npm run build:css

# JS aus Modulen bauen
npm run build:js

# Beide bauen
npm run build
```

### API-Dokumentation

Die REST-API ist unter `/api/` erreichbar:

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/nodes` | GET | Alle Nodes |
| `/api/nodes/:id` | GET | Einzelner Node |
| `/api/stats?format=toon` | GET | Stats (TOON Format optional) |
| `/api/stats/node/:id?format=toon` | GET | Node-Stats (TOON Format optional) |
| `/api/stats/node/:id/history?hours=24&format=toon` | GET | Stats-Historie (TOON Format optional) |
| `/api/stats/hierarchy?format=toon` | GET | Hierarchie-Stats (TOON Format optional) |
| `/api/nodes/:id/docker/containers` | GET | Docker Container |
| `/api/nodes/:id/proxmox/vms` | GET | Proxmox VMs |
| `/api/nodes/:id/proxmox/cts` | GET | Proxmox CTs |
| `/api/nodes/:id/services` | GET | Systemd Services |
| `/api/nodes/:id/health` | GET | System Health |
| `/api/nodes/:id/health/check` | POST | Health-Check ausfuehren |
| `/api/nodes/:id/health/repo` | GET | Proxmox Repo Status |
| `/api/nodes/:id/health/repo` | POST | Proxmox Repo wechseln |
| `/api/nodes/:id/health/upgrade` | POST | System Upgrade |
| `/api/alerts` | GET | Aktive Alerts |
| `/api/settings` | GET/PUT | Einstellungen |

**TOON Format:**
- Query-Parameter: `?format=toon`
- Optional: `&metadata_hash=abc123` (skips metadata if hash matches)
- Response: `{format: 'toon', version: 1, nodes: [...], metadata_hash: '...', metadata: {...}}`
- 81% kleinere Responses, 4x schnelleres Parsing

---

## Performance-Optimierungen

| Optimierung | Impact | Status |
|-------------|--------|--------|
| **TOON Format v1.0** | **81% kleinere Responses, 4x schnelleres Parsing** | ✅ |
| Settings-Cache | ~93% weniger DB-Queries | ✅ |
| AJAX-Refresh | ~80% weniger Traffic | ✅ |
| Filter-Debouncing | ~90% weniger DOM-Ops | ✅ |
| API-basierte Updates | Kein Flackern | ✅ |
| Code-Deduplizierung | ~400 Zeilen gespart | ✅ |
| Sidebar-Middleware | ~87% weniger Queries | ✅ |
| Alert-Query-Optimierung | ~99% weniger Queries | ✅ |
| VMs/Container-Counts | 30-50% DB-Performance-Gewinn | ✅ |
| Circuit Breaker | Verhindert SSH-Spam bei Offline-Nodes | ✅ |
| Safe Storage (LRU) | localStorage Quota-Management fuer Fire HD 10 | ✅ |

---

## Contributing

Contributions sind willkommen! Bitte:

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/amazing-feature`)
3. Committe deine Aenderungen (`git commit -m 'Add amazing feature'`)
4. Push zum Branch (`git push origin feature/amazing-feature`)
5. Oeffne einen Pull Request

### Code-Style

- **ES5 JavaScript** (fuer Browser-Kompatibilitaet)
- **CSS mit -webkit- Prefixes** (Flexbox)
- **Max. 2500 Zeilen** pro Datei (nutze Build-System)
- **DRY-Prinzip** (nutze zentrale Utility-Module)
- Deutsche Kommentare sind OK

---

## Lizenz

MIT License - siehe [LICENSE](LICENSE) Datei.

---

## Autor

**OidaNice**

---

*Gebaut mit Liebe fuers Homelab - Optimiert fuer Raspberry Pi 2B*

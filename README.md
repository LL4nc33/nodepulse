# nodepulse

Ein leichtgewichtiges Homelab Dashboard für Raspberry Pi und Fire HD 10 Tablets.

![Version](https://img.shields.io/badge/version-0.3.1-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-orange)

## Features

- **Node-Überwachung** - Verwalte und überwache deine Server, Raspberry Pis und andere Geräte
- **Docker Management** - Starte, stoppe und überwache Docker Container
- **Proxmox Integration** - Verwalte VMs und Container auf deinem Proxmox Server
- **Service Management** - Steuere systemd Services direkt aus dem Dashboard
- **Echtzeit-Monitoring** - CPU, RAM, Disk und Netzwerk-Statistiken
- **Light/Dark Mode** - Umschaltbares Theme mit localStorage-Persistenz
- **Touch-optimiert** - WCAG-konforme Buttons (min. 44px) für Tablet-Bedienung
- **Responsive Design** - Optimiert für Fire HD 10 (2017) und andere Tablets

## Voraussetzungen

- Node.js >= 18.0.0
- npm oder yarn
- SQLite3 (wird automatisch mit better-sqlite3 kompiliert)

## Installation

```bash
# Repository klonen
git clone https://github.com/LL4nc33/nodepulse.git
cd nodepulse

# Abhängigkeiten installieren
npm install

# Umgebungsvariablen konfigurieren
cp .env.example .env
# .env nach Bedarf anpassen

# Starten
npm start
```

## Konfiguration

Erstelle eine `.env` Datei basierend auf `.env.example`:

```env
# Server
PORT=3000
HOST=0.0.0.0

# Logging
LOG_LEVEL=info
```

## Verwendung

Nach dem Start ist das Dashboard unter `http://localhost:3000` erreichbar.

### Nodes hinzufügen

1. Navigiere zu "Nodes" > "Node hinzufügen"
2. Gib Name, Host/IP und SSH-Zugangsdaten ein
3. Wähle den Node-Typ (Linux, Proxmox, Docker, etc.)

### Theme wechseln

Klicke auf das Sonne/Mond-Symbol in der Navigation um zwischen Light und Dark Mode zu wechseln. Die Einstellung wird im Browser gespeichert.

## Technologie-Stack

- **Backend:** Node.js, Express.js
- **Datenbank:** SQLite (better-sqlite3)
- **Frontend:** EJS Templates, Vanilla JavaScript (ES5)
- **Styling:** CSS3 mit Custom Properties (Theming)
- **SSH:** ssh2 für Remote-Verbindungen

## Browser-Kompatibilität

Optimiert für ältere Browser (Chrome 50+):
- Flexbox mit -webkit- Prefixes
- Kein CSS Grid
- ES5 JavaScript (keine Arrow Functions, kein const/let)
- CSS Custom Properties (ab Chrome 49)

## Projektstruktur

```
nodepulse/
├── src/
│   ├── config/         # Konfiguration
│   ├── db/             # Datenbank-Schema
│   ├── routes/         # Express Routes
│   ├── services/       # Business Logic
│   ├── views/          # EJS Templates
│   │   └── partials/   # Header, Footer
│   ├── public/         # Statische Dateien
│   │   ├── css/        # Stylesheets
│   │   └── img/        # Bilder, Icons
│   └── index.js        # Entry Point
├── scripts/            # Shell-Skripte für Nodes
├── data/               # SQLite Datenbank
└── package.json
```

## Entwicklung

```bash
# Development Mode mit Auto-Reload
npm run dev
```

## Lizenz

MIT License - siehe [LICENSE](LICENSE) Datei.

## Autor

**OidaNice**

---

*Gebaut mit Liebe für das Homelab*

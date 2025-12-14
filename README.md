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

## Quick Install (Raspberry Pi)

**One-Shot Command** - Kopieren, einfügen, fertig:

```bash
curl -fsSL https://raw.githubusercontent.com/LL4nc33/nodepulse/main/scripts/install.sh | bash
```

Oder manuell:

```bash
git clone https://github.com/LL4nc33/nodepulse.git ~/nodepulse && cd ~/nodepulse && npm install && sudo cp scripts/nodepulse.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now nodepulse
```

Nach der Installation: `http://<raspberry-pi-ip>:3000`

---

## Installation (Manuell)

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

---

## Headless Setup (Raspberry Pi)

So richtest du nodepulse als Hintergrund-Service ein, der automatisch beim Booten startet.

### Schritt 1: Node.js installieren (falls nicht vorhanden)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Schritt 2: nodepulse installieren

```bash
cd ~
git clone https://github.com/LL4nc33/nodepulse.git
cd nodepulse
npm install
cp .env.example .env
```

### Schritt 3: systemd Service erstellen

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

### Schritt 4: Service aktivieren und starten

```bash
sudo systemctl daemon-reload
sudo systemctl enable nodepulse
sudo systemctl start nodepulse
```

### Schritt 5: Status prüfen

```bash
sudo systemctl status nodepulse
```

### Nützliche Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `sudo systemctl status nodepulse` | Status anzeigen |
| `sudo systemctl restart nodepulse` | Neustarten |
| `sudo systemctl stop nodepulse` | Stoppen |
| `journalctl -u nodepulse -f` | Live-Logs anzeigen |
| `journalctl -u nodepulse --since "1 hour ago"` | Logs der letzten Stunde |

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

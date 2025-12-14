#!/bin/bash
#
# nodepulse - One-Shot Installer für Raspberry Pi
# Verwendung: curl -fsSL https://raw.githubusercontent.com/LL4nc33/nodepulse/main/scripts/install.sh | bash
#

set -e

echo "╔═══════════════════════════════════════╗"
echo "║       nodepulse Installer             ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Farben
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="$HOME/nodepulse"

# Node.js prüfen
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js nicht gefunden. Installiere Node.js 20.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION"

# Repository klonen oder updaten
if [ -d "$INSTALL_DIR" ]; then
    echo "Aktualisiere nodepulse..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "Klone nodepulse..."
    git clone https://github.com/LL4nc33/nodepulse.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Dependencies installieren
echo "Installiere Abhängigkeiten..."
npm install --production

# .env erstellen falls nicht vorhanden
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✓${NC} .env erstellt"
fi

# systemd Service installieren
echo "Richte systemd Service ein..."
sudo tee /etc/systemd/system/nodepulse.service > /dev/null <<EOF
[Unit]
Description=nodepulse Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Service aktivieren und starten
sudo systemctl daemon-reload
sudo systemctl enable nodepulse
sudo systemctl restart nodepulse

# IP-Adresse ermitteln
IP=$(hostname -I | awk '{print $1}')

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║       Installation abgeschlossen!     ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✓${NC} nodepulse läuft jetzt als Service"
echo ""
echo "Dashboard öffnen:"
echo -e "  ${GREEN}http://$IP:3000${NC}"
echo ""
echo "Service-Befehle:"
echo "  sudo systemctl status nodepulse"
echo "  sudo systemctl restart nodepulse"
echo "  journalctl -u nodepulse -f"
echo ""

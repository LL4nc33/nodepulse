#!/bin/bash
# nodepulse systemd Service Setup Script
# Fuehre dieses Script auf dem Server aus: bash setup-service.sh

set -e

NODEPULSE_DIR="/home/lance/nodepulse"
SERVICE_NAME="nodepulse"
USER="lance"

echo "=== nodepulse Service Setup ==="
echo ""

# Check if running as root for systemd operations
if [ "$EUID" -ne 0 ]; then
    echo "Dieses Script benoetigt sudo-Rechte fuer systemd."
    echo "Starte neu mit sudo..."
    exec sudo bash "$0" "$@"
fi

# Check if nodepulse directory exists
if [ ! -d "$NODEPULSE_DIR" ]; then
    echo "FEHLER: $NODEPULSE_DIR nicht gefunden!"
    exit 1
fi

# Check if node is installed
NODE_PATH=$(which node 2>/dev/null || echo "")
if [ -z "$NODE_PATH" ]; then
    echo "FEHLER: Node.js nicht gefunden!"
    exit 1
fi
echo "Node.js gefunden: $NODE_PATH"

# Create systemd service file
echo "Erstelle systemd Service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=nodepulse - Node Monitoring Dashboard
Documentation=https://github.com/oidanice/nodepulse
After=network.target

[Service]
Type=simple
User=${USER}
Group=${USER}
WorkingDirectory=${NODEPULSE_DIR}
ExecStart=${NODE_PATH} src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

echo "Service-Datei erstellt: /etc/systemd/system/${SERVICE_NAME}.service"

# Reload systemd
echo "Lade systemd neu..."
systemctl daemon-reload

# Enable service for autostart
echo "Aktiviere Autostart..."
systemctl enable ${SERVICE_NAME}

# Check if nodepulse is currently running via npm
echo ""
echo "=== Service starten ==="
if pgrep -f "node.*nodepulse" > /dev/null; then
    echo "nodepulse laeuft bereits (vermutlich via npm start)."
    echo "Stoppe alten Prozess..."
    pkill -f "node.*nodepulse" || true
    sleep 2
fi

# Start the service
echo "Starte ${SERVICE_NAME} Service..."
systemctl start ${SERVICE_NAME}

# Check status
sleep 2
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo ""
    echo "=== ERFOLG ==="
    echo "nodepulse laeuft jetzt als systemd Service!"
    echo ""
    echo "Nuetzliche Befehle:"
    echo "  Status:    sudo systemctl status nodepulse"
    echo "  Logs:      journalctl -u nodepulse -f"
    echo "  Neustart:  sudo systemctl restart nodepulse"
    echo "  Stoppen:   sudo systemctl stop nodepulse"
    echo ""
    systemctl status ${SERVICE_NAME} --no-pager
else
    echo ""
    echo "=== FEHLER ==="
    echo "Service konnte nicht gestartet werden!"
    echo "Pruefe Logs mit: journalctl -u nodepulse -n 50"
    systemctl status ${SERVICE_NAME} --no-pager
    exit 1
fi

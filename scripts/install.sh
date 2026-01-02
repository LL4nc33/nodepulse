#!/bin/bash
#
# NodePulse Installer v1.0
#
# Usage:
#   Fresh install:  curl -fsSL https://raw.githubusercontent.com/LL4nc33/nodepulse/main/scripts/install.sh -o /tmp/np-install.sh && bash /tmp/np-install.sh
#   Update:         cd ~/nodepulse && ./scripts/install.sh
#   Auto mode:      ./scripts/install.sh --auto
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Flags
AUTO_MODE=false
[ "$1" = "--auto" ] || [ "$1" = "-y" ] && AUTO_MODE=true

# Header
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════╗"
echo "║        NodePulse Installer            ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Determine install directory
INSTALL_DIR="$HOME/nodepulse"
CLONE_REPO=true

if [ -f "package.json" ] && grep -q '"name": "nodepulse"' package.json 2>/dev/null; then
    INSTALL_DIR="$(pwd)"
    CLONE_REPO=false
fi

echo "Directory: $INSTALL_DIR"
echo ""

# =============================================================================
# Prerequisites
# =============================================================================

echo -e "${YELLOW}[1/4] Checking prerequisites...${NC}"

# Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}  Installing Node.js 20.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
    echo -e "${RED}  ✗ Node.js $NODE_VER too old (need 18+)${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ Node.js $(node -v)${NC}"

# npm
command -v npm &> /dev/null || { echo -e "${RED}  ✗ npm not found${NC}"; exit 1; }
echo -e "${GREEN}  ✓ npm $(npm -v)${NC}"

# git (only if cloning)
if [ "$CLONE_REPO" = true ]; then
    if ! command -v git &> /dev/null; then
        echo -e "${YELLOW}  Installing git...${NC}"
        sudo apt-get install -y git
    fi
    echo -e "${GREEN}  ✓ git $(git --version | cut -d' ' -f3)${NC}"
fi

echo ""

# =============================================================================
# Menu
# =============================================================================

if [ "$AUTO_MODE" = true ]; then
    echo -e "${YELLOW}Auto mode: Full installation${NC}"
    ACTION="full"
else
    echo -e "${YELLOW}Select action:${NC}"
    echo ""
    if [ "$CLONE_REPO" = true ]; then
        echo "  1) Fresh install"
    else
        echo "  1) Update (git pull + npm install)"
    fi
    echo "  2) Reinstall dependencies only"
    echo "  3) Reinstall service only"
    echo "  4) Cancel"
    echo ""
    read -p "Choose [1-4]: " choice

    case $choice in
        1) ACTION="full" ;;
        2) ACTION="deps" ;;
        3) ACTION="service" ;;
        4) echo "Cancelled."; exit 0 ;;
        *) echo "Invalid."; exit 1 ;;
    esac
fi

echo ""

# =============================================================================
# Clone/Update Repository
# =============================================================================

if [ "$ACTION" = "full" ]; then
    echo -e "${YELLOW}[2/4] Getting source code...${NC}"

    if [ "$CLONE_REPO" = true ]; then
        if [ -d "$INSTALL_DIR" ]; then
            cd "$INSTALL_DIR"
            git pull
            echo -e "${GREEN}  ✓ Updated${NC}"
        else
            git clone https://github.com/LL4nc33/nodepulse.git "$INSTALL_DIR"
            echo -e "${GREEN}  ✓ Cloned${NC}"
        fi
    else
        git pull 2>/dev/null && echo -e "${GREEN}  ✓ Updated${NC}" || echo -e "${YELLOW}  ⚠ Git pull skipped${NC}"
    fi
    echo ""
fi

cd "$INSTALL_DIR"

# =============================================================================
# Dependencies
# =============================================================================

if [ "$ACTION" = "full" ] || [ "$ACTION" = "deps" ]; then
    echo -e "${YELLOW}[3/4] Installing dependencies...${NC}"
    npm install --omit=dev --loglevel=error
    echo -e "${GREEN}  ✓ Dependencies installed${NC}"
    echo ""
fi

# =============================================================================
# Data Directory
# =============================================================================

mkdir -p "$INSTALL_DIR/data"

# =============================================================================
# Systemd Service
# =============================================================================

if [ "$ACTION" = "full" ] || [ "$ACTION" = "service" ]; then
    echo -e "${YELLOW}[4/4] Setting up service...${NC}"

    # Port
    if [ "$AUTO_MODE" = true ]; then
        PORT=3000
    else
        read -p "  Port [3000]: " PORT
        PORT=${PORT:-3000}
    fi

    # Create service file
    sudo tee /etc/systemd/system/nodepulse.service > /dev/null <<EOF
[Unit]
Description=NodePulse - Homelab Dashboard
Documentation=https://github.com/LL4nc33/nodepulse
After=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) src/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$PORT

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$INSTALL_DIR/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable nodepulse --quiet
    echo -e "${GREEN}  ✓ Service configured (port $PORT)${NC}"

    # Start
    if [ "$AUTO_MODE" = true ]; then
        DO_START="Y"
    else
        read -p "  Start now? [Y/n]: " DO_START
        DO_START=${DO_START:-Y}
    fi

    if [[ "$DO_START" =~ ^[Yy]$ ]]; then
        sudo systemctl restart nodepulse
        sleep 2
        if systemctl is-active --quiet nodepulse; then
            echo -e "${GREEN}  ✓ Started${NC}"
        else
            echo -e "${RED}  ✗ Failed to start - check: journalctl -u nodepulse${NC}"
            exit 1
        fi
    fi
    echo ""
fi

# =============================================================================
# Done
# =============================================================================

IP=$(hostname -I 2>/dev/null | awk '{print $1}')

echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Installation Done!          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}URL:${NC}  http://${IP:-localhost}:${PORT:-3000}/"
echo ""
echo -e "  ${CYAN}Commands:${NC}"
echo "    systemctl status nodepulse"
echo "    journalctl -u nodepulse -f"
echo ""

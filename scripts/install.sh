#!/bin/bash
#
# NodePulse Installer
#
# Verwendung:
#   Remote:    curl -fsSL https://...install.sh -o /tmp/i.sh && bash /tmp/i.sh
#   Lokal:     ./scripts/install.sh
#   Auto:      ./scripts/install.sh --auto
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Check for --auto flag (non-interactive full install)
AUTO_MODE=false
if [ "$1" = "--auto" ] || [ "$1" = "-y" ]; then
    AUTO_MODE=true
fi

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════╗"
echo "║        NodePulse Installer            ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Always use home directory for install (avoid deleted cwd issues)
INSTALL_DIR="$HOME/nodepulse"

# Check if running from within existing nodepulse directory
if [ -f "package.json" ] && grep -q '"name": "nodepulse"' package.json 2>/dev/null; then
    INSTALL_DIR="$(pwd)"
    CLONE_REPO=false
else
    CLONE_REPO=true
fi

echo "Install directory: $INSTALL_DIR"
echo ""

# =============================================================================
# Prerequisites Check
# =============================================================================

echo -e "${YELLOW}Checking prerequisites...${NC}"
echo ""

# Check/Install Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing Node.js 20.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js version too old (v$NODE_VERSION)${NC}"
    echo "  NodePulse requires Node.js 18+"
    echo "  Run: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Check git (only if we need to clone)
if [ "$CLONE_REPO" = true ]; then
    if ! command -v git &> /dev/null; then
        echo -e "${YELLOW}Installing git...${NC}"
        sudo apt-get install -y git
    fi
    echo -e "${GREEN}✓ git $(git --version | cut -d' ' -f3)${NC}"
fi

echo ""

# =============================================================================
# Installation Options
# =============================================================================

if [ "$AUTO_MODE" = true ]; then
    echo -e "${YELLOW}Auto mode: Full installation${NC}"
    DO_CLONE=true
    DO_DEPS=true
    DO_SERVICE=true
else
    echo -e "${YELLOW}Installation options:${NC}"
    echo ""
    echo "  1) Full install (clone/update + deps + systemd)"
    echo "  2) Dependencies only (npm install)"
    echo "  3) Service only (systemd setup)"
    echo "  4) Cancel"
    echo ""
    read -p "Choose [1-4]: " choice

    case $choice in
        1) DO_CLONE=true; DO_DEPS=true; DO_SERVICE=true ;;
        2) DO_CLONE=false; DO_DEPS=true; DO_SERVICE=false ;;
        3) DO_CLONE=false; DO_DEPS=false; DO_SERVICE=true ;;
        4) echo "Cancelled."; exit 0 ;;
        *) echo "Invalid choice."; exit 1 ;;
    esac
fi

echo ""

# =============================================================================
# Clone/Update Repository
# =============================================================================

if [ "$DO_CLONE" = true ] && [ "$CLONE_REPO" = true ]; then
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}Updating NodePulse...${NC}"
        cd "$INSTALL_DIR"
        git pull
        echo -e "${GREEN}✓ Repository updated${NC}"
    else
        echo -e "${YELLOW}Cloning NodePulse...${NC}"
        git clone https://github.com/LL4nc33/nodepulse.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        echo -e "${GREEN}✓ Repository cloned${NC}"
    fi
    echo ""
fi

cd "$INSTALL_DIR"

# =============================================================================
# Install Dependencies
# =============================================================================

if [ "$DO_DEPS" = true ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install --production
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# =============================================================================
# Create Data Directory
# =============================================================================

mkdir -p "$INSTALL_DIR/data"

# =============================================================================
# Setup Systemd Service
# =============================================================================

if [ "$DO_SERVICE" = true ]; then
    echo -e "${YELLOW}Setting up systemd service...${NC}"

    # Port configuration
    if [ "$AUTO_MODE" = true ]; then
        PORT=3000
    else
        read -p "Port [3000]: " PORT
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

# Environment
Environment=NODE_ENV=production
Environment=PORT=$PORT

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$INSTALL_DIR/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    echo -e "${GREEN}✓ Service file created${NC}"

    # Reload and enable
    sudo systemctl daemon-reload
    sudo systemctl enable nodepulse
    echo -e "${GREEN}✓ Service enabled${NC}"

    # Start service
    if [ "$AUTO_MODE" = true ]; then
        START_NOW="Y"
    else
        read -p "Start NodePulse now? [Y/n]: " START_NOW
        START_NOW=${START_NOW:-Y}
    fi

    if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
        sudo systemctl restart nodepulse
        sleep 2

        if systemctl is-active --quiet nodepulse; then
            echo -e "${GREEN}✓ NodePulse started${NC}"
        else
            echo -e "${RED}✗ Failed to start${NC}"
            echo "  Check: journalctl -u nodepulse -f"
            exit 1
        fi
    fi
fi

# =============================================================================
# Done
# =============================================================================

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
HOSTNAME=$(hostname)

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Installation Complete!            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Access NodePulse:${NC}"
echo "    http://${HOSTNAME}:${PORT:-3000}/"
[ -n "$IP" ] && echo "    http://${IP}:${PORT:-3000}/"
echo ""
echo -e "  ${CYAN}Commands:${NC}"
echo "    sudo systemctl status nodepulse"
echo "    sudo systemctl restart nodepulse"
echo "    journalctl -u nodepulse -f"
echo ""

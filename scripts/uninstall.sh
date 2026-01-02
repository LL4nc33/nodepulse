#!/bin/bash
#
# NodePulse Uninstaller
# Removes NodePulse service, data, and optionally the entire installation
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}"
echo "╔═══════════════════════════════════════╗"
echo "║       NodePulse Uninstaller           ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Get script directory (where nodepulse is installed)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
SERVICE_FILE="/etc/systemd/system/nodepulse.service"

echo "Installation directory: $SCRIPT_DIR"
echo ""

# Check what to remove
echo -e "${YELLOW}What do you want to remove?${NC}"
echo ""
echo "  1) Data only (database, keeps code)"
echo "  2) Service only (systemd, keeps data & code)"
echo "  3) Data + Service (keeps code for development)"
echo "  4) EVERYTHING (complete removal)"
echo "  5) Cancel"
echo ""
read -p "Choose [1-5]: " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}Removing data...${NC}"
        if [ -d "$DATA_DIR" ]; then
            rm -rf "$DATA_DIR"
            echo -e "${GREEN}✓ Data directory removed${NC}"
        else
            echo "  No data directory found"
        fi
        ;;
    2)
        echo ""
        echo -e "${YELLOW}Removing systemd service...${NC}"
        if [ -f "$SERVICE_FILE" ]; then
            sudo systemctl stop nodepulse 2>/dev/null || true
            sudo systemctl disable nodepulse 2>/dev/null || true
            sudo rm -f "$SERVICE_FILE"
            sudo systemctl daemon-reload
            echo -e "${GREEN}✓ Service removed${NC}"
        else
            echo "  No service file found"
        fi
        ;;
    3)
        echo ""
        echo -e "${YELLOW}Removing data and service...${NC}"

        # Stop and remove service
        if [ -f "$SERVICE_FILE" ]; then
            sudo systemctl stop nodepulse 2>/dev/null || true
            sudo systemctl disable nodepulse 2>/dev/null || true
            sudo rm -f "$SERVICE_FILE"
            sudo systemctl daemon-reload
            echo -e "${GREEN}✓ Service removed${NC}"
        fi

        # Remove data
        if [ -d "$DATA_DIR" ]; then
            rm -rf "$DATA_DIR"
            echo -e "${GREEN}✓ Data directory removed${NC}"
        fi

        # Clean SSH control sockets
        rm -rf /tmp/ssh-control-* 2>/dev/null || true
        echo -e "${GREEN}✓ SSH control sockets cleaned${NC}"
        ;;
    4)
        echo ""
        echo -e "${RED}WARNING: This will remove EVERYTHING!${NC}"
        echo "  - Systemd service"
        echo "  - Database and all data"
        echo "  - Entire nodepulse directory: $SCRIPT_DIR"
        echo ""
        read -p "Are you sure? Type 'YES' to confirm: " confirm

        if [ "$confirm" != "YES" ]; then
            echo "Cancelled."
            exit 0
        fi

        echo ""
        echo -e "${YELLOW}Removing everything...${NC}"

        # Stop and remove service
        if [ -f "$SERVICE_FILE" ]; then
            sudo systemctl stop nodepulse 2>/dev/null || true
            sudo systemctl disable nodepulse 2>/dev/null || true
            sudo rm -f "$SERVICE_FILE"
            sudo systemctl daemon-reload
            echo -e "${GREEN}✓ Service removed${NC}"
        fi

        # Clean SSH control sockets
        rm -rf /tmp/ssh-control-* 2>/dev/null || true
        echo -e "${GREEN}✓ SSH control sockets cleaned${NC}"

        # Remove entire directory
        echo -e "${YELLOW}Removing $SCRIPT_DIR ...${NC}"
        cd /
        rm -rf "$SCRIPT_DIR"
        echo -e "${GREEN}✓ NodePulse directory removed${NC}"

        echo ""
        echo -e "${GREEN}NodePulse has been completely removed.${NC}"
        exit 0
        ;;
    5)
        echo "Cancelled."
        exit 0
        ;;
    *)
        echo "Invalid choice."
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"

# Hint for fresh start
if [ "$choice" = "1" ] || [ "$choice" = "3" ]; then
    echo ""
    echo -e "${YELLOW}To start fresh:${NC}"
    echo "  sudo systemctl start nodepulse"
    echo ""
    echo "A new database will be created automatically."
fi

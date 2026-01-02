#!/bin/bash
#
# NodePulse Uninstaller v1.0
#
# Usage:
#   Interactive:  ./scripts/uninstall.sh
#   Auto wipe:    ./scripts/uninstall.sh --auto
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
echo -e "${RED}"
echo "╔═══════════════════════════════════════╗"
echo "║       NodePulse Uninstaller           ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)" || SCRIPT_DIR="$HOME/nodepulse"
DATA_DIR="$SCRIPT_DIR/data"
SERVICE_FILE="/etc/systemd/system/nodepulse.service"

echo "Directory: $SCRIPT_DIR"
echo ""

# =============================================================================
# Menu
# =============================================================================

if [ "$AUTO_MODE" = true ]; then
    echo -e "${YELLOW}Auto mode: Complete removal${NC}"
    ACTION="everything"
else
    echo -e "${YELLOW}What do you want to remove?${NC}"
    echo ""
    echo "  1) Data only (database - keeps code & service)"
    echo "  2) Service only (keeps data & code)"
    echo "  3) Data + Service (keeps code)"
    echo "  4) Everything (complete removal)"
    echo "  5) Cancel"
    echo ""
    read -p "Choose [1-5]: " choice

    case $choice in
        1) ACTION="data" ;;
        2) ACTION="service" ;;
        3) ACTION="data+service" ;;
        4) ACTION="everything" ;;
        5) echo "Cancelled."; exit 0 ;;
        *) echo "Invalid."; exit 1 ;;
    esac
fi

echo ""

# =============================================================================
# Stop Service
# =============================================================================

stop_service() {
    if systemctl is-active --quiet nodepulse 2>/dev/null; then
        sudo systemctl stop nodepulse
        echo -e "${GREEN}  ✓ Service stopped${NC}"
    fi
}

# =============================================================================
# Remove Data
# =============================================================================

remove_data() {
    if [ -d "$DATA_DIR" ]; then
        rm -rf "$DATA_DIR"
        echo -e "${GREEN}  ✓ Data removed${NC}"
    else
        echo -e "${YELLOW}  ⚠ No data directory${NC}"
    fi
}

# =============================================================================
# Remove Service
# =============================================================================

remove_service() {
    if [ -f "$SERVICE_FILE" ]; then
        sudo systemctl disable nodepulse --quiet 2>/dev/null || true
        sudo rm -f "$SERVICE_FILE"
        sudo systemctl daemon-reload
        echo -e "${GREEN}  ✓ Service removed${NC}"
    else
        echo -e "${YELLOW}  ⚠ No service file${NC}"
    fi
}

# =============================================================================
# Cleanup
# =============================================================================

cleanup() {
    rm -rf /tmp/ssh-control-* 2>/dev/null || true
    echo -e "${GREEN}  ✓ SSH sockets cleaned${NC}"
}

# =============================================================================
# Execute
# =============================================================================

case $ACTION in
    data)
        echo -e "${YELLOW}Removing data...${NC}"
        stop_service
        remove_data
        ;;

    service)
        echo -e "${YELLOW}Removing service...${NC}"
        stop_service
        remove_service
        ;;

    data+service)
        echo -e "${YELLOW}Removing data and service...${NC}"
        stop_service
        remove_service
        remove_data
        cleanup
        ;;

    everything)
        if [ "$AUTO_MODE" != true ]; then
            echo -e "${RED}WARNING: This removes EVERYTHING!${NC}"
            echo "  - Database and all data"
            echo "  - Systemd service"
            echo "  - Directory: $SCRIPT_DIR"
            echo ""
            read -p "Type 'YES' to confirm: " confirm
            [ "$confirm" != "YES" ] && { echo "Cancelled."; exit 0; }
            echo ""
        fi

        echo -e "${YELLOW}Removing everything...${NC}"
        stop_service
        remove_service
        cleanup

        # Remove directory
        cd /
        rm -rf "$SCRIPT_DIR"
        echo -e "${GREEN}  ✓ Directory removed${NC}"

        echo ""
        echo -e "${GREEN}NodePulse completely removed.${NC}"
        exit 0
        ;;
esac

# =============================================================================
# Done
# =============================================================================

echo ""
echo -e "${GREEN}Done!${NC}"

if [ "$ACTION" = "data" ] || [ "$ACTION" = "data+service" ]; then
    echo ""
    echo -e "${CYAN}To start fresh:${NC}"
    echo "  sudo systemctl start nodepulse"
    echo "  (New database will be created)"
fi

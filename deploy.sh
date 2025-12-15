#!/bin/bash
# Quick deploy to Raspberry Pi (or any Linux target)
# Usage: ./deploy.sh [user@host] [remote_path]
#
# Requires: rsync (via Git Bash, WSL, or native)
# On Windows: Use Git Bash to run this script

set -e

# Default values - adjust these or pass as arguments
TARGET="${1:-pi@raspberrypi}"
REMOTE_PATH="${2:-/opt/nodepulse}"

echo "Deploying to $TARGET:$REMOTE_PATH ..."

# Sync source files only (no node_modules, no .git)
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '*.db' \
  --exclude '*.db-journal' \
  --exclude '.env' \
  --exclude 'deploy.sh' \
  ./ "$TARGET:$REMOTE_PATH/"

echo "Restarting nodepulse service..."
ssh "$TARGET" "cd $REMOTE_PATH && sudo systemctl restart nodepulse 2>/dev/null || npm start &"

echo "Done! Deployed in seconds instead of 20 minutes."

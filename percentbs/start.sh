#!/usr/bin/env bash
set -e
source ~/.zshrc 2>/dev/null || true
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
source ../.venv/bin/activate
PBS_TELEGRAM_TOKEN="$PBS_TELEGRAM_TOKEN" \
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
python3 bot.py >> percentbs.log 2>&1 &
echo $! > percentbs.pid
echo "PercentBS started (PID $(cat percentbs.pid))"

#!/bin/bash
# Run italian_bot in background. Logs to italian_bot.log.
# Usage: ./start_italian_bot.sh
# Stop:  kill $(cat italian_bot.pid)

cd "$(dirname "$0")"

source .venv/bin/activate

export TELEGRAM_TOKEN=$TELEGRAM_TOKEN
export ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
export GROUP_CHAT_ID=$GROUP_CHAT_ID

nohup python3 italian_bot.py >> italian_bot.log 2>&1 &
echo $! > italian_bot.pid
echo "Bot started (PID $(cat italian_bot.pid)). Log: italian_bot.log"

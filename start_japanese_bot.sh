#!/bin/bash
# Run japanese_bot in background. Logs to japanese_bot.log.
# Usage: ./start_japanese_bot.sh
# Stop:  kill $(cat japanese_bot.pid)

cd "$(dirname "$0")"

source .venv/bin/activate

export TELEGRAM_TOKEN=$JP_TELEGRAM_TOKEN
export ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
export GROUP_CHAT_ID=$JP_GROUP_CHAT_ID

nohup python3 japanese_bot.py >> japanese_bot.log 2>&1 &
echo $! > japanese_bot.pid
echo "Bot started (PID $(cat japanese_bot.pid)). Log: japanese_bot.log"

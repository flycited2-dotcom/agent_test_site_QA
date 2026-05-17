#!/usr/bin/env bash
set -e

bot_loop() {
  while true; do
    npm run qa:bot
    code=$?
    echo "[$(date)] qa:bot exited with code ${code}; restarting in 5s"
    sleep 5
  done
}

bot_loop &
bot_pid=$!

cleanup() {
  kill "$bot_pid" 2>/dev/null || true
  wait "$bot_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

bash scripts/agent-loop.sh

#!/bin/bash
# Runs preparation-app locally on http://localhost:3003 and opens it in your browser.
# The server keeps running until you press Ctrl-C here.
cd "$(dirname "$0")"
PORT=${PORT:-3003}

if lsof -ti :$PORT >/dev/null 2>&1; then
  echo "Port $PORT is already serving something — reusing it. (Stop it with: kill \$(lsof -ti :$PORT))"
else
  PORT=$PORT npx tsx src/main.ts &
  SRV=$!
  trap 'kill $SRV 2>/dev/null' EXIT INT TERM
  until curl -s -o /dev/null http://localhost:$PORT/; do
    kill -0 $SRV 2>/dev/null || { echo "Server failed to start"; exit 1; }
    sleep 0.5
  done
fi

open "http://localhost:$PORT"

if [ -n "$SRV" ]; then
  echo "Server running at http://localhost:$PORT — press Ctrl-C to stop."
  wait $SRV
fi

#!/bin/bash
# Runs the Anbaric app locally and opens it in a wide Chrome window (phone demo + What's Happening board).
# The server keeps running until you press Ctrl-C here, whatever happens to the Chrome window.
cd "$(dirname "$0")"
PORT=${PORT:-3000}

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

open -n -a "Google Chrome" --args --app=http://localhost:$PORT --window-size=1440,900 --user-data-dir="$HOME/.voice-app-chrome"

if [ -n "$SRV" ]; then
  echo "Server running at http://localhost:$PORT — press Ctrl-C to stop."
  wait $SRV
fi

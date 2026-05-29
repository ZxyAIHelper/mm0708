#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.demo-runtime"
PID_FILE="$RUNTIME_DIR/demo.pid"
LOG_FILE="$RUNTIME_DIR/demo.log"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3000}"

mkdir -p "$RUNTIME_DIR"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Demo server is already listening on port $PORT"
  echo "Log: $LOG_FILE"
  exit 0
fi

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if kill -0 "$EXISTING_PID" >/dev/null 2>&1; then
    echo "Demo server is already running on pid $EXISTING_PID"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

cd "$ROOT_DIR"

corepack pnpm build >/dev/null

nohup ./node_modules/.bin/next start --hostname "$HOST" --port "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"

sleep 3

if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  echo "Failed to start demo server. Recent log:"
  tail -n 50 "$LOG_FILE" || true
  exit 1
fi

echo "Demo server started"
echo "PID: $SERVER_PID"
echo "URL: http://127.0.0.1:$PORT"
echo "Log: $LOG_FILE"

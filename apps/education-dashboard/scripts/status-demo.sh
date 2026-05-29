#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.demo-runtime"
PID_FILE="$RUNTIME_DIR/demo.pid"
LOG_FILE="$RUNTIME_DIR/demo.log"
PORT="${PORT:-3000}"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" >/dev/null 2>&1; then
    echo "running"
    echo "PID: $PID"
    echo "Log: $LOG_FILE"
    exit 0
  fi
fi

EXISTING_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN | head -n 1 || true)"
if [[ -n "$EXISTING_PID" ]]; then
  echo "running"
  echo "PID: $EXISTING_PID"
  echo "Log: $LOG_FILE"
  exit 0
fi

echo "stopped"

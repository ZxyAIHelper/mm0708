#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.demo-runtime/demo.pid"
PORT="${PORT:-3000}"

if [[ ! -f "$PID_FILE" ]]; then
  EXISTING_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN | head -n 1 || true)"
  if [[ -n "$EXISTING_PID" ]]; then
    kill "$EXISTING_PID"
    echo "Demo server stopped"
    exit 0
  fi
  echo "Demo server is not running"
  exit 0
fi

PID="$(cat "$PID_FILE")"

if kill -0 "$PID" >/dev/null 2>&1; then
  kill "$PID"
  sleep 1
fi

rm -f "$PID_FILE"
echo "Demo server stopped"

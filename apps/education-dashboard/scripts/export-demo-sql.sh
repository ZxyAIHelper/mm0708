#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="$ROOT_DIR/prisma/dev.db"
DUMP_FILE="$ROOT_DIR/prisma/bootstrap-demo.sql"
RAW_DUMP_FILE="$ROOT_DIR/prisma/bootstrap-demo.raw.sql"

if [[ ! -f "$DB_FILE" ]]; then
  echo "Missing $DB_FILE. Run 'pnpm db:push && pnpm db:seed' first." >&2
  exit 1
fi

sqlite3 "$DB_FILE" ".dump" >"$RAW_DUMP_FILE"

awk '
  $0 == "PRAGMA foreign_keys=OFF;" { next }
  $0 == "BEGIN TRANSACTION;" { next }
  $0 == "COMMIT;" { next }
  { print }
' "$RAW_DUMP_FILE" >"$DUMP_FILE"

rm -f "$RAW_DUMP_FILE"

echo "Exported demo SQL to $DUMP_FILE"

#!/usr/bin/env bash
# cleanup.sh — Stop the Vite dev server started by launch.sh.
# Reads PID from evidence/.vite.pid. Evidence directory is preserved.
# Usage: bash cleanup.sh [--dry-run]
# Output: JSON { "killed": bool, "pid": N, "portFree": bool }
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="$SKILL_DIR/evidence"
PID_FILE="$EVIDENCE_DIR/.vite.pid"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

VITE_PID=""
if [[ -f "$PID_FILE" ]]; then
  VITE_PID=$(cat "$PID_FILE")
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "{\"dry_run\": true, \"pid\": \"${VITE_PID:-none}\", \"would_kill\": true}"
  exit 0
fi

KILLED=false
if [[ -n "$VITE_PID" ]]; then
  if kill "$VITE_PID" 2>/dev/null; then
    KILLED=true
    rm -f "$PID_FILE"
  fi
fi

# Wait up to 3s for port to release
PORT_FREE=false
for i in $(seq 1 6); do
  if ! curl -sf http://localhost:1420/ -o /dev/null 2>/dev/null; then
    PORT_FREE=true
    break
  fi
  sleep 0.5
done

echo "{\"killed\": $KILLED, \"pid\": ${VITE_PID:-null}, \"portFree\": $PORT_FREE}"

# Evidence directory is intentionally preserved — never delete it here.
echo "Evidence preserved at: $EVIDENCE_DIR" >&2

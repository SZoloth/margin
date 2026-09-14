#!/usr/bin/env bash
# launch.sh — Start the Margin Vite dev server and wait for readiness.
# Writes the server PID to evidence/.vite.pid for cleanup.sh.
# Usage: bash launch.sh [--port N] [--dry-run]
# Output: JSON { "pid": N, "port": N, "ready": true|false }
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
EVIDENCE_DIR="$SKILL_DIR/evidence"
PORT=1420
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)   PORT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$EVIDENCE_DIR"

if [[ "$DRY_RUN" == "true" ]]; then
  echo '{"dry_run": true, "would_run": "pnpm dev", "port": '"$PORT"'}'
  exit 0
fi

# Kill any existing Vite server on this port so we know the PID we record is ours
existing=$(lsof -ti :"$PORT" 2>/dev/null || true)
if [[ -n "$existing" ]]; then
  echo "WARNING: port $PORT already in use (PID $existing) — killing before launch" >&2
  kill "$existing" 2>/dev/null || true
  sleep 1
fi

cd "$REPO_ROOT"

# Start Vite in background, redirect output to evidence
LOG="$EVIDENCE_DIR/vite-server.log"
pnpm dev --port "$PORT" >"$LOG" 2>&1 &
VITE_PID=$!
echo "$VITE_PID" > "$EVIDENCE_DIR/.vite.pid"

# Wait for readiness (up to 15s, polling every 0.5s)
READY=false
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/" -o /dev/null 2>/dev/null; then
    READY=true
    break
  fi
  sleep 0.5
done

if [[ "$READY" != "true" ]]; then
  echo '{"pid": '"$VITE_PID"', "port": '"$PORT"', "ready": false, "error": "timeout waiting for port '"$PORT"'"}' >&2
  exit 1
fi

echo '{"pid": '"$VITE_PID"', "port": '"$PORT"', "ready": true}'

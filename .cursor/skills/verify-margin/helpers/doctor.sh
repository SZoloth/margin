#!/usr/bin/env bash
# doctor.sh — Read-only health checks for the Margin dev environment.
# Usage: bash doctor.sh [--dry-run]
# Output: JSON { "deps": bool, "tsc": bool, "tests": N, "devServer": bool, "rust": "ok"|"skipped"|"error" }
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ "$DRY_RUN" == "true" ]]; then
  echo '{"dry_run": true, "checks": ["deps", "tsc", "tests", "devServer", "rust"]}'
  exit 0
fi

cd "$REPO_ROOT"

# 1. Dependencies
DEPS=false
[[ -f "node_modules/.bin/vite" ]] && DEPS=true

# 2. TypeScript
TSC=false
if pnpm tsc --noEmit >/dev/null 2>&1; then TSC=true; fi

# 3. Frontend tests — capture pass count
TEST_COUNT=0
TEST_OUTPUT=$(pnpm test:frontend 2>&1 || true)
# Look for "N passed" in the output
if echo "$TEST_OUTPUT" | grep -qE "[0-9]+ passed"; then
  TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -oE "[0-9]+ passed" | grep -oE "^[0-9]+" | tail -1)
fi

# 4. Dev server
DEV_SERVER=false
if curl -sf http://localhost:1420/ -o /dev/null 2>/dev/null; then DEV_SERVER=true; fi

# 5. Rust (optional)
RUST_STATUS="skipped"
if command -v cargo >/dev/null 2>&1; then
  if cargo check --manifest-path src-tauri/Cargo.toml >/dev/null 2>&1; then
    RUST_STATUS="ok"
  else
    RUST_STATUS="error"
  fi
fi

# Output JSON
echo "{\"deps\": $DEPS, \"tsc\": $TSC, \"tests\": $TEST_COUNT, \"devServer\": $DEV_SERVER, \"rust\": \"$RUST_STATUS\"}"

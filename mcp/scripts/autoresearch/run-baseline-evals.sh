#!/usr/bin/env bash
# Run all architecture evals in parallel tmux sessions.
# Results land in /tmp/eval-arch-*.json
# Usage: bash run-baseline-evals.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR="$SCRIPT_DIR"

echo "Starting architecture comparison evals..."
echo "Results → $RESULTS_DIR"

# Architectures to compare: null (falsification) + all main archs
ARCHS=(null a b c d e f)

for arch in "${ARCHS[@]}"; do
  SESSION="eval-arch-${arch}"

  # Kill stale session if it exists
  tmux kill-session -t "$SESSION" 2>/dev/null || true

  echo "Starting arch-${arch} in tmux session '$SESSION'..."
  tmux new-session -d -s "$SESSION" -c "$MCP_DIR" \
    "npx tsx scripts/autoresearch/eval.ts --arch ${arch} 2>/tmp/eval-arch-${arch}.stderr > /tmp/eval-arch-${arch}.json; echo 'DONE arch-${arch}' >> /tmp/eval-done.log"
done

echo ""
echo "All $((${#ARCHS[@]})) eval sessions started."
echo "Monitor with: tmux ls"
echo "Watch progress: tail -f /tmp/eval-arch-<arch>.stderr"
echo "Results: /tmp/eval-arch-<arch>.json"
echo ""
echo "To wait for all: bash $(dirname $0)/collect-results.sh"

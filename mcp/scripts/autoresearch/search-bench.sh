#!/usr/bin/env bash
# Search performance benchmark for autoresearch optimization loop.
# Runs Criterion benchmarks and outputs results.
set -euo pipefail

cd "$(dirname "$0")/../../../src-tauri"

# Run tests first — optimization must not break correctness
echo "=== Running tests ==="
cargo test --quiet 2>&1 | tail -3

# Run benchmarks
echo "=== Running benchmarks ==="
cargo bench --bench search 2>&1

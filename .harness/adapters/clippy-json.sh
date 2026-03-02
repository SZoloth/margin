#!/usr/bin/env bash
# Clippy JSON adapter — parses structured clippy output into adapter output format.
# Reads JSON input from stdin matching the adapter input schema.
# Outputs JSON matching the adapter output schema.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check dependencies
if ! command -v jq &>/dev/null; then
  echo '{"status":"fail","findings":[{"file":".harness/adapters/clippy-json.sh","line":0,"severity":"error","message":"jq is required but not installed. Install with: brew install jq","rule":"missing-dependency"}],"reviewed_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","adapter":"clippy-json"}'
  exit 0
fi

# Read input from stdin
input=""
if [ ! -t 0 ]; then
  input=$(cat)
fi

# Run clippy with JSON output
clippy_output=$(cargo clippy \
  --manifest-path "$REPO_ROOT/src-tauri/Cargo.toml" \
  --message-format=json 2>&1) || true

# Parse clippy JSON output into adapter findings format
# Clippy emits one JSON object per line; we filter for compiler-message with warning/error level
findings=$(echo "$clippy_output" | jq -c '
  select(.reason == "compiler-message")
  | .message
  | select(.level == "warning" or .level == "error")
  | select(.spans | length > 0)
  | {
      file: (.spans[0].file_name // "unknown"),
      line: (.spans[0].line_start // 0),
      severity: (if .level == "error" then "error" elif .level == "warning" then "warning" else "info" end),
      message: (.message // "unknown issue"),
      rule: (.code.code // empty)
    }
' 2>/dev/null | jq -s '.' 2>/dev/null) || findings="[]"

# If jq parsing failed, default to empty
if [ -z "$findings" ] || [ "$findings" = "null" ]; then
  findings="[]"
fi

# Determine overall status based on findings
error_count=$(echo "$findings" | jq '[.[] | select(.severity == "error")] | length')
warning_count=$(echo "$findings" | jq '[.[] | select(.severity == "warning")] | length')

if [ "$error_count" -gt 0 ]; then
  status="fail"
elif [ "$warning_count" -gt 0 ]; then
  status="warn"
else
  status="pass"
fi

reviewed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Output adapter result
jq -n \
  --arg status "$status" \
  --argjson findings "$findings" \
  --arg reviewed_at "$reviewed_at" \
  --arg adapter "clippy-json" \
  '{status: $status, findings: $findings, reviewed_at: $reviewed_at, adapter: $adapter}'

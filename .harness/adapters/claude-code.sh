#!/usr/bin/env bash
# Claude Code review adapter — invokes Claude Code CLI to review a diff.
# Reads JSON input from stdin matching the adapter input schema.
# Outputs JSON matching the adapter output schema.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Dependency checks ---

if ! command -v jq &>/dev/null; then
  echo '{"status":"fail","findings":[{"file":".harness/adapters/claude-code.sh","line":0,"severity":"error","message":"jq is required but not installed. Install with: brew install jq","rule":"missing-dependency"}],"reviewed_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","adapter":"claude-code"}'
  exit 0
fi

if ! command -v claude &>/dev/null; then
  echo '{"status":"fail","findings":[{"file":".harness/adapters/claude-code.sh","line":0,"severity":"error","message":"Claude Code CLI is required but not installed. See: https://claude.ai/code","rule":"missing-dependency"}],"reviewed_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","adapter":"claude-code"}'
  exit 0
fi

# --- Read input from stdin ---

input=""
if [ ! -t 0 ]; then
  input=$(cat)
fi

if [ -z "$input" ]; then
  echo '{"status":"fail","findings":[{"file":".harness/adapters/claude-code.sh","line":0,"severity":"error","message":"No input provided on stdin","rule":"missing-input"}],"reviewed_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","adapter":"claude-code"}'
  exit 0
fi

# Extract fields from input
tier=$(echo "$input" | jq -r '.tier')
diff_hash=$(echo "$input" | jq -r '.diff_hash')
changed_files=$(echo "$input" | jq -r '.changed_files[]')
diff_content=$(echo "$input" | jq -r '.diff')

# --- Build review prompt ---

# Include tier context so the model knows the risk level
tier_context=""
if [ "$tier" = "data-layer" ]; then
  tier_context="This is a DATA-LAYER change (high risk). Pay extra attention to:
- SQLite migration safety (data loss, backwards compatibility)
- Annotation/correction/document CRUD correctness
- Text-anchoring algorithm integrity (4-tier fallback)
- Tauri capability security permissions
- CI workflow bypass risks
"
else
  tier_context="This is a STANDARD change (normal risk). Review for general code quality, correctness, and maintainability."
fi

review_prompt="You are a code review agent for Margin, a Tauri v2 + React desktop app.

${tier_context}

Changed files:
${changed_files}

Review the following diff and output ONLY a JSON object (no markdown fences, no explanation) matching this exact schema:
{
  \"status\": \"pass\" | \"warn\" | \"fail\",
  \"findings\": [
    {
      \"file\": \"path/to/file\",
      \"line\": <number>,
      \"severity\": \"error\" | \"warning\" | \"info\",
      \"message\": \"description of issue\",
      \"rule\": \"rule-name (optional)\"
    }
  ]
}

Rules:
- status is \"fail\" if any finding has severity \"error\"
- status is \"warn\" if any finding has severity \"warning\" but no errors
- status is \"pass\" if no warnings or errors
- Only report genuine issues, not style preferences
- For data-layer changes, be strict about data integrity and security
- For standard changes, focus on bugs and correctness

Diff:
${diff_content}"

# --- Invoke Claude Code CLI ---

# Use --print for non-interactive single-shot output
claude_output=$(echo "$review_prompt" | claude --print 2>/dev/null) || {
  echo '{"status":"warn","findings":[{"file":".harness/adapters/claude-code.sh","line":0,"severity":"warning","message":"Claude Code CLI invocation failed","rule":"adapter-error"}],"reviewed_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","adapter":"claude-code"}'
  exit 0
}

# --- Parse Claude Code output ---

# Extract JSON from the response — Claude may wrap it in markdown fences
json_output=$(echo "$claude_output" | sed -n '/^[[:space:]]*{/,/^[[:space:]]*}/p' | head -1)

# If sed extraction failed, try the whole output
if [ -z "$json_output" ] || ! echo "$json_output" | jq empty 2>/dev/null; then
  # Try extracting from markdown code fences
  json_output=$(echo "$claude_output" | sed -n '/```json/,/```/p' | sed '1d;$d')
fi

# If still no valid JSON, try the raw output
if [ -z "$json_output" ] || ! echo "$json_output" | jq empty 2>/dev/null; then
  json_output="$claude_output"
fi

# Validate the parsed output
if ! echo "$json_output" | jq empty 2>/dev/null; then
  echo '{"status":"warn","findings":[{"file":".harness/adapters/claude-code.sh","line":0,"severity":"warning","message":"Could not parse Claude Code output as JSON","rule":"parse-error"}],"reviewed_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","adapter":"claude-code"}'
  exit 0
fi

# Ensure required fields exist and build well-formed output
status=$(echo "$json_output" | jq -r '.status // "warn"')
findings=$(echo "$json_output" | jq '.findings // []')

# Validate status is one of the allowed values
case "$status" in
  pass|warn|fail) ;;
  *) status="warn" ;;
esac

reviewed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Output adapter result
jq -n \
  --arg status "$status" \
  --argjson findings "$findings" \
  --arg reviewed_at "$reviewed_at" \
  --arg adapter "claude-code" \
  '{status: $status, findings: $findings, reviewed_at: $reviewed_at, adapter: $adapter}'

#!/usr/bin/env bash
# Harness review agent — entry point.
# Classifies diff tier, routes to adapters, caches results.
# Exit 0 on pass/warn, exit 1 on fail.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REVIEWS_DIR="$SCRIPT_DIR/reviews"
ADAPTERS_DIR="$SCRIPT_DIR/adapters"

# --- Parse flags ---

FIX_MODE=false
SKIP_CLAUDE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fix)
      FIX_MODE=true
      shift
      ;;
    --no-claude)
      SKIP_CLAUDE=true
      shift
      ;;
    *)
      echo "Unknown flag: $1"
      echo "Usage: review.sh [--fix] [--no-claude]"
      exit 1
      ;;
  esac
done

# --- Dependency checks ---

if ! command -v jq &>/dev/null; then
  echo "error: jq is required but not installed. Install with: brew install jq"
  exit 1
fi

# SHA-256 helper — macOS may not have sha256sum
sha256() {
  if command -v sha256sum &>/dev/null; then
    sha256sum | cut -d' ' -f1
  elif command -v shasum &>/dev/null; then
    shasum -a 256 | cut -d' ' -f1
  else
    echo "error: neither sha256sum nor shasum found" >&2
    exit 1
  fi
}

# --- Ensure we're in a git repo with a main branch ---

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "error: not inside a git repository"
  exit 1
fi

if ! git rev-parse --verify main &>/dev/null; then
  echo "error: 'main' branch not found"
  exit 1
fi

# --- Compute diff hash ---

diff_content=$(git diff main...HEAD)

if [ -z "$diff_content" ]; then
  echo "No changes detected relative to main. Nothing to review."
  exit 0
fi

diff_hash=$(echo "$diff_content" | sha256)

# --- Check for cached review ---

mkdir -p "$REVIEWS_DIR"
review_file="$REVIEWS_DIR/${diff_hash}.json"

if [ -f "$review_file" ]; then
  echo "Cached review found for diff $diff_hash"
  echo ""
  cat "$review_file"
  cached_status=$(jq -r '.status' "$review_file")
  if [ "$cached_status" = "fail" ]; then
    exit 1
  fi
  exit 0
fi

# --- Get changed files and classify tier ---

changed_files=$(git diff --name-only main...HEAD)

is_data_layer() {
  local data_layer_patterns=(
    "src-tauri/src/db/"
    "src-tauri/src/commands/annotations.rs"
    "src-tauri/src/commands/corrections.rs"
    "src-tauri/src/commands/documents.rs"
    "src/lib/text-anchoring.ts"
    "src-tauri/capabilities/"
    ".github/workflows/"
  )
  for pattern in "${data_layer_patterns[@]}"; do
    if echo "$changed_files" | grep -q "$pattern"; then
      return 0
    fi
  done
  return 1
}

if is_data_layer; then
  tier="data-layer"
else
  tier="standard"
fi

echo "Review: diff_hash=${diff_hash:0:12}... tier=$tier"
echo "Changed files:"
echo "$changed_files" | sed 's/^/  /'
echo ""

# --- Check if backend files changed (to decide whether to run clippy) ---

has_backend_changes() {
  echo "$changed_files" | grep -q "^src-tauri/" || echo "$changed_files" | grep -q "^Cargo"
}

# --- Build adapter input ---

adapter_input=$(jq -n \
  --arg diff "$diff_content" \
  --arg tier "$tier" \
  --arg diff_hash "$diff_hash" \
  --argjson changed_files "$(echo "$changed_files" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  '{diff: $diff, tier: $tier, changed_files: $changed_files, diff_hash: $diff_hash}')

# --- Run adapters ---

overall_status="pass"
all_findings="[]"
adapters_run=()

# Clippy adapter — runs for any backend changes
if has_backend_changes; then
  echo "Running clippy-json adapter..."
  if [ -x "$ADAPTERS_DIR/clippy-json.sh" ]; then
    clippy_result=$(echo "$adapter_input" | "$ADAPTERS_DIR/clippy-json.sh") || true

    if [ -n "$clippy_result" ] && echo "$clippy_result" | jq empty 2>/dev/null; then
      adapter_status=$(echo "$clippy_result" | jq -r '.status')
      adapter_findings=$(echo "$clippy_result" | jq '.findings')
      adapters_run+=("clippy-json")

      # Merge findings
      all_findings=$(echo "$all_findings" "$adapter_findings" | jq -s '.[0] + .[1]')

      # Escalate overall status
      if [ "$adapter_status" = "fail" ]; then
        overall_status="fail"
      elif [ "$adapter_status" = "warn" ] && [ "$overall_status" != "fail" ]; then
        overall_status="warn"
      fi

      echo "  clippy-json: $adapter_status ($(echo "$adapter_findings" | jq 'length') findings)"
    else
      echo "  clippy-json: failed to parse output, skipping"
    fi
  else
    echo "  clippy-json adapter not found or not executable, skipping"
  fi
else
  echo "No backend changes detected, skipping clippy adapter."
fi

# Claude Code adapter — runs when available and not skipped
if [ "$SKIP_CLAUDE" = false ] && [ -x "$ADAPTERS_DIR/claude-code.sh" ] && command -v claude &>/dev/null; then
  echo "Running claude-code adapter..."
  claude_result=$(echo "$adapter_input" | "$ADAPTERS_DIR/claude-code.sh") || true

  if [ -n "$claude_result" ] && echo "$claude_result" | jq empty 2>/dev/null; then
    adapter_status=$(echo "$claude_result" | jq -r '.status')
    adapter_findings=$(echo "$claude_result" | jq '.findings')
    adapters_run+=("claude-code")

    # Merge findings
    all_findings=$(echo "$all_findings" "$adapter_findings" | jq -s '.[0] + .[1]')

    # Escalate overall status
    if [ "$adapter_status" = "fail" ]; then
      overall_status="fail"
    elif [ "$adapter_status" = "warn" ] && [ "$overall_status" != "fail" ]; then
      overall_status="warn"
    fi

    echo "  claude-code: $adapter_status ($(echo "$adapter_findings" | jq 'length') findings)"
  else
    echo "  claude-code: failed to parse output, skipping"
  fi
elif [ "$SKIP_CLAUDE" = true ]; then
  echo "Claude Code adapter skipped (--no-claude)."
else
  echo "Claude Code adapter not available, skipping."
fi

# --- Lint-only remediation (--fix) ---

if [ "$FIX_MODE" = true ]; then
  echo ""
  echo "--- Remediation mode (--fix) ---"

  # Determine which files are data-layer (remediation is restricted for these)
  data_layer_files=""
  data_layer_patterns=(
    "src-tauri/src/db/"
    "src-tauri/src/commands/annotations.rs"
    "src-tauri/src/commands/corrections.rs"
    "src-tauri/src/commands/documents.rs"
    "src/lib/text-anchoring.ts"
    "src-tauri/capabilities/"
    ".github/workflows/"
  )
  for f in $changed_files; do
    for pattern in "${data_layer_patterns[@]}"; do
      if echo "$f" | grep -q "$pattern"; then
        data_layer_files="$data_layer_files $f"
        break
      fi
    done
  done

  if [ -n "$data_layer_files" ]; then
    echo "  WARNING: Data-layer files changed — remediation limited to lint-only fixes."
    echo "  Data-layer files:$data_layer_files"
    echo "  NEVER auto-fixed: business logic, migrations, text-anchoring, security permissions."
  fi

  fixed_something=false

  # Clippy auto-fix (only lint-level, not data-layer logic)
  if has_backend_changes; then
    echo "  Running cargo clippy --fix..."
    if cargo clippy --fix \
      --manifest-path "$REPO_ROOT/src-tauri/Cargo.toml" \
      --allow-dirty \
      --allow-staged 2>/dev/null; then
      # Check if anything actually changed
      if [ -n "$(git diff --name-only)" ]; then
        echo "  Clippy auto-fixed files:"
        git diff --name-only | sed 's/^/    /'
        fixed_something=true
      else
        echo "  No clippy auto-fixes applied."
      fi
    else
      echo "  cargo clippy --fix failed, skipping."
    fi
  fi

  # TypeScript lint fixes (if eslint is configured)
  has_frontend_changes() {
    echo "$changed_files" | grep -q "^src/" || echo "$changed_files" | grep -q "\.tsx\?$"
  }

  if has_frontend_changes; then
    if command -v pnpm &>/dev/null && [ -f "$REPO_ROOT/.eslintrc.json" ] || [ -f "$REPO_ROOT/eslint.config.js" ] || [ -f "$REPO_ROOT/eslint.config.mjs" ]; then
      echo "  Running eslint --fix on changed frontend files..."
      frontend_files=$(echo "$changed_files" | grep -E '\.(ts|tsx)$' || true)
      if [ -n "$frontend_files" ]; then
        # Filter out data-layer files from auto-fix
        safe_files=""
        for f in $frontend_files; do
          is_data=false
          for pattern in "${data_layer_patterns[@]}"; do
            if echo "$f" | grep -q "$pattern"; then
              is_data=true
              break
            fi
          done
          if [ "$is_data" = false ]; then
            safe_files="$safe_files $f"
          fi
        done

        if [ -n "$safe_files" ]; then
          cd "$REPO_ROOT"
          # shellcheck disable=SC2086
          if pnpm eslint --fix $safe_files 2>/dev/null; then
            if [ -n "$(git diff --name-only)" ]; then
              echo "  ESLint auto-fixed files:"
              git diff --name-only | sed 's/^/    /'
              fixed_something=true
            else
              echo "  No ESLint auto-fixes applied."
            fi
          else
            echo "  ESLint --fix had errors (some fixes may have been applied)."
          fi
        else
          echo "  All changed TypeScript files are data-layer, skipping ESLint auto-fix."
        fi
      else
        echo "  No TypeScript files in changeset."
      fi
    else
      echo "  ESLint not configured, skipping TypeScript auto-fix."
    fi
  fi

  if [ "$fixed_something" = true ]; then
    echo ""
    echo "  Remediation applied. Review the changes with: git diff"
  else
    echo ""
    echo "  No auto-fixes were applied."
  fi
fi

# --- Store review result ---

reviewed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
adapters_str=$(printf '%s\n' "${adapters_run[@]:-none}" | jq -R -s 'split("\n") | map(select(length > 0))')

review_result=$(jq -n \
  --arg status "$overall_status" \
  --argjson findings "$all_findings" \
  --arg reviewed_at "$reviewed_at" \
  --arg tier "$tier" \
  --arg diff_hash "$diff_hash" \
  --argjson adapters "$adapters_str" \
  '{status: $status, findings: $findings, reviewed_at: $reviewed_at, tier: $tier, diff_hash: $diff_hash, adapters: $adapters}')

echo "$review_result" > "$review_file"

# --- Print summary ---

echo ""
echo "========================================="
echo "Review complete: $overall_status"
echo "  Tier:     $tier"
echo "  Findings: $(echo "$all_findings" | jq 'length')"
echo "  Errors:   $(echo "$all_findings" | jq '[.[] | select(.severity == "error")] | length')"
echo "  Warnings: $(echo "$all_findings" | jq '[.[] | select(.severity == "warning")] | length')"
echo "  Cached:   $review_file"
echo "========================================="

if [ "$overall_status" = "fail" ]; then
  exit 1
fi
exit 0

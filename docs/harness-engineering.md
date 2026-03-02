# Harness Engineering — Margin

Architecture document for automated risk classification and review gating, scoped to a solo-dev Tauri desktop app.

**Status:** Phase 1 (architecture + gap tracking)
**Last updated:** 2026-03-02

---

## 1. Overview

Harness engineering applies structured risk classification and evidence-based review gates to code changes. For Margin — an 87-file Tauri desktop app with a ~4 min CI — this means:

- **Prevent silent data-loss regressions** in SQLite migrations and text-anchoring (the 4-tier fallback algorithm that resolves highlight positions after document edits).
- **Give AI agents a machine-readable contract** so Claude Code, Codex, and future agents know which files demand extra scrutiny.
- **Ratchet coverage via gap tracking** — every production bug that escapes gets logged, a failing test gets written, and a weekly audit ensures the test still passes.

### Why not the full harness pattern?

A 4-tier, 5-job DAG was evaluated and rejected. It would be slower (5x macOS runner setup), costlier, and the maintenance burden of a `harness.json` manifest exceeds its value for a solo-dev project. Instead: 2 tiers by convention, Linux/macOS CI split, local review agent, gap tracking ratchet.

---

## 2. Two-tier risk classification (convention-over-config)

No `harness.json` manifest to rot. Risk is derived from path conventions.

### Data-layer (high risk)

| Path pattern | Rationale |
|---|---|
| `src-tauri/src/db/**` | Migrations, data integrity |
| `src-tauri/src/commands/annotations.rs` | Annotation CRUD, data mutation |
| `src-tauri/src/commands/corrections.rs` | Correction CRUD, data mutation |
| `src-tauri/src/commands/documents.rs` | Document lifecycle, data mutation |
| `src/lib/text-anchoring.ts` | 4-tier fallback algorithm for highlight positioning |
| `src-tauri/capabilities/**` | Tauri v2 security permissions — can grant webview filesystem access |
| `.github/workflows/**` | Can bypass all gates |

### Standard (everything else)

All other frontend (components, hooks, styles, types), Rust code, MCP server, config, docs.

### Classification logic

A shell function checks if any changed file matches data-layer glob patterns:

```bash
is_data_layer() {
  local changed_files="$1"
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
```

No JSON contract to maintain. Add a new Rust command file and it's automatically standard; add it to the explicit list only if it's data-critical.

---

## 3. CI restructuring — Linux/macOS split

Restructure `.github/workflows/ci.yml` from 1 monolithic macOS job to 2 parallel jobs.

### Job 1: `frontend` (runs-on: ubuntu-latest) — 10x cheaper

- `pnpm tsc --noEmit`
- `pnpm build`
- `pnpm test` (Vitest JSON output as evidence artifact)
- `pnpm --filter mcp test` (if MCP files changed)

### Job 2: `backend` (runs-on: macos-15) — required for Tauri/Rust

- `cargo check`
- `cargo clippy -- -D warnings` (JSON output as evidence for data-layer changes)
- `cargo test` (JSON output as evidence for data-layer changes)

No DAG, no gate-decision job, no preflight classifier job. Just 2 parallel jobs. Branch protection requires both to pass.

### Cost math

| Job | Runner | Multiplier | Typical time |
|---|---|---|---|
| `frontend` | ubuntu-latest | 1x | ~90s |
| `backend` | macos-15 | 10x | ~180s |
| **Current** (monolithic) | macos-15 | 10x | ~240s |

Moving frontend checks to Linux saves ~60% of runner cost.

---

## 4. Review agent — local, not CI

Agent-agnostic adapter interface, invoked locally (pre-push hook or manual), not in CI.

### Architecture

```
./harness/review.sh          # Entry point — classifies tier, routes to adapters
./harness/adapters/
  adapter-schema.json         # JSON Schema contract for input/output
  clippy-json.sh              # Parse structured clippy output
  claude-code.sh              # Invoke Claude Code CLI with diff (Phase 4)
```

### Adapter contract (JSON Schema)

**Input:**
```json
{
  "diff": "string (unified diff)",
  "tier": "data-layer | standard",
  "changed_files": ["string"],
  "diff_hash": "string (sha256)"
}
```

**Output:**
```json
{
  "status": "pass | warn | fail",
  "findings": [
    {
      "file": "string",
      "line": "number",
      "severity": "error | warning | info",
      "message": "string",
      "rule": "string (optional)"
    }
  ],
  "reviewed_at": "ISO 8601",
  "adapter": "string"
}
```

### Invocation

```bash
# Manual
./harness/review.sh

# As pre-push hook
# ln -s ../../harness/review.sh .git/hooks/pre-push
```

Shell-script adapters use `curl` + `jq` for API-based agents. No TypeScript runtime required.

---

## 5. SHA/diff discipline

- **Diff-hash dedup:** `git diff main...HEAD | sha256sum` as cache key. Survives rebases — keyed on diff content, not commit SHA.
- **Review state:** stored locally in `.harness/reviews/{diff-hash}.json` using the adapter output format.
- **Staleness:** any new commit changes the diff hash, invalidating previous reviews.

```bash
diff_hash() {
  git diff main...HEAD | sha256sum | cut -d' ' -f1
}
```

---

## 6. Evidence collection (Tauri-adapted)

No browser automation possible (Tauri webview, not a browser tab). Evidence types:

| Evidence | Source | When |
|---|---|---|
| Vitest JSON | `pnpm test --reporter=json` | All frontend changes |
| Cargo test output | `cargo test` | All backend changes |
| Clippy JSON findings | `cargo clippy --message-format=json` | Data-layer changes |
| Migration dry-run | In-memory SQLite test pattern | Migration changes |
| Text-anchoring regression | Dedicated test fixtures for 4-tier fallback | `text-anchoring.ts` changes |

Evidence artifacts are stored in `.harness/evidence/` locally and uploaded as CI artifacts in the GitHub Actions jobs.

---

## 7. Gap tracking ratchet

The highest-value, lowest-cost piece.

### Format

`.harness/gaps.jsonl` — one JSON object per line:

```json
{
  "id": "GAP-001",
  "date": "2026-03-02",
  "description": "Highlights lost after document edit",
  "root_cause": "Text-anchoring exact match failed, context fallback had off-by-one",
  "escaped_tier": "data-layer",
  "commit_introduced": "abc1234",
  "commit_fixed": "def5678",
  "test_added": "src/lib/__tests__/text-anchoring.test.ts:regression-gap-001",
  "status": "closed"
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID, format `GAP-NNN` |
| `date` | string | ISO date when bug was discovered |
| `description` | string | What happened |
| `root_cause` | string | Why it happened |
| `escaped_tier` | string | `data-layer` or `standard` |
| `commit_introduced` | string | Commit that introduced the bug (if known) |
| `commit_fixed` | string | Commit that fixed it (empty if open) |
| `test_added` | string | Test file:description reference (empty if open) |
| `status` | string | `open` or `closed` |

### Workflow

1. Bug found → gap entry added with status `open`
2. Failing test written (aligns with `CLAUDE.md`: "write a failing test FIRST, then fix")
3. Bug fixed → `commit_fixed` and `test_added` populated
4. Status set to `closed`
5. Weekly audit validates: all closed gaps have `test_added`, referenced tests exist and pass

### Audit script

`.harness/scripts/audit-gaps.mjs` validates:

- All entries parse as valid JSON with required fields
- All `closed` entries have non-empty `test_added` and `commit_fixed`
- Referenced test files exist on disk
- No duplicate IDs
- IDs follow `GAP-NNN` format

---

## 8. Remediation — lint-only scope

If enabled, the remediation agent can only auto-fix:

- **Clippy auto-fixable warnings** (`cargo clippy --fix`)
- **TypeScript strict mode errors** where fix is mechanical (missing return types, unused imports)

Never auto-fix:

- Business logic
- Migrations
- Text-anchoring algorithm
- Anything in data-layer files beyond lint

---

## 9. Edge cases

| Edge case | Resolution |
|---|---|
| Files matching no pattern | Default to "standard" tier |
| Dependency-only changes (Cargo.lock, pnpm-lock.yaml) | Always run full checks — supply chain risk |
| Tauri capabilities | Classified as data-layer (security-critical) |
| CI workflow changes | Classified as data-layer (can bypass all gates) |
| Harness files themselves | Standard tier — they're just scripts, branch protection is the real gate |
| Multi-tier commits | Highest tier wins (most real commits span tiers) |
| Review agent failure | Local-only, so no CI impact. Fail-open with warning |
| Force push / rebase | Diff-hash dedup handles this (diff content, not SHA) |
| Gap tracking file renames | Weekly audit catches broken test references |
| Release workflow (tag push) | Harness doesn't apply — `release.yml` is separate, tags only fire after main is clean |
| MCP workspace package | Frontend job routes MCP tests via `pnpm --filter mcp test` |
| macOS runner costs | Minimized — only Rust checks on macOS, frontend on Linux |

---

## 10. Implementation phases

### Phase 1: Architecture doc + gap tracking ← current

- [x] Write `docs/harness-engineering.md`
- [x] Create `.harness/gaps.jsonl` (empty)
- [x] Create `.harness/scripts/audit-gaps.mjs` (validates gap entries)
- [x] Create `.harness/reviews/` and `.harness/evidence/` directories

### Phase 2: CI split

- [ ] Refactor `.github/workflows/ci.yml` into 2-job Linux/macOS parallel structure
- [ ] Add JSON evidence output for test results
- [ ] Update branch protection to require both jobs

### Phase 3: Local review agent

- [ ] Create `.harness/review.sh` entry point
- [ ] Create `.harness/adapters/clippy-json.sh` (bootstrap adapter)
- [ ] Create `.harness/adapters/adapter-schema.json` (contract)
- [ ] Optional: wire as pre-push hook

### Phase 4: Claude Code adapter + remediation

- [ ] Create `.harness/adapters/claude-code.sh`
- [ ] Add lint-only auto-fix capability

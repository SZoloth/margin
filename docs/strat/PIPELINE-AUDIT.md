# Pipeline Audit: Feedback → Synthesis → Rules → Enforcement

**Date:** 2026-03-03 **Scope:** Repo-invariant architecture. Describes the pipeline design and its structural gaps — not a live snapshot of `~/.claude` or `~/.margin` state. File paths reference where artifacts *should* live by design; verify against actual state before acting on recommendations.

**Related docs:** [product-strategy.md](./product-strategy.md) · [technical-strategy.md](./technical-strategy.md)

## The Architecture (as-built)

```
                        MARGIN APP (margin.db)
                        ──────────────────────
  Highlight text ──► corrections table ──► margin_get_voice_signals
  Create note         (polarity, type)        (requires polarity != NULL)
  MCP create_correction                              │
                                                     ▼
                                              SYNTHESIS (manual)
                                              Claude analyzes patterns
                                                     │
                                                     ▼
                                          margin_create_writing_rule
                                          writing_rules table (DB)
                                                     │
                                        ┌────────────┴────────────┐
                                        ▼                         ▼
                              writing-rules.md          writing_guard.py
                           (voice + corrections       (kill-words + slop)
                            + synthesized rules)
                                        │                         │
                           ┌────────────┤                         │
                           ▼            ▼                         ▼
                    /writing-voice   /writing-           PreToolUse hook
                       skill        quality-gate          on .md/.txt
                                       skill
                                        │
                                        ▼
                              references/ (MANUALLY MAINTAINED)
                              KILL_WORDS.md, AI_TELLS.md,
                              STYLE_GUIDE.md, VOICE_ENGINE.md,
                              VOICE_EXEMPLARS.md, etc.
                              ← never generated from Margin DB

  ═══════════════════════ DISCONNECTED SYSTEMS ═══════════════════════

  word_guard.py ─── hardcoded single banned word ─── never syncs with anything

  ~/.claude/rules/editorial.md ─── glob-loaded on **/*.md, **/*.mdx
       ↕ content duplicated in ~/.claude/CLAUDE.md (global, always loaded)
       ↕ overlaps with writing-rules.md (loaded on skill invocation only)
       = same rules, three loading paths, three maintenance surfaces

  ~/.claude/memory/rules/rules.json ─── learning loop (diary→reflect→curate)
       ↕ syncs with CLAUDE.md only ─── never touches Margin DB

  voice-corpus/ ─── 168k iMessage analysis → voice calibration
       ↕ voice-eval.md scorecard exists but was never filled in
       = pipeline built but never validated
```

## Disconnects Found

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Kill-words enforcement is inert | CRITICAL | open |
| 2 | `word_guard.py` is completely siloed | P2 | open |
| 3 | Two parallel rule systems that never sync | P2 | open |
| 4 | `synthesized_at` is meaningless for MCP synthesis | P2 | open |
| 5 | Unclassified corrections pollute the profile | P2 | open |
| 6 | MCP resource returns incomplete view | P3 | open |
| 7 | `reviewed_at` has no write path on the MCP surface | P3 | open |
| 8 | Dual artifact generators increase drift risk | P2 | open |
| 9 | Synthesis completion is not transactional | P1 | fixed |
| 10 | writing-quality-gate reference files are manually maintained islands | P2 | open |
| 11 | Same editorial rules load through three separate paths | P2 | open |
| 12 | Voice eval was never validated | P2 | open |
| 13 | `writing_guard.py` slop patterns are nearly empty | P1 | open |
| — | MCP dropped `register` metadata in common rule read path | P1 | fixed |
| — | Annotations cleared on persistence failure | P1 | fixed |

### §1. Kill-words enforcement is inert (CRITICAL)

`writing_guard.py` is auto-generated but its `KILL_WORDS = []` — zero rules in the DB have `category = 'kill-words'` AND `severity = 'must-fix'`. The `KILL_WORDS.md` reference file (50+ words) exists in `~/.claude/skills/writing-quality-gate/references/` but is never seeded into the database. The guard is a no-op.

### §2. `word_guard.py` is completely siloed

Hardcoded hook blocking a single banned word. Not connected to Margin's DB, not auto-generated, not updated by any pipeline. Redundant with what `writing_guard.py` should be doing.

### §3. Two parallel rule systems that never sync

| System | Source | Updates | Covers |
| --- | --- | --- | --- |
| Margin DB → `writing-rules.md` | Corrections + synthesis | On export | Writing voice, examples, rules |
| `rules.json` → CLAUDE.md | Diary → reflect → curate | Weekly launchd | Code style, workflow, editorial |

The learning loop finds editorial patterns in diary entries but never writes them to Margin's `writing_rules` table. Margin's rules never flow into `rules.json`. Two independent rule stores with overlapping editorial concerns.

### §4. `synthesized_at` is meaningless for MCP synthesis

The `synthesized_at` column on corrections only gets set by the Tauri export path (`export_corrections_json`). The MCP tools (`margin_get_corrections`, `margin_get_voice_signals`) ignore it entirely. Every synthesis run re-reads the full correction history with no "already processed" boundary.

### §5. Unclassified corrections pollute the profile

`autoExportWritingProfile()` exports ALL corrections regardless of polarity. Corrections without polarity set end up in an "Unclassified" section of `writing-rules.md`, degrading signal quality. Meanwhile, `getVoiceSignals` correctly filters for polarity != NULL — so the synthesis query is stricter than the export.

### §6. MCP resource returns incomplete view

`margin://writing-rules` returns rules-only markdown (no corrections, no voice samples). If Claude reads the resource instead of loading `writing-rules.md` via the skill, it gets an incomplete picture. Two different views of the same data with no indication which to use.

### §7. `reviewed_at` has no write path on the MCP surface

The Rust migrations added `reviewed_at` to writing_rules. The Tauri frontend can write it (via `tauri-commands.ts` and `RulesTab.tsx`), but the MCP server never sets it. Agents synthesizing rules via MCP can't mark them reviewed — the column is dead on that surface specifically.

### §8. Dual artifact generators increase drift risk

Both the Rust path (`export_writing_rules` in Tauri) and the MCP path (`autoExportWritingProfile`) independently generate `writing-rules.md` and `writing_guard.py`. Duplicated formatting logic means the two outputs can diverge silently — same DB, different rendering, no cross-check.

### §9. Synthesis completion is not transactional — FIXED

~~`export_corrections_json` marks corrections as `synthesized_at` before the resulting rules are guaranteed persisted.~~ Fixed: `export_corrections_json` now only exports without marking. A separate `mark_corrections_synthesized` command (Tauri + MCP) is called explicitly after rules are confirmed created. If synthesis fails, corrections remain unsynthesized and are re-exported on the next run. Guarded by `export_does_not_mark_synthesized`, `export_without_mark_keeps_corrections_reexportable`, and MCP `failed synthesis leaves corrections re-exportable` tests.

### §10. writing-quality-gate reference files are manually maintained islands

`KILL_WORDS.md`, `AI_TELLS.md`, `STYLE_GUIDE.md`, `VOICE_ENGINE.md`, `VOICE_EXEMPLARS.md`, and 7 other reference files in `~/.claude/skills/writing-quality-gate/references/` are hand-curated. They are never generated from or synced with Margin corrections. New corrections flow into `writing-rules.md` via export, but NOT into these reference files. The reference library and the Margin DB are two independent rule stores that happen to cover the same concerns.

### §11. Same editorial rules load through three separate paths

| Path | When loaded | Maintained by |
| --- | --- | --- |
| `~/.claude/CLAUDE.md` (global, editorial rules inline) | Every session, always | Manual edit |
| `~/.claude/rules/editorial.md` | Auto-loaded on `**/*.md, **/*.mdx` files | Manual edit |
| `~/.margin/writing-rules.md` | Only when `/writing-voice` skill is invoked | Margin export |

The first two are manually maintained copies of each other. The third is Margin-generated but covers much of the same ground ("never modify quotes", "requirements in user language", paragraph structure, AI tells). No sync mechanism between any of them. They will drift — and already have in minor wording.

### §12. Voice eval was never validated

`~/.claude/voice-corpus/voice-eval.md` contains a full test suite (10 rewrite prompts, 10 generation prompts, 5 detection prompts) with a scoring rubric. The scorecard is completely empty. The voice calibration pipeline (168k iMessages → statistical profile → writing-rules.md) was built and integrated, but never closed with validation. There's no evidence the profile actually improves output quality.

### §13. `writing_guard.py` slop patterns are nearly empty

Beyond the empty kill words list, the auto-generated hook only contains 1 slop pattern (a single before/after example sentence). The `writing-rules.md` file has dozens of rules with before/after examples that could be converted to regex patterns but aren't. The guard checks almost nothing.

## Redundancy Map

| Concern | Where it lives | Redundant? |
| --- | --- | --- |
| "Don't use AI tells" | `editorial.md`, CLAUDE.md, `rules.json` (writing-ai-tells), Margin DB (ai-slop category), `KILL_WORDS.md` ref, `AI_TELLS.md` ref | **6 places**, only Margin DB feeds the guard |
| Kill words | `word_guard.py` (1 word), `writing_guard.py` (empty), `KILL_WORDS.md` (50+ words) | **3 places**, none actually enforcing |
| "Never modify quotes" | `CLAUDE.md`, `editorial.md`, `writing-rules.md` | **3 places**, no sync |
| "Requirements in user language" | `CLAUDE.md`, `editorial.md`, `writing-rules.md` | **3 places**, no sync |
| "Copy editor pass" | `CLAUDE.md`, `editorial.md` (explicit), `writing-rules.md` (critique pass rule) | **3 places**, slightly different wording |
| "Sentence case for bullets" | `CLAUDE.md`, `editorial.md` | **2 places** |
| Editorial voice (general) | `writing-rules.md` (generated), `editorial.md` (manual), `rules.json` editorial rules | **3 places**, no sync |
| Profile/hook generation | Rust `export_writing_rules`, MCP `autoExportWritingProfile` | **2 generators**, same output files, no parity test |

## Recommendations

### 1. Seed kill-words into the DB

Run a one-time import from `KILL_WORDS.md` into `writing_rules` with `category = 'kill-words'`, `severity = 'must-fix'`. Then `writing_guard.py` actually works.

### 2. Retire `word_guard.py`

Merge its banned word into the DB as a kill-word. One guard, one source of truth.

### 3. Decide on rule system unification

Either:

- **(a)** Make `rules.json` editorial rules flow into Margin DB (learning loop writes to Margin), or
- **(b)** Accept the split: Margin owns writing voice, `rules.json` owns meta-workflow rules. Remove the editorial overlap from `rules.json`.

### 4. Filter unclassified corrections from profile export

Only export corrections with polarity set. Unclassified ones are noise until tagged.

### 5. Mark corrections as synthesized via MCP

Add a `margin_mark_synthesized` tool or update `synthesized_at` when `margin_create_writing_rule` runs, so synthesis runs can be incremental.

### 6. Deprecate the MCP resource

Or make it return the full profile. Having two different markdown views is confusing.

### 7. Consolidate editorial rule copies without creating enforcement holes

`editorial.md` is glob-scoped to `**/*.md, **/*.mdx` only. The duplicate in `~/.claude/CLAUDE.md` (global) is the only copy that covers non-markdown prose (e.g. writing in `.txt`, `.html`, commit messages, PR descriptions). Removing the CLAUDE.md copy without replacing coverage would weaken baseline enforcement.

Options:

- **(a)** Widen `editorial.md` globs to include all prose extensions (`.txt`, `.html`, `.htm`, `.mdx`), then remove the CLAUDE.md duplicate
- **(b)** Keep a minimal set of editorial rules in CLAUDE.md (the 3-4 that matter for non-markdown contexts) and make `editorial.md` the comprehensive version — accept two copies but with clear scope split
- **(c)** Auto-generate `editorial.md` from Margin's rules table on export, widen globs, then remove CLAUDE.md copy

In all cases, deduplicate the content between `editorial.md` and `writing-rules.md` — they cover the same rules with different wording and no sync.

### 8. Run the voice eval

`voice-eval.md` has a complete test suite. Score it. If the profile doesn't meaningfully improve output (target: 4.0+ on "sounds like me", +1.0 delta), the voice calibration section is dead weight in every `/writing-voice` invocation.

### 9. Populate slop patterns from writing rules

The `writing_guard.py` export should convert more of the must-fix rules from `writing-rules.md` into regex patterns for the hook. Right now 1 pattern is enforced; there are dozens of rules with concrete before/after examples that could be machine-checked.

### 10. Decide what the reference files are for

`KILL_WORDS.md`, `AI_TELLS.md`, `STYLE_GUIDE.md`, etc. are manually curated reference docs that `/writing-quality-gate` loads on demand. They overlap with but are not generated from Margin's corrections or rules. Options:

- **(a)** Generate them from Margin DB on export (single source of truth)
- **(b)** Accept they're curated supplements and add a sync-check to `/curate` so they don't contradict Margin's rules
- **(c)** Fold their unique content into Margin's rules table and delete them

### 11. Add a parity golden test for Rust vs MCP export

Both generators should produce identical output for the same fixture data. A golden test comparing Rust `export_writing_rules` output against MCP `autoExportWritingProfile` output for the same DB state would catch drift before it ships.

### 12. Make synthesis transactional

Don't mark corrections as `synthesized_at` until the resulting rules are confirmed persisted. Either:

- **(a)** Move the `synthesized_at` update to after `margin_create_writing_rule` succeeds, or
- **(b)** Add a synthesis session token so incomplete rounds can be detected and rolled back

## Test coverage (what's guarded)

Tests that exist and guard against regressions in this pipeline:

| Area | Location | Covers |
| --- | --- | --- |
| End-to-end pipeline | `mcp/src/__tests__/pipeline-integration.test.ts` | Feedback → correction → rule → profile/hook export; delete cascades; duplicate merge; backfill exclusion |
| Corrections + synthesis state | `src-tauri/src/commands/corrections.rs` tests | Backfill sentinel exclusion; export/mark synthesized; unsynthesized reset |
| Rule generation + profile | `src-tauri/src/commands/writing_rules.rs` tests | Profile composition; register grouping; no duplicate voice bullets; hook fail-open |
| Rule CRUD + export | `mcp/src/__tests__/writing-rules.test.ts` | Create/update/delete; duplicate merge; register propagation; profile sections; guard constraints |
| UI synthesis handoff | `src/components/settings/__tests__/StyleMemorySection.test.tsx` | Synthesis CTA clears after export |
| UI rule mutations | `src/components/style-memory/__tests__/RulesTab.test.tsx` | Auto-export on rule update/delete |
| Export safety | `src/lib/__tests__/export-clear-policy.test.ts` | No annotation clearing on persistence failure |

### Not tested

- Rust vs MCP export parity (no golden test)
- Synthesis transaction safety (mark-before-persist gap)
- Kill-word population → guard enforcement (empty list, so no meaningful test)
- `writing-rules.md` consumed by `/writing-voice` or `/writing-quality-gate` (skills are untested consumers)
- `editorial.md` / CLAUDE.md drift against `writing-rules.md`

## Previously fixed

Issues discovered and resolved during earlier audits:

- **MCP dropped** `register` **metadata in common rule read path** — voice-calibration rules were treated as universal, collapsing casual/professional scoping. Fixed in `mcp/src/tools/writing-rules.ts`, guarded by `writing-rules.test.ts` (`includes register field in unfiltered rule reads`).
- **Annotations cleared on persistence failure** — export cleared annotations even when correction persistence failed. Now retention-first: annotations kept for retry on failure. Guarded by `export-clear-policy.test.ts`.

## What's actually working

For context — not everything is broken:

- `/writing-voice` **+** `writing-rules.md` is the strongest link. The Margin → export → writing-rules.md → skill loading path works end-to-end. Rules are well-structured with signal counts, before/after examples, and writing-type scoping.
- **Voice calibration** (statistical fingerprint from 168k messages) is solid data and correctly integrated into writing-rules.md.
- `/writing-quality-gate` has deep, thoughtful reference material with multiple review modes. It's powerful when explicitly invoked.
- **The corrections → synthesis → rules flow inside Margin** works. The disconnects are at the boundaries — where Margin's rules meet Claude Code's enforcement mechanisms.

---

## Target Architecture (summary)

The detailed vision for Margin's writing pipeline is split across the strategy docs:

- **Product vision, compounding loop, friction tables, case study narrative, metrics (correction rate, graduation):** See [product-strategy.md](./product-strategy.md)
- **Design principles, technical layers (plumbing → friction → closing the loop), platform decision, Claude Code constraint:** See [technical-strategy.md](./technical-strategy.md)

The core idea in one line: **every correction you give makes the next draft better, until you rarely need to give corrections at all.** The system's job is to make itself unnecessary.

The 13 findings above map to the strategy docs' priority and layer structure:
- §1, §2, §8, §9, §13 → Layer 1 plumbing (technical-strategy)
- §3, §4, §5, §10, §11 → rule system unification (both strategy docs)
- §6, §7 → MCP surface gaps (technical-strategy)
- §12 → validation (product-strategy Priority 1)

The existing 129+ tests guard the foundation. The "what's needed by layer" tables live in [technical-strategy.md](./technical-strategy.md).
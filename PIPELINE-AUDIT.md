# Pipeline Audit: Feedback → Synthesis → Rules → Enforcement

**Date:** 2026-03-03 **Scope:** Repo-invariant architecture. Describes the pipeline design and its structural gaps — not a live snapshot of `~/.claude` or `~/.margin` state. File paths reference where artifacts *should* live by design; verify against actual state before acting on recommendations.

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

### 1. Kill-words enforcement is inert (CRITICAL)

`writing_guard.py` is auto-generated but its `KILL_WORDS = []` — zero rules in the DB have `category = 'kill-words'` AND `severity = 'must-fix'`. The `KILL_WORDS.md` reference file (50+ words) exists in `~/.claude/skills/writing-quality-gate/references/` but is never seeded into the database. The guard is a no-op.

### 2. `word_guard.py` is completely siloed

Hardcoded hook blocking a single banned word. Not connected to Margin's DB, not auto-generated, not updated by any pipeline. Redundant with what `writing_guard.py` should be doing.

### 3. Two parallel rule systems that never sync

| System | Source | Updates | Covers |
| --- | --- | --- | --- |
| Margin DB → `writing-rules.md` | Corrections + synthesis | On export | Writing voice, examples, rules |
| `rules.json` → CLAUDE.md | Diary → reflect → curate | Weekly launchd | Code style, workflow, editorial |

The learning loop finds editorial patterns in diary entries but never writes them to Margin's `writing_rules` table. Margin's rules never flow into `rules.json`. Two independent rule stores with overlapping editorial concerns.

### 4. `synthesized_at` is meaningless for MCP synthesis

The `synthesized_at` column on corrections only gets set by the Tauri export path (`export_corrections_json`). The MCP tools (`margin_get_corrections`, `margin_get_voice_signals`) ignore it entirely. Every synthesis run re-reads the full correction history with no "already processed" boundary.

### 5. Unclassified corrections pollute the profile

`autoExportWritingProfile()` exports ALL corrections regardless of polarity. Corrections without polarity set end up in an "Unclassified" section of `writing-rules.md`, degrading signal quality. Meanwhile, `getVoiceSignals` correctly filters for polarity != NULL — so the synthesis query is stricter than the export.

### 6. MCP resource returns incomplete view

`margin://writing-rules` returns rules-only markdown (no corrections, no voice samples). If Claude reads the resource instead of loading `writing-rules.md` via the skill, it gets an incomplete picture. Two different views of the same data with no indication which to use.

### 7. `reviewed_at` has no write path on the MCP surface

The Rust migrations added `reviewed_at` to writing_rules. The Tauri frontend can write it (via `tauri-commands.ts` and `RulesTab.tsx`), but the MCP server never sets it. Agents synthesizing rules via MCP can't mark them reviewed — the column is dead on that surface specifically.

### 8. Dual artifact generators increase drift risk

Both the Rust path (`export_writing_rules` in Tauri) and the MCP path (`autoExportWritingProfile`) independently generate `writing-rules.md` and `writing_guard.py`. Duplicated formatting logic means the two outputs can diverge silently — same DB, different rendering, no cross-check.

### 9. Synthesis completion is not transactional

`export_corrections_json` marks corrections as `synthesized_at` before the resulting rules are guaranteed persisted. A partial or failed synthesis run (e.g. Claude context window fills, user cancels) can move corrections to "archived" state without complete rule creation. Manual recovery exists ("mark unsynthesized") but the happy path has a data-loss window.

### 10. writing-quality-gate reference files are manually maintained islands

`KILL_WORDS.md`, `AI_TELLS.md`, `STYLE_GUIDE.md`, `VOICE_ENGINE.md`, `VOICE_EXEMPLARS.md`, and 7 other reference files in `~/.claude/skills/writing-quality-gate/references/` are hand-curated. They are never generated from or synced with Margin corrections. New corrections flow into `writing-rules.md` via export, but NOT into these reference files. The reference library and the Margin DB are two independent rule stores that happen to cover the same concerns.

### 11. Same editorial rules load through three separate paths

| Path | When loaded | Maintained by |
| --- | --- | --- |
| `~/.claude/CLAUDE.md` (global, editorial rules inline) | Every session, always | Manual edit |
| `~/.claude/rules/editorial.md` | Auto-loaded on `**/*.md, **/*.mdx` files | Manual edit |
| `~/.margin/writing-rules.md` | Only when `/writing-voice` skill is invoked | Margin export |

The first two are manually maintained copies of each other. The third is Margin-generated but covers much of the same ground ("never modify quotes", "requirements in user language", paragraph structure, AI tells). No sync mechanism between any of them. They will drift — and already have in minor wording.

### 12. Voice eval was never validated

`~/.claude/voice-corpus/voice-eval.md` contains a full test suite (10 rewrite prompts, 10 generation prompts, 5 detection prompts) with a scoring rubric. The scorecard is completely empty. The voice calibration pipeline (168k iMessages → statistical profile → writing-rules.md) was built and integrated, but never closed with validation. There's no evidence the profile actually improves output quality.

### 13. `writing_guard.py` slop patterns are nearly empty

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

## Target architecture: compounding returns on feedback

The vision for Margin's writing pipeline isn't "all pipes connected." It's this: **every correction you give makes the next draft better, until you rarely need to give corrections at all.** The system's job is to make itself unnecessary.

Margin exists to solve three problems:

1. Make it easy to review AI-generated content
2. Make it easy to give feedback on that content back to AI
3. Make it so you never have to give the same feedback twice

The fully realized pipeline creates compounding value — the more you use it, the more your AI agent learns your voice for different scenarios, until it can produce content that doesn't need your feedback.

### UX north star: minimum friction between feedback and effect

The distance between "I corrected this" and "the system learned it" should approach zero. Not zero manual steps eventually — zero friction *now*, from the first correction.

**Friction in the current pipeline:**

| Step | What happens | Friction |
| --- | --- | --- |
| 1\. Correct text | Highlight + annotate in Margin | Low (the UX is already good) |
| 2\. Classify correction | Set polarity, writing type | Medium (manual, required for signal quality) |
| 3\. Export corrections | Click export or trigger from Style Memory | Medium (manual batch operation) |
| 4\. Synthesis | Claude analyzes patterns, creates rules | High (manual, requires agent session) |
| 5\. Export profile | `margin export profile` regenerates artifacts | Medium (manual, or auto on rule mutation) |
| 6\. Effect on current doc | Re-generate the draft you're working on | Not connected (correction doesn't fix the doc you're editing) |
| 7\. Effect on future docs | Rules loaded next time `/writing-voice` fires | Automatic (but only if the skill is invoked) |

Steps 2-6 are where friction lives. The ideal collapses them:

| Step | Ideal | Friction |
| --- | --- | --- |
| 1\. Correct text | Highlight + annotate in Margin | Same |
| 2\. Classify | Auto-inferred from document type + correction content | Zero (system infers) |
| 3-5. Learn | Correction persists → rule created/strengthened → artifacts regenerated | Zero (continuous, not batched) |
| 6\. Current doc | The paragraph you corrected is rewritten using the new rule | Zero (immediate) |
| 7\. Future docs | Rules are already propagated; context-aware loading matches rules to medium | Zero (automatic) |

**Context-aware means: the system is smart enough not to apply outreach voice rules to a PRD, or cover letter positioning rules to a text message.** Writing type and register aren't just metadata — they're the routing logic that determines which rules fire in which context. The schema already supports this (`writing_type`, `register` columns). The gap is in loading: the agent needs to detect context and load the right rule subset, not dump the entire profile every time.

### The compounding loop

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    THE FEEDBACK LOOP                          │
  │                                                              │
  │   AI generates     You review in      You correct in         │
  │   a draft      →   Margin         →   Margin             →  │
  │                    (reading UX)       (annotation UX)         │
  │        ▲                                    │                │
  │        │                                    ▼                │
  │        │                    ┌─── immediate ───┐              │
  │        │                    ▼                  ▼              │
  │        │           Current doc gets    Correction persists   │
  │        │           rewritten with      with inferred type    │
  │        │           the correction      + polarity            │
  │        │           applied                    │              │
  │        │                                      ▼              │
  │        │                               Rule created or       │
  │        │                               signal_count++        │
  │        │                               (automatic, not       │
  │        │                                batched)             │
  │        │                                      │              │
  │        │                                      ▼              │
  │        │                               Artifacts regen       │
  │        │                               (profile + hook +     │
  │        │                                editorial rules)     │
  │        │                                      │              │
  │        └──────────────────────────────────────┘              │
  │                                                              │
  │   Next draft is better. Fewer corrections needed.            │
  │   The correction you just gave is already working —          │
  │   on this doc and every future doc of the same type.         │
  └──────────────────────────────────────────────────────────────┘
```

### What "fully realized" looks like

#### Layer 1: Plumbing (fix the disconnects)

This is table stakes — the infrastructure that makes the loop possible. Every disconnect in this audit has a fix:

- **One source of truth.** Margin DB is the only place rules are authored. Everything downstream (`writing-rules.md`, `writing_guard.py`, `editorial.md`) is a generated artifact. No manual rule files. No parallel stores.
- **One generator.** Rust and MCP call the same rendering path. A parity golden test catches drift.
- **One guard hook.** `writing_guard.py` is the sole enforcement hook, covering all prose extensions, populated with the full kill-word and slop-pattern lists from the DB. `word_guard.py` is retired.
- **Transactional synthesis.** `synthesized_at` set only after rules persist. No data-loss window.
- **Only classified corrections in the profile.** Untagged corrections are raw material, not signal.
- **Clean editorial path.** `editorial.md` is auto-generated from Margin, glob-scoped to all prose. CLAUDE.md defers to it. No manual copies, no drift.

The 129+ existing tests already guard the foundation. 7 additional tests close the remaining gaps (parity, transactions, kill-word population, unclassified filtering, editorial generation, voice eval, reference generation).

#### Layer 2: Eliminate friction (make feedback instant and contextual)

The plumbing carries signal. This layer removes every manual step between giving feedback and seeing it take effect.

**Immediate effect on the current document**.When you correct a paragraph in Margin, the correction shouldn't just persist for future drafts — it should fix the document you're looking at. The ideal: you highlight "I'd love to discuss how this connects to Linear's product strategy" and annotate "too pitchy, close with curiosity not a CTA." Margin rewrites that paragraph using the correction, in place, while also persisting the rule for next time. One action, two effects: this doc gets better AND future docs get better.

**Auto-classification from context**.You shouldn't have to manually tag every correction with polarity and writing type. The system should infer: if you're editing a document tagged as `cover-letter`, the correction is a cover-letter correction. If you cross out a word, that's corrective polarity. If you highlight a phrase you like, that's positive polarity. The document's writing type and the gesture you made contain the classification. Manual tagging becomes a fallback, not the default path.

**Continuous synthesis, not batched**.Today, synthesis is a manual step: export corrections, run an agent session, create rules, re-export. In the fully realized system, every correction that persists triggers an incremental check: does this match an existing rule (strengthen it, signal_count++) or is this a new pattern (flag for rule creation)? The common case — "this is the 4th time I've corrected this exact pattern" — should be fully automatic. Novel patterns surface for review but don't block the pipeline.

**Signal counting as confidence**.Every rule has a `signal_count` — the number of times you've given that correction. Tests already verify: `coalesces duplicate create into update and increments signal_count`. Signal count drives enforcement strength automatically:

- 1-2 signals → guidance only (loaded in profile, not in hook)
- 3-5 signals → soft enforcement (hook asks for confirmation)
- 6+ signals → hard enforcement (hook blocks)

You never classify severity manually. Your behavior classifies it. Give the same correction three times, it becomes a soft gate. Give it six times, it becomes a hard gate.

**Context-aware rule loading**.Rules are scoped by `writing_type` (general, cover-letter, outreach, resume, blog, etc.) and `register` (casual, professional, emotional, explaining, logistics). The agent detects which context it's in and loads only the relevant subset. "Enter mid-thought" fires for outreach DMs but not for PRDs. "Never explain a company's business back to them" fires for cover letters but not for blog posts. "Almost never end with periods" fires for text messages but not for professional emails. The system is smart enough to know the difference. Tests already verify the schema supports this: `filters by writing_type`, `groups voice rules by register`. The gap is in the loading path: the agent needs context detection, not a full profile dump.

**Correction decay**.Rules that haven't been triggered or reinforced in 90 days surface for re-evaluation. Your voice evolves — a rule from 6 months ago that you've never re-corrected might be stale. The `reviewed_at` column (already in the schema, tests exist for `mark_reviewed_sets_timestamp`) becomes the mechanism. Rules don't silently expire; they surface for a quick "still relevant?" check.

#### Layer 3: Closing the loop (prove that friction is decreasing)

The system should know if it's getting better — and show you.

**Correction rate as the metric**.The number of corrections per document is the only metric that matters. If the system is working, this number goes down over time, per writing type. Margin already stores corrections with timestamps and document context — the data exists to compute: "For cover letters, the correction rate dropped from 12 per doc (January) to 3 per doc (March)." This is the proof that friction is decreasing. Not "the system has 47 rules" — that's an input metric. "You gave 3 corrections this time instead of 12" — that's the output.

**Override tracking**.When the guard hook fires and the user overrides it (clicks "allow"), that's a signal that the rule is wrong for that context. Track overrides. If a rule is overridden more than it's enforced, it needs context scoping, not removal. A kill word that's correct for cover letters but wrong for technical docs should become a scoped rule, not get deleted. Overrides are feedback too — they refine the routing logic.

**Uncovered pattern detection**.When the user makes a correction that doesn't match any existing rule, that's a new pattern. The system should flag: "This correction doesn't match any rule in the DB — new pattern detected." Over time, the gap between "corrections given" and "rules that exist" should shrink to zero. When it reaches zero for a given writing type, that type is "learned" — the system can write it without feedback.

**The graduation moment**.For any writing type, there's a point where the correction rate is effectively zero — the system has learned enough rules, with enough signal strength, scoped to the right context, that it produces content you don't need to correct. That's graduation. The system should surface when a writing type is approaching graduation: "You haven't corrected a text message in 30 days. Cover letters still average 4 corrections per doc."

#### Layer 4: The product vision (what this means for Margin)

This pipeline is Margin's core differentiator. Not the reading UX (other apps do that). Not the highlighting (other apps do that). The differentiator is: **Margin is the lowest-friction path from "AI wrote this wrong" to "AI never writes it wrong again."**

The product thesis in one sentence: every correction you give should immediately improve the document you're working on, propagate to all future documents of the same type, and never need to be given again.

For the case study, the story is:

1. **Problem:** AI writes generic content. You correct it. You correct the same things again. And again. The feedback is scattered across chat history, your head, ad-hoc prompt instructions that don't persist. None of it compounds.
2. **Insight:** Every correction is training data. The missing piece isn't the AI model — it's the feedback UX. There's no tool that makes it easy to give structured feedback at the point of reading and routes that feedback back to the AI in a way that persists and compounds.
3. **Solution:** Margin captures corrections at the point of reading, in the most natural gesture (highlight + annotate), infers context automatically, synthesizes corrections into persistent rules scoped by writing type and register, and enforces them across every surface where AI writes — immediately on the current document, and automatically on every future document of the same type.
4. **Result:** Correction rate drops over time, per writing type. The system demonstrates compounding returns. Measured in the metric that matters: "how many corrections did I have to give this time?" The goal isn't zero corrections forever — your voice evolves, new writing types emerge. The goal is zero *repeated* corrections. You should never have to tell the system the same thing twice.

### What the test suite already guarantees

The existing 129+ tests form the foundation. They verify:

| Guarantee | Tests |
| --- | --- |
| Corrections persist, order, filter, and exclude backfill | 41 Rust tests on corrections CRUD, polarity, bulk ops |
| Rules create, update, delete, deduplicate, and validate | 25 MCP + 21 Rust tests on writing_rules |
| Duplicate rule synthesis merges (retry-safe) | `coalesces duplicate create into update and increments signal_count` |
| Profile renders voice calibration, corrections, rules in correct order | `unified_profile_*` tests (Rust), `getWritingProfileMarkdown` tests (MCP) |
| Register metadata preserved across all read paths | `includes register field in unfiltered rule reads` |
| Guard hook is valid Python with fail-open, injection-safe | `hook_*` tests (Rust), `getWritingGuardPy` tests (MCP) |
| Kill-words filter to must-fix severity only | `hook_includes_kill_words`, `Includes only must-fix kill-words category` |
| Slop patterns filter to ai-slop with examples only | `hook_includes_slop_patterns`, `Includes only ai-slop category with exampleBefore` |
| Synthesis state tracks correctly (mark/unmark) | `export_and_mark_synthesized_*`, `mark_unsynthesized_*` |
| UI auto-exports after every rule mutation | `auto-exports profile artifacts after rule update/delete` |
| Annotations not cleared on persistence failure | `export-clear-policy` tests |
| Unicode safety across all data flows | `unicode_truncation_does_not_panic`, `Round-trips unicode rule_text correctly` |

### What's needed, by layer

**Layer 1 — Plumbing (fix disconnects):**

| Gap | What to build/test |
| --- | --- |
| Parity golden test | Same fixture DB → Rust and MCP export produce identical output |
| Transactional synthesis | `synthesized_at` NULL if rule persist fails; set only on confirm |
| Kill-word seeding | Import from KILL_WORDS.md into DB; verify guard populates |
| Profile filters unclassified | Corrections with `polarity = NULL` absent from profile |
| Editorial.md generation | Export produces `editorial.md` with all-prose glob header |
| Retire word_guard.py | Merge banned word into DB; delete hook |

**Layer 2 — Eliminate friction (make feedback instant and contextual):**

| Gap | What to build/test |
| --- | --- |
| In-place rewrite | Correction triggers rewrite of the corrected paragraph in the current doc |
| Auto-classification | Polarity + writing type inferred from gesture + document metadata |
| Continuous synthesis | Correction persist triggers incremental rule match/create (not batched) |
| Signal-driven severity | Hook enforcement strength scales with signal_count thresholds |
| Context-aware loading | Agent detects writing type from task, loads scoped rules only |
| Correction decay | Rules not reviewed in 90 days surfaced for re-evaluation |

**Layer 3 — Closing the loop (prove friction is decreasing):**

| Gap | What to build/test |
| --- | --- |
| Correction rate tracking | Corrections per document over time, grouped by writing_type |
| Override tracking | Guard overrides logged; high-override rules surfaced for review |
| Uncovered pattern detection | Corrections not matching existing rules flagged during synthesis |
| Graduation detection | Surface when a writing type has had zero corrections for N days |

**Layer 4 — Product vision (case study evidence):**

| Gap | What to build/test |
| --- | --- |
| Correction rate dashboard | Visual proof that the system compounds (chart: corrections/doc over time, by type) |
| Voice eval scored | Profile achieves 4.0+ "sounds like me" with +1.0 delta |
| Before/after portfolio artifact | "First cover letter: 12 corrections → latest: 2 corrections" |
| Graduation milestone | "Text messages: zero corrections in 30 days — writing type learned" |

- DESIGN PRINCPLES: simplicity, elegance, efficiency, performance, consitency, frictionless
- it should work with the users claude code subscription, ideally
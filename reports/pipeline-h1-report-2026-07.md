# Pipeline Horizon 1 — Execution Report (2026-07-06)

_Companion to [plans/pipeline-strategy-2026-07.md](../plans/pipeline-strategy-2026-07.md) (the audit + full roadmap). This documents what shipped in the first execution pass, merged to main at `7f8edab`._

## What shipped

### 1. Mechanical auto-synthesis removed (`refactor(pipeline)`, 356abc0)
`notes.join("; ")` → must-fix rule was the pipeline's worst accuracy defect, and its `synthesized_at` stamping silently dequeued every correction from real synthesis. Removed from both the Rust command path and the MCP tools. Capture and synthesis are now separate stages; corrections queue for a reviewed LLM synthesis pass (Horizon 2).

### 2. Coaching prompt v2 (`feat(coaching)`, 1bc0838)
- Corrections selection excludes non-feedback notes and positive-polarity signals, and scopes to the requested writing type + general/untyped. Before: the live prompt led with items marked "NOT FEEDBACK, A REQUEST/PROMPT" presented as "your strongest signal."
- Rules selection scopes by type (the `--type` flag previously changed only a label).
- The five hard prohibitions moved from a Go string constant into the DB (`category='prohibition'`, seeded by migration, stable ids in notes). The DB is now the single source of enforcement truth; the constant survives only as a pre-seed fallback.

### 3. Guard v2 (`feat(guard)`, 7d40d88)
- New contract: a rule contributes to the mechanical hook ONLY via a curated `detection_pattern` regex (new column). `example_before` is illustrative, never executable — v1 shipped 103 verbatim past sentences as "regexes" that could never match future prose (~85% of mechanical enforcement was dead weight).
- Ten soft AI-tell families seeded from the humanizer/Wikipedia taxonomy (MIT): copula avoidance, AI vocabulary, significance inflation, aphorism formulas, filler phrases, hedging pileups, chatbot artifacts, inline-header bullets, predicate hyphenation, staccato drama.
- Cluster scoring: published docs block only when ≥2 families co-occur; a single family is advisory. Isolated tells are normal in human prose — co-occurrence is the AI signal.
- Hard single-hit enforcement unchanged where it should be: kill words, prohibition regexes (negative parallelism, kind-of-X), section-heading rules, em-dash budget. Heading rules now apply to `##`+ only — the H1 is a title.

### 4. Backfill triage (data pass, live DB)
A classification pass over all 257 historical corrections: **134 feedback / 58 requests / 36 content notes / 22 unclear / 7 positive** — 37% of the "corrections" corpus was never writing feedback. Applied: feedback → polarity=corrective + requeued for synthesis; requests/notes → `category='non-feedback'` (durably excluded from coaching); positive → polarity=positive (first entries in the positive-exemplar channel). Synthesis queue now holds 141 real items. Backup: `~/.margin/margin.db.bak-20260706-pipeline-h1`.

### 5. Test infrastructure revived
The MCP suite (184 tests) had been undead in this environment — better-sqlite3's native binding was never built for the current Node ABI, hiding two schema-drift columns in the test fixture. Fixed both; all suites green: Rust 227, Go all packages, MCP 184, frontend 292.

## Verification evidence

- Live coaching prompt (`margin export coaching-prompt --type blog`): prohibitions render from DB, zero NOT-FEEDBACK items (was 7 in top 30), 21KB (was 25KB).
- Guard false-positive corpus (14 real docs forced through the published path): **zero blocks from the new patterns**. A seeded slop document blocks on published paths with 6 families clustered, and stays advisory-only on internal paths.
- The 9 corpus docs that DID block were true positives of Sam's own pre-existing hard rules — see open questions.

## Open questions for Sam (product calls, not bugs)

1. **Your shipped essays violate your own hard rules.** "the-steersman" has `## The real adjustment` (heading rule) and 25 em dashes (limit: 2). Several others are similar. Either the rules are calibrated too hard for shipped long-form, or the essays predate the standard and future writes should conform. The guard asks (never denies), so this is friction, not lockout — but worth deciding deliberately.
2. **"Moss markdown editor" wasn't findable** — research substituted iA Writer (the design-admired native markdown editor every search surfaced). If Moss is something specific, say the word and it gets a real pass.

## What's next (Horizon 2, per strategy doc)

1. LLM synthesis engine consuming the 141-item queue → generalized candidate rules with fixed-taxonomy categories, scope, and detection patterns.
2. Review queue in Style Memory (accept/edit/reject candidates).
3. Positive-exemplar capture gesture + per-type exemplar sections in the coaching prompt (the other half of the Spiral-parity voice engine).
4. Blind-lineup metric (LLM judge, Spiral publishes 87% — Margin gets an equivalent headline number).
5. Compliance harness revival (last run 2026-03-07).

Then Horizon 3: the design-language pass (Singer posture, Puckett motion discipline, Taylor moments) per the strategy doc.

## Note on the app binary

The desktop app was not rebuilt in this pass — the new migrations were applied to the live DB manually (identical content + sentinels, so the app's migration runner will no-op when it next builds). The Go CLI (`~/.local/bin/margin`) IS rebuilt and live; it's the sole writer of the exported artifacts, so the coaching prompt and guard improvements are already in effect for every Claude session.

# Theory: Margin as a Writing Feedback Loop

## Problem

Writers improve by reading their own work critically — but critical reading is ephemeral. You notice a weak transition, wince at a cliché, admire a sentence that landed — and then the moment passes. There's no systematic way to accumulate editorial judgment into something durable and actionable.

The deeper problem is that AI writing tools are generic. Claude writes competent prose but not *your* prose. The missing input is a machine-readable record of your taste: what you flag, what you fix, what you admire. Without that record, every AI writing session starts from zero.

## Operating Theory

Margin is a desktop reading app with a hidden payload: it builds a persistent, structured record of editorial judgment that feeds back into AI writing tools.

The surface experience is conventional — open a markdown file, highlight text, write margin notes. The differentiating layer is underneath: every annotation is persisted in SQLite with polarity (positive or corrective), typed by writing concern (voice, clarity, structure, etc.), and accumulated into writing rules. Those rules synthesize into a voice profile. The voice profile travels into Claude via MCP tools or clipboard export.

The loop is: **read → annotate → correct → synthesize → write better → read again**.

Three systems make this work:

**The annotation engine.** TipTap editor with custom extensions for multi-color highlights and margin notes. Highlights are stored separately from document text — the file on disk never contains markup. A 4-tier text-anchoring system (`text-anchoring.ts`) re-resolves highlight positions when documents change externally, with explicit confidence levels (exact / fuzzy / orphaned) rather than silent degradation.

**The diff review system.** When a file changes externally (VS Code edit while Margin is open), the file watcher triggers a diff pipeline. Small changes auto-accept. Larger changes surface per-change accept/reject controls.

**The MCP integration.** A Node.js MCP server opens the SQLite database directly and exposes 14 tools to Claude. The export bridge (`ExportBridge`) is an in-process HTTP server that enables push-based annotation delivery — Claude gets interrupted with your annotations rather than holding a blocking call open.

## Strategy

The development strategy has three layers, built bottom-up:

**Layer 1: Trustworthy data.** WAL-mode SQLite, foreign keys, cascading deletes, busy timeouts. Text anchoring with explicit confidence levels. The diff review system to prevent external edits from silently destroying annotations.

**Layer 2: Rich annotation.** Two-polarity system (positive signals to emulate, corrective signals to avoid). Writing type classification. Before/after examples on corrections. Writing rules with signal counts and severity. Voice profile generation. This layer transforms raw highlights into structured editorial knowledge.

**Layer 3: AI integration and verification.** MCP tools for bidirectional access. Export bridge with push notifications. Writing guard hook for real-time enforcement. Compliance checker and adversarial test suite for batch verification. This layer closes the loop — editorial judgment accumulated in Margin flows into Claude's context automatically, and the quality of that integration is now measurable.

The sequence matters: you can't build Layer 3 without Layer 2's structure, and Layer 2 is worthless without Layer 1's reliability. The recent pipeline audit added a verification dimension to Layer 3 — it's no longer enough to have the plumbing; the plumbing needs to prove it works.

## Key Discoveries

**The pipeline had no verification, and that mattered.** The full feedback→synthesis→rules→enforcement chain (corrections → polarity tagging → rule creation → writing-rules.md export → writing_guard.py export → Claude rule-following) was functionally complete across both Rust and TypeScript, but the TS side had zero test coverage for `createWritingRule`, `getWritingProfileMarkdown`, `getWritingGuardPy`, and `getAllCorrectionsForProfile`. The pipeline worked in practice but was a blind operation for any refactoring.

An audit added 19 unit tests and 2 integration tests. The integration test proved the chain works end-to-end for the first time: create a correction → set polarity → create a kill-word rule → verify it appears in the profile markdown → verify it appears in the guard hook's KILL_WORDS array. This is the first time the pipeline has been tested as a continuous chain rather than per-function.

**Schema parity drifted silently between Rust and TS.** The Rust backend added a `reviewed_at` column to `writing_rules` via migration, but the TS MCP server's test schema (`SCHEMA_SQL` in `db.ts`) didn't include it. Test databases were missing a column that exists in production. This is particularly dangerous when both backends share one SQLite file — the Rust migrations are the source of truth, and the TS `SCHEMA_SQL` is only for tests, but if those tests can't exercise a column that exists in production, the tests provide false confidence. Fixed by adding `reviewed_at INTEGER` to the TS schema.

**The writing guard is structurally sound but toothless.** Live data integrity probes against `~/.margin/margin.db` revealed zero kill-word rules in the database — the `KILL_WORDS` array in the generated `writing_guard.py` is empty. The guard only catches slop patterns (one regex from a single `ai-slop` rule). The enforcement layer works mechanically — the test confirmed it catches patterns in .md files, skips .ts files, and fails open on malformed input — but it has no ammunition. The comprehensive `KILL_WORDS.md` reference file (50+ words/phrases at HIGH/MEDIUM severity) exists but isn't reflected in the database.

**"Does Claude follow the rules?" is a different kind of question.** Unit tests verify plumbing correctness. But the product hypothesis — that accumulated editorial judgment makes Claude write better prose — requires a different verification method. The audit addressed this with a two-layer compliance system. Layer 1 (mechanical) does deterministic checks: kill word scan, structural tell detection, voice calibration violations, slop pattern matching. Layer 2 (LLM) shells out to `claude --print` with the full writing-rules.md and a scoring rubric.

The adversarial test generates 27 prose samples (9 writing types × 3 each) using prompts designed to tempt AI tells — "Write a paragraph arguing that most product roadmaps are theater" tempts "the hard part isn't X — it's Y," while "Write a bullet point for leading a product redesign" tempts "leveraging" and "spearheaded." Rules violated in 2+ of 3 samples are flagged as systematic failures. The regression suite diffs against baselines over time. This converts the core product hypothesis from subjective impression to measured signal.

**The `~/.margin/` directory is an informal protocol.** The database, MCP port file, corrections export, voice profile, and writing rules all live in `~/.margin/`. This started as a storage location and became a coordination mechanism between the desktop app, the MCP server, and external scripts like the compliance checker.

**State-in-hooks works at this scale.** No centralized store — each hook owns its domain. `App.tsx` wires them together. The current complexity is manageable, but cross-cutting coordination lives in the root component as prop threading.

## Open Questions

**The kill-words gap needs a decision.** The comprehensive `KILL_WORDS.md` reference is not reflected in the database's `writing_rules` table. The guard hook reads from the database. Should the kill words be seeded as database rules (enabling per-word management via MCP tools, but 50+ rows for a mostly-static list), or should the guard hook read from `KILL_WORDS.md` directly (simpler, but breaks the "database is source of truth" pattern)?

**The adversarial baseline hasn't been established yet.** The infrastructure exists — adversarial prompts, compliance scoring, baseline diffing — but it hasn't been run. The first run will establish whether the current rule set and voice profile produce measurably different prose than un-coached Claude. If the scores are indistinguishable, the pipeline is plumbing without payoff. This is the single most important open question for the product.

**Bidirectional annotation is untested in practice.** The MCP write-back tools let Claude annotate documents. The infrastructure exists; the habit doesn't.

**When does the hooks architecture need shared state?** The current domain-per-hook pattern is clean, but if another feature requires cross-hook reactivity (annotations affecting search ranking, corrections influencing highlight display), the wiring gets complex fast.

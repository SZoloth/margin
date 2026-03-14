# Theory: Margin as a Compounding Writing Feedback Loop

## Problem

AI writes competent prose but not *your* prose. You correct it. You correct the same things again. The feedback is scattered — chat history, mental notes, ad-hoc prompt instructions that don't persist. None of it compounds.

The missing piece isn't the AI model. It's the feedback UX. There's no tool that makes it easy to give structured feedback at the point of reading and routes that feedback back to the AI in a way that persists, scopes correctly, and compounds over time.

Every correction a writer gives is training data. But today, that data evaporates.

## Operating Theory

Margin is a desktop reading app whose hidden payload is a persistent, structured record of editorial judgment that feeds back into AI writing tools. The surface is conventional — open a markdown file, highlight text, write margin notes. The differentiating layer is underneath.

The core loop is: **read → annotate → correct → synthesize → write better → read again**. Each cycle should produce fewer corrections than the last.

Three properties make this loop work:

**Corrections are structured data, not free text.** Every annotation persists in SQLite with polarity (positive or corrective), writing type (cover-letter, outreach, blog, PRD, text message), and register (casual, professional, emotional, explaining, logistics). This structure is the routing logic — it determines which rules fire in which context. A correction to a cover letter stays scoped to cover letters. The system is smart enough not to apply outreach voice rules to a PRD.

**Signal count is the confidence mechanism.** When you give the same correction multiple times, `signal_count` increments. Low signal = guidance. Medium signal = soft enforcement (hook asks for confirmation). High signal = hard enforcement (hook blocks). You never classify severity manually — your behavior classifies it. The system watches what you care about most and enforces accordingly.

**The UX north star is minimum friction between feedback and effect.** The distance between "I corrected this" and "the system learned it" should approach zero. Auto-classify from context. Synthesize continuously, not in batches. Apply corrections to the current document immediately. The user's only job is to highlight and annotate.

## Strategy

The development strategy has four layers, built bottom-up. The first two are largely built. The last two are the current frontier.

**Layer 1: Trustworthy data.** WAL-mode SQLite, foreign keys, cascading deletes, busy timeouts. Text anchoring with 4-tier fallback and explicit confidence levels. File watcher with diff review for external edits. This layer is solid — 41 Rust tests on corrections, 46 tests on writing rules, export safety tests prevent data loss on persistence failure.

**Layer 2: Rich annotation and rule synthesis.** Two-polarity system (positive signals to emulate, corrective signals to avoid). Writing type and register classification. Before/after examples on corrections. Writing rules with signal counts, severity tiers, and category grouping. Voice calibration from 168k iMessage statistical analysis. MCP tools for bidirectional access. Writing guard hook for enforcement. This layer is functionally complete but has disconnects at the boundaries — the pipeline audit identified 13 structural gaps where Margin's internal data doesn't flow cleanly to Claude Code's enforcement surfaces.

**Layer 3: Eliminate friction.** This is the current frontier. The gap between "correction given" and "effect felt" is currently 5 manual steps (classify → export → synthesize → re-export → re-invoke skill). The target is zero manual steps: auto-classification from document metadata and gesture, continuous synthesis (not batched), immediate in-place rewrite of the corrected paragraph, and automatic propagation to future documents of the same type.

**Layer 4: Prove it compounds.** Correction rate per document per writing type is the metric. If the system works, this number goes down over time. "Graduation" is when a writing type reaches zero corrections for sustained time — the system has learned that type. The product story is a chart: "Cover letter corrections dropped from 12 per doc to 2 per doc over three months."

The constraint: the entire system should work within a Claude Code subscription. No fine-tuning, no custom models, no external APIs. Rules travel as structured text in context windows, not as model weights.

## Key Discoveries

**The pipeline audit revealed the gap between internal soundness and external enforcement.** Margin's internal data pipeline (corrections → synthesis → rules → profile generation) works. 129+ tests verify it. But the enforcement boundary — where Margin's rules meet Claude Code's hooks, skills, and rule files — is full of disconnects. The guard hook has an empty kill-word list. The editorial rules exist in 3-6 redundant copies with no sync mechanism. The reference files that `/writing-quality-gate` loads are manually curated islands, disconnected from Margin's DB. The system is a well-built engine with loose spark plug wires.

**The vision sharpened from "fix the plumbing" to "compounding returns on feedback."** The initial audit framed the target as "all pipes connected, no leaks." That's a 5-star fix of a 3-star system. The real target is: every correction you give should immediately improve the document you're working on, propagate to all future documents of the same type, and never need to be given again. The goal isn't zero corrections forever — voice evolves, new writing types emerge. The goal is zero *repeated* corrections.

**Signal count as an automatic severity classifier was a key insight.** The schema already supports it (`signal_count` column, duplicate merge coalescing). The leap is making it drive enforcement: your behavior determines how strictly a rule is enforced, not a manual severity dropdown. This eliminates a friction point (manual classification) while making the system smarter.

**Context-aware loading is the missing routing layer.** The schema has `writing_type` and `register` columns. Tests verify filtering by type and grouping by register. But the loading path dumps the full profile every time. The agent needs to detect what it's writing (cover letter vs text message vs PRD) and load only the relevant rule subset. This is where "smart enough not to apply the same rules to a text message as to a cover letter" lives.

**The constraint to Claude Code subscription shapes the architecture.** No fine-tuning means rules must be effective as structured text in context windows. No external APIs means enforcement at hook-time is local (Python script, regex scan). Voice calibration is statistical data, not a trained embedding. Synthesis uses `claude --print` within the subscription. This constraint is healthy — it keeps the system simple and portable.

**The hybrid architecture won (2026-03-13).** Autoresearch tested five architectures for getting Claude to write in Sam's voice. After 6 experiment runs totaling 216 scored samples:

| Architecture | Approach | Mean Pass Rate | Runs | Samples |
|---|---|---|---|---|
| A (rules) | 240 explicit rules as text instructions | 51.9% | 1 | 27 |
| B (exemplars) | 10 samples of Sam's writing as few-shot | 55.6% | 1 | 27 |
| C (editor) | Write freely, then edit against rules | 63.0% | 1 | 27 |
| D (corrections) | 30 raw corrections with context and reasoning | 61.2% | 2 | 54 |
| **E (hybrid)** | **Corrections + high-signal rules** | **72.3%** | **3** | **81** |

Architecture E — combining raw corrections (the concrete "you wrote X, I wanted Y" signal) with high-signal rules (signal_count ≥ 2 or severity = must-fix, for structural patterns) — outperforms every other approach by 9+ percentage points. E's 3-run range (59.3-80.8%) overlaps with D's best run but its mean is substantially higher.

The key insight: corrections and rules serve different functions. Corrections handle mechanical compliance ("don't use 'genuinely,' don't start with 'The'"). Rules handle structural patterns that may not yet have a correction in the DB (negative parallelism, sentence length variation). Neither alone matches the hybrid.

Dimension scores (voice quality, naturalness) are flat across all architectures (44-47). The entire difference is in mechanical compliance — avoiding the specific patterns Sam has flagged. This means the optimization surface is narrow and well-defined: it's about pattern avoidance, not style generation.

**Negative parallelism solved, repetitive-structure is the new frontier (2026-03-13, Tier 1).** Five experiments tested prompt-level interventions for neg-para. Prose instructions failed (whack-a-mole: fix neg-para, get repetitive-structure). A full governance schema (Architecture F, 63.9% mean) eliminated neg-para but hurt overall compliance. The winning approach: add a single structured `<prohibition>` block to E's prompt — surgical, ~10 lines, borrows F's technique without F's overhead. This variant (Architecture G) averages 70.4% with neg-para at 1 leak per 81 samples, and tighter variance (7.4pp range vs E's 21.5pp).

The remaining #1 failure is **repetitive-structure** — 4+ consecutive sentences of similar word count. This is fundamentally different from neg-para: it's a generation-time structural problem the model can't self-monitor, not a pattern it can learn to avoid. Prompt instructions to "vary sentence length" had no measurable effect. This may be the single-pass ceiling — further improvement likely requires either (a) a post-generation mechanical check with targeted rewrite, or (b) accepting it as the floor and optimizing other surfaces.

## Open Questions

**~~Should the system pivot from rules-first to corrections-first?~~** Answered: yes, but as a hybrid. Architecture E (corrections + high-signal rules) confirmed across 81 samples at 72.3% mean pass rate. The system should transition from rules-first (Architecture A) to E's corrections-first approach with rules as structural backstop. The current coaching-prompt.md and writing guard pipeline still use Architecture A — wiring E into production is Tier 3.

**Is the eval measuring the right thing?** The compliance scoring (mechanical checks + dimension scores) is a proxy for "would Sam correct this?" If the proxy doesn't correlate with actual corrections, optimizing against it is wasted work. Calibration study needed: generate prose, score it, have Sam read and correct it, compare.

**Can continuous synthesis work within token budgets?** Batch synthesis (export corrections → agent session → create rules) is expensive but controllable. Continuous synthesis (every correction triggers an incremental rule check) would need to be lightweight — possibly a local heuristic (exact text match against existing rules) with LLM synthesis only for novel patterns.

**How does in-place rewrite work architecturally?** When you correct a paragraph, Margin should rewrite it using the new rule. This requires either: (a) Margin calling Claude directly to regenerate the paragraph with the correction applied, or (b) the correction being a direct text replacement (simpler but less flexible). Option (a) is more powerful but means Margin becomes an AI writing surface, not just a reading surface.

**What's G's ceiling?** G averages 70.4% with the neg-para fix. Repetitive-structure accounts for ~8 failed samples per run (~30% of failures). If repetitive-structure could be eliminated, G would approach 80-85%. But single-pass generation may not be able to solve this — it may require a lightweight post-generation check. The question is whether correction selection and rule threshold tuning can close the gap without adding a second LLM pass.

**Does the proxy score correlate with Sam's real corrections?** Untested. The compliance scoring (mechanical checks + dimension heuristics) is an approximation of "would Sam correct this?" If the proxy is miscalibrated, optimizing against it is wasted work. A calibration study (generate → score → have Sam read and correct → compare) is needed before heavy Tier 1 investment.

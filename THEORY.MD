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

## Open Questions

**Can continuous synthesis work within token budgets?** Batch synthesis (export corrections → agent session → create rules) is expensive but controllable. Continuous synthesis (every correction triggers an incremental rule check) would need to be lightweight — possibly a local heuristic (exact text match against existing rules) with LLM synthesis only for novel patterns. The economics matter: if every correction costs an API call for synthesis, the friction reduction is offset by latency and cost.

**How does in-place rewrite work architecturally?** When you correct a paragraph, Margin should rewrite it using the new rule. This requires either: (a) Margin calling Claude directly to regenerate the paragraph with the correction applied, or (b) the correction being a direct text replacement (simpler but less flexible). Option (a) is more powerful but means Margin becomes an AI writing surface, not just a reading surface. That's a significant scope expansion.

**Is correction rate the right metric, or is it correction *effort*?** A document with 3 corrections that each took 30 seconds of thought might represent more friction than a document with 8 corrections that were all quick kill-word fixes. Signal count captures frequency but not effort. The metric might need a weight factor.

**When does the full-profile-dump approach become a token problem?** `writing-rules.md` is currently ~480 lines. As rules accumulate, context-aware loading becomes mandatory not just for relevance but for token efficiency. At what rule count does the full profile stop fitting comfortably in Claude's context alongside the actual writing task?

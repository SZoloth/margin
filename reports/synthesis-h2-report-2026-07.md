# Synthesis Engine — Horizon 2 First Pass (2026-07-06)

_Companion to [plans/pipeline-strategy-2026-07.md](../plans/pipeline-strategy-2026-07.md). Branch `feat/synthesis-engine`. This is the stage that was missing after Horizon 1 removed mechanical auto-synthesis: how a correction becomes a rule._

## What shipped

### The synthesis jig (`feat(synthesis)`, 43daaf1)
`margin export synthesis-prompt [--type] [--stats]` — gathers the queued feedback corrections (`GetUnsynthesizedFeedback`) and assembles them into a structured prompt whose output contract forces generalization: fixed-enum category, writing-type scope, optional validated `detection_pattern`, before/after, `signal_count`, and `source_highlight_ids` tracing each candidate back to its corrections. The generator does no reasoning — it's the reusable "jig" (Puckett's term, from his bookmarked thread) that feeds an LLM synthesizer. Organized around the Lago voice-skill insight (Sam's bookmark): the drafted→sent→lesson delta is the unit of generalization.

### The review gate (`feat(synthesis)`, b53805d + e0824ad)
Synthesized rules are written as `source='synthesis-candidate'`, `reviewed_at=NULL`, and **excluded from every export path** — coaching corrections, coaching rules, the prohibitions block, the profile markdown, and the mechanical guard — until accepted. CLI: `rules add-candidates <json>` (validates each detection pattern; drops letterless/too-broad ones but keeps the rule), `rules candidates`, `rules accept <id>` (promotes to `source='synthesis'`, marks source corrections done, re-exports), `rules reject <id>`. A db test proves the core safety property: a candidate is invisible to `GetHighSignalRules` until accepted.

## The first pass — results

Ran two synthesizer agents over the two richest queues:

| Batch | Corrections in | Candidate rules out | Notable |
|---|---|---|---|
| Blog / general | 24 | 19 | Independently rediscovered Sam's known editorial rules — negative parallelism (signal 6), em-dash limit, "kind of X that" — strong evidence the synthesis captures real patterns, not hallucinations. |
| Cover-letter | 71 | 18 | Clustered 71→18 (signal 10 for "make logical connections explicit", 9 for negative parallelism, 7 for reader-calibration). Rule #18 *preserved* Sam's "name a weakness then reframe" as a positioning move rather than flagging it — the "preserve the writer's actual preferences" discipline working correctly. |

**37 candidate rules total, 116 signal points, 4 mechanically enforceable, all gated.** Live in the DB as unreviewed candidates; nothing in the active corpus changed.

Two issues the live run surfaced and fixed:
1. A synthesizer proposed a bare `—` as a detection pattern — a valid regex that matches every document (the exact anti-pattern guard v2 removed). `add-candidates` now drops letterless/under-3-char patterns while keeping the rule.
2. Accepting a rule now marks its source corrections synthesized, so they leave the queue; rejected-candidate corrections stay queued.

## Review surface

A warm-cream, antique-gold, editorial review artifact presents all 37 candidates grouped by writing type — rule text, severity stripe, category chip, before/after, detection pattern, and source-correction meter. It honors Margin's real tokens (`#fffff8`, `#8a6e1a`, Newsreader/Instrument Sans) and doubles as a design prototype for the Style Memory dashboard (Horizon 3). Sam reviews and tells chat what to accept/reject; the gate keeps the decision his.

## What this proves for "as powerful as Spiral"

Spiral abandoned rules and can't say *why* a draft feels off. Margin now has the full loop: a correction made while reading becomes a generalized, scoped, traceable, mechanically-or-judgmentally-enforced rule — reviewed by the writer, never silently applied. The 37 candidates are auditable (each traces to its corrections), bootstrapped from a single reading session, and model-portable. The half still missing is the positive-exemplar channel (7 captured) and the drafted→sent delta capture (schema-ready, zero data) — the stylometric "what you sound like" to complement the rules' "what to avoid."

## Next

1. Sam reviews the 37; accept/reject wired and ready.
2. Run synthesis on the remaining queues (general 35, outreach 7, pitch 4).
3. Positive-exemplar capture gesture + coaching-prompt exemplar sections.
4. Blind-lineup metric (Spiral parity) on the dashboard.
5. MCP parity for the review gate (Go CLI is canonical; MCP display-only formatters should mirror the candidate filter for consistency).

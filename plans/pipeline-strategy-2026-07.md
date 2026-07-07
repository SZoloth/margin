# Margin — Pipeline & Experience Strategy (July 2026)

_Supersedes the enhancement roadmap in `strategy-2026-07.md` for prioritization. Sam's directive (2026-07-06): "first and foremost is the accuracy/efficacy/efficiency/consistency relating to the pipeline from feedback to rules to better writing. the other is better ux… as powerful and effective (if not more so) as Spiral… look and feel like Benji Taylor, Jordan Singer, or Josh Puckett designed and built it."_

## Part 1 — Pipeline audit (evidence, not vibes)

The loop is: **capture correction → synthesize rule → enforce on AI writing → measure**. Audited each stage against the live database (`~/.margin/margin.db`, 258 corrections, 232 rules), the live guard hook, and the live coaching-prompt export. Findings ranked by damage.

### F1. The coaching prompt feeds Claude junk as its "strongest signal" — accuracy, CRITICAL
`margin export coaching-prompt` selects the **30 most recent corrections with zero quality filtering** (`GetCorrectionsWithNotes`: `ORDER BY created_at DESC LIMIT 30`). The top items in today's live output are notes explicitly marked "NOT FEEDBACK, A REQUEST/PROMPT" — Sam's task-requests being presented to the writing model as style corrections. The prompt's own header calls these "your strongest signal for what to avoid."

### F2. Rule synthesis is mechanical concatenation — accuracy, CRITICAL
`auto_synthesize_rule` (corrections.rs) creates a rule as `notes.join("; ")` verbatim, category `auto-synthesized`, severity always `must-fix`, and stamps the correction `synthesized_at`. Consequences: (a) raw margin notes become "rules" with no generalization; (b) because everything gets auto-marked synthesized, **no correction is ever queued for real synthesis** — the mechanical path consumes the signal the LLM path was designed for. All 257 corrections show synthesized_at set; the July rules audit had to DROP 48 rules, many of them this path's output.

### F3. Mechanical enforcement is ~15% real — efficacy, HIGH
The guard hook enforces 45 kill words + 103 "slop patterns" + 1 heading pattern. But the slop patterns are `example_before` fields used as regexes — most are **full verbatim sentences from past documents** ("Same approach I used at Wasabi: isolate what converters…") that will never match future prose, and their unescaped metacharacters silently alter matching. Only the short generic ones ("stands as a beacon", "it should be noted") do anything. The 28 voice-calibration rules and the long tail have no mechanical presence at all.

### F4. No register or type gating anywhere in enforcement — consistency, HIGH
The guard applies every pattern to every prose file (`.md/.mdx/.txt/.html`) regardless of document type. The coaching prompt's `--type` flag changes only a label line and a length constraint — **rule and correction selection ignore type entirely** (`GetHighSignalRules`: `WHERE signal_count >= 2 OR severity='must-fix' ORDER BY signal_count LIMIT 30`). A resume rule fires on a blog post; a casual-register rule constrains a cover letter.

### F5. The strongest prohibitions live in a Go binary, not the database — consistency, HIGH
The five BLOCK prohibitions (negative parallelism, em-dash cap, terminal punctuation, "kind of X that", colon cap) are hardcoded in `cli/profile/coaching.go`. The DB — supposedly the single source of truth coordinating Rust/MCP/CLI — cannot change, scope, or version them. Corrections can never strengthen them.

### F6. Zero positive signal — efficacy vs. Spiral, HIGH
Spiral's entire voice model is positive exemplars (verified live: 63 voice samples + 8-9 samples per named style). Margin's polarity field supports positive corrections and holds **zero** (244 null, 14 corrective). The system knows only what Sam hates, never what he sounds like. This is the single biggest structural gap between "rule enforcer" and "voice engine."

### F7. No measurement loop — efficacy, MEDIUM
The compliance/adversarial harness last ran 2026-03-07 (2 runs ever, one failed). Rule changes ship unmeasured; the dashboard honestly reports the staleness but nothing acts on it.

### F8. Taxonomy drift — consistency, MEDIUM
Category names are inconsistent (`Voice DNA` vs `voice-calibration`, `Accuracy` vs `accuracy`) with 20+ singleton categories. Dedup key is `(writing_type, category, rule_text)`, so casing drift defeats idempotent merging.

## Part 2 — Research inputs (what to steal)

Four research passes (humanizer by blader, Spiral, Proof/proofeditor.ai, iA Writer as design reference, designer-trio distillation). Full agent reports in session; distilled here.

**From humanizer (MIT, liftable wholesale):** a 33-pattern AI-tell taxonomy (rooted in Wikipedia's "Signs of AI writing") far broader than Margin's corpus — copula avoidance ("serves as/boasts"), predicate-position hyphenation, aphorism formulas, staccato-drama runs, speculative gap-filling, inline-header lists, fragmented headers. Architecture lessons: **cluster-based flagging** (co-occurrence of multiple tell families, never single hits — kills false positives), an explicit **"signs of human writing" protect-list**, **register gating** for rule families, and a **draft → "what makes this obviously AI?" self-critique → final** loop.

**From Spiral (probed live via API + Every's published engineering history):** v4's Style Engine is stylometry — a statistical writing fingerprint from samples (~30/style in real usage), with per-request retrieval of the most relevant samples by output type. No fine-tuning, no rules: their GM says rubric/rules-based generation prompting "was all really bad" and they abandoned it. Their headline metric is an LLM-judge blind lineup (draft vs. the user's real samples — 87% indistinguishable). Product surfaces worth copying: three composable primitives (Generate / Personalize / Humanize as distinct jobs), format templates decoupled from voice (16 `/slash` prompts encoding structure per type), knowledge kept structurally separate from voice, and agent-native distribution as the growth lever (500+ agents connected in a month; Margin already has the MCP — press it). Margin's structural edges to press: (1) **auditability** — rules are named, versioned, traceable to the correction that produced them; a once-in-20-drafts tic never registers in a statistical fingerprint but one correction makes it a rule forever; (2) **single-correction bootstrap** — no 30-sample homework; (3) **model portability** — Spiral's voice lives in a model-specific 12,000-word system prompt they had to rewrite when swapping models; Margin's rules are small declarative constraints any generator can be handed. The caution to respect: rules alone don't produce voice — Spiral's stylometric insight (subconscious markers: function words, sentence order, rhythm) says Margin's positive-exemplar channel is not optional garnish, it's the other half of the engine.

**From Proof (Every's agent-first editor):** the two-channel correction pattern — the change rendered inline as track-changes, the *why* as an attached thread. A correction without a visible why can't synthesize into a good rule. Also: per-span provenance coloring is cheap and legible. Do not copy: authorship-attribution framing, threaded-comment ceremony.

**From the designer trio:** Singer's reductive density + borrowed-discipline systems set Margin's posture (already right: cream, Newsreader, 65ch). Puckett's rules for motion-as-tuned-system and effects-never-break-text-selection govern implementation. Taylor's shared-element continuity (popovers originate from their trigger, nothing teleports) and delight-in-rare-corners apply to the dashboard and milestone moments, not the reading surface. Anti-patterns to enforce: library-default transitions, centered modals detached from the highlight, uniform delight, tab-per-stat dashboards.

## Part 3 — Target architecture

```
CAPTURE            SYNTHESIZE                ENFORCE                      MEASURE
correction   →   staged queue        →   guard v2 (mechanical)     →   compliance runs
+ rationale      (LLM generalizes:       cluster-scored regex           on every rule
+ polarity        rule, category from    families, register-gated       change; scores
+ register        fixed enum, scope,                                    on dashboard
+ exemplars       detection pattern,  →  coaching prompt v2
  (positive!)     candidate severity)     (type-scoped rules, clean
                  Sam reviews queue       corrections, positive
                  in Style Memory         exemplars, DB-sourced
                                          prohibitions, self-critique loop)
```

Principles: the DB is the only source of enforcement truth (no rules in binaries); every rule carries scope (writing types + registers it applies to); mechanical enforcement only for mechanically-detectable patterns (everything else goes to the prompt layer); nothing enters the active corpus without either human review or measured compliance improvement; positive exemplars are first-class.

## Part 4 — Execution plan

### Horizon 1 — stop the bleeding (this week, mostly this session)
1. **P0 Kill the junk-synthesis path.** Auto-synthesized rules become `severity='candidate'` staged for review, and stop stamping `synthesized_at` (that's the LLM pass's job). Alternatively gate behind a setting, default off.
2. **P0 Clean the coaching prompt.** Filter corrections: exclude items whose notes match request/prompt markers, exclude null-polarity legacy junk unless reviewed; select rules scoped by writing_type; move the 5 hardcoded prohibitions into the DB (seed migration) and render from there.
3. **P0 Guard v2 core.** Stop using `example_before` as regex. Curate the working patterns; seed the humanizer taxonomy as proper regex families (copula-avoidance, AI vocabulary, aphorism formulas, tail negation, staccato runs, predicate hyphenation); add cluster scoring (flag only on multi-family co-occurrence per document, hard-block only for kill words and BLOCK prohibitions).
4. **P0 Backfill triage.** One agent pass over the 258 historical corrections: classify each as feedback vs request/other (the "NOT FEEDBACK" markers make this mostly mechanical), set polarity, clear bogus synthesized_at on real feedback so it queues for synthesis.

### Horizon 2 — the synthesis engine (next)
5. **LLM synthesis pass** (`margin synthesize` / MCP tool): consumes unsynthesized corrections in clusters, emits generalized candidate rules with fixed-enum categories, scope, detection patterns, before/after examples. Idempotent via dedup key after taxonomy normalization.
6. **Review queue in Style Memory** — candidate rules with accept/edit/reject; Proof-style inline presentation of the originating correction.
7. **Positive exemplar capture** — a "keep this" gesture in the reader (polarity=positive), per-type exemplar sections in the coaching prompt (Spiral parity).
8. **Taxonomy migration** — fixed category enum, casing normalization, register-scope column (already specced in rules-audit notes).
9. **Measurement revival** — compliance harness runs on rule-corpus change; score trend on dashboard; adversarial suite before/after Horizon 1 to prove the cleanup helped.

### Horizon 3 — the experience (parallel where cheap)
10. Popovers originate from their trigger (shared-element motion, one physics); named motion stages with tuned values.
11. Dashboard density pass (one legible visual object, not tab-per-stat); calibrated delight on rule milestones.
12. Correction gesture polish: two-channel (inline change + why), 6-swatch highlight palette, guaranteed text-selection under all effects.

### Sequencing note
Horizon 1 items are independent and executable now under existing authority (L1/L2: correctness of the pipeline's own contract). Horizon 2 items 5-6 change product behavior — build behind the review queue so Sam gates what enters the corpus. Horizon 3 rides along as design-pass continuation.

## Part 5 — What "as powerful as Spiral" means, measurably
- Coaching prompt for any type contains: ≥5 clean rationale-carrying corrections of that type, ≥3 positive exemplars, type-scoped rules, zero non-feedback items.
- Guard false-positive rate: near-zero on Sam's real recent prose (test corpus: last 20 vault docs) while still catching a seeded slop document.
- Compliance score (adversarial suite) improves after each corpus change, and the dashboard proves it with a fresh timestamp.
- A new correction reaches enforceable status (reviewed rule, scoped, measured) in one sitting, not never.
- **Blind-lineup metric (Spiral parity):** an LLM judge tries to spot Margin-coached output in a lineup with Sam's real prose; track the indistinguishability rate on the dashboard as the headline number. Spiral publishes 87%; Margin gets a defensible equivalent the moment positive exemplars exist.
- **Voice engine = both halves:** rules encode what to avoid (Margin's moat: auditable, one-correction bootstrap, model-portable); exemplars encode what to sound like (stylometry's lesson: rhythm and function words, not word lists). Neither substitutes for the other.

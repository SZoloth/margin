# Product Strategy — Margin

**Last updated:** 2026-03-04

**Related docs:** [PIPELINE-AUDIT.md](./PIPELINE-AUDIT.md) · [technical-strategy.md](./technical-strategy.md)

---

## Strategic Context

AI writing has a quality problem that nobody is solving structurally. Every LLM produces prose with the same tells — hedge words, negative parallelism, corporate jargon, uniform cadence, absence of personal voice. Users notice. Hiring managers notice. Readers notice. The tools that claim to fix this either detect AI text after the fact (useless) or apply generic style rules that aren't yours (Grammarly).

Margin exists to fix this — not by detecting AI text, but by preventing AI tells at the source. It captures editorial judgment from reading, synthesizes it into enforceable writing rules, and mechanically prevents Claude from writing patterns you've flagged.

**The product thesis:** Every correction you give should immediately improve the document you're working on, propagate to all future documents of the same type, and never need to be given again. The system creates compounding returns on feedback — the more you use it, the fewer corrections you need to give, until AI writes content that doesn't need your feedback.

**UX north star:** Minimum friction between feedback and effect. The distance between "I corrected this" and "the system learned it" should approach zero. Today that distance is 5 manual steps (classify → export → synthesize → re-export → re-invoke). The target is zero manual steps for common cases.

**Friction in the current pipeline:**

| Step | What happens | Friction |
| --- | --- | --- |
| 1. Correct text | Highlight + annotate in Margin | Low (the UX is already good) |
| 2. Classify correction | Set polarity, writing type | Medium (manual, required for signal quality) |
| 3. Export corrections | Click export or trigger from Style Memory | Medium (manual batch operation) |
| 4. Synthesis | Claude analyzes patterns, creates rules | High (manual, requires agent session) |
| 5. Export profile | `margin export profile` regenerates artifacts | Medium (manual, or auto on rule mutation) |
| 6. Effect on current doc | Re-generate the draft you're working on | Not connected (correction doesn't fix the doc you're editing) |
| 7. Effect on future docs | Rules loaded next time `/writing-voice` fires | Automatic (but only if the skill is invoked) |

Steps 2-6 are where friction lives. The ideal collapses them:

| Step | Ideal | Friction |
| --- | --- | --- |
| 1. Correct text | Highlight + annotate in Margin | Same |
| 2. Classify | Auto-inferred from document type + correction content | Zero (system infers) |
| 3-5. Learn | Correction persists → rule created/strengthened → artifacts regenerated | Zero (continuous, not batched) |
| 6. Current doc | The paragraph you corrected is rewritten using the new rule | Zero (immediate) |
| 7. Future docs | Rules are already propagated; context-aware loading matches rules to medium | Zero (automatic) |

**Constraint:** The entire system works within a Claude Code subscription. See [technical-strategy.md](./technical-strategy.md) for implementation details.

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

**The single most important open question:** Does the loop actually work? The adversarial testing infrastructure exists (27 prompts, compliance scoring, regression diffing) but has never been run. The writing guard is mechanically sound but has zero kill-word rules loaded. The voice profile generates correctly but has thin signal. Until there's a measured compliance delta between coached and uncoached Claude, everything else is premature.

---

## Strategic Priorities (Ordered)

### Priority 1: Prove the Delta

**Goal:** Measure whether the voice profile produces detectably different AI prose.

**Why first:** If the compliance delta is negligible, the product thesis is wrong and everything else is wasted effort. If it's significant, every subsequent priority has a quantified reason to exist.

**What exists:**
- Adversarial prompts: 9 writing types (general, email, cover-letter, outreach, prd, blog, resume, slack, pitch) x 3 samples = 27
- Compliance checker: mechanical layer (kill-words, slop patterns, structural tells, voice violations) + LLM layer (Claude scores against full rubric)
- Regression suite: diffs against stored baselines over time
- All in `mcp/scripts/adversarial-test.ts` and `mcp/scripts/compliance-check.ts`

**What's missing:**
- The kill-word rules aren't seeded. `KILL_WORDS.md` exists at `~/.claude/skills/writing-quality-gate/references/KILL_WORDS.md` with 50+ entries but the `writing_rules` database table has zero kill-word rows. The writing guard's `KILL_WORDS` array generates empty.
- The adversarial baseline has never been run. No stored baseline exists to diff against.
- Voice-calibration rules exist but are thin — few register-specific constraints.

**Actions:**
1. Seed `writing_rules` table from `KILL_WORDS.md` — each word as a `category: "kill-words"`, `severity: "must-fix"` rule. Database as source of truth, not the markdown file.
2. Load existing ai-slop patterns as rules if not already present.
3. Run the adversarial baseline: 27 samples uncoached (no voice profile), 27 samples coached (full profile + guard active).
4. Score both sets. Publish the compliance delta.
5. If delta < 15% violation reduction: diagnose which rule categories have insufficient signal, add targeted corrections, re-run.
6. If delta >= 15%: baseline established. Regression suite tracks it going forward.

**Success signal:** A number. "Claude with voice profile produces X% fewer AI tells than Claude without."

---

### Priority 2: Harden the Pipeline

**Goal:** Make the corrections → rules → profile → enforcement chain transactionally safe, and eliminate the redundancy that causes drift.

**Why second:** The pipeline audit found 13 structural disconnects. If the loop is proven to work (Priority 1), these become critical — you can't lose corrections that have proven value, and you can't have rules scattered across 6 locations with no sync.

**The 3 most urgent issues:** synthesis is not transactional (§9 — corrections marked done before rules persist), the guard hook is nearly empty (§1, §13 — zero kill-words, 1 slop pattern), and editorial rules are scattered across 3-6 locations with no sync (§11). See [PIPELINE-AUDIT.md](./PIPELINE-AUDIT.md) for the full 13-finding breakdown and status tracking.

**Technical fixes** (transaction safety, dual artifact generators, schema parity, MCP surface gaps) are owned by [technical-strategy.md](./technical-strategy.md).

**Success signal:** Zero pipeline data loss. All corrections entering synthesis produce corresponding rules. Editorial rules exist in exactly one place (Margin DB) with generated artifacts downstream.

---

### Priority 3: Load the System

**Goal:** Accumulate enough editorial signal that the voice profile is genuinely useful, not a thin prototype.

**Why third:** The loop is proven (Priority 1), the pipeline is safe (Priority 2). Now the system needs real signal volume.

**What "loaded" looks like:**
- 50+ kill-word rules with signal counts > 1 (patterns flagged across multiple documents)
- 20+ ai-slop pattern rules with regex patterns and before/after examples
- 10+ voice-calibration rules covering both registers (casual vs. professional)
- Corrections with polarity tagged (positive and corrective) across 5+ writing types
- Writing samples section of the profile populated with positive-polarity excerpts

**How to get there:**
- **Seed from existing reference material:** KILL_WORDS.md, existing ai-slop patterns, any manual corrections already in the database.
- **Active reading sessions:** Read AI-generated prose (Claude drafts, blog posts, cover letters) in Margin and annotate — flag AI tells, corporate clichés, structural patterns that smell generic.
- **Read your own best writing:** Highlight passages with positive polarity to populate the "writing samples" section. Claude needs examples of what *to* do, not just what to avoid.
- **Cross-document synthesis:** After 5-10 annotation sessions, run synthesis. Duplicate rules merge (signal_count increments), indicating patterns you flag consistently.

**Friction reduction that accelerates loading:** Auto-classification (infer polarity + writing type from gesture and document metadata), continuous synthesis (auto-increment signal_count for known patterns), and context-aware rule loading (agent loads only the relevant subset for the current writing type). Technical implementation details in [technical-strategy.md](./technical-strategy.md) § Friction Reduction Architecture.

**Success signal:** Voice profile that feels like a genuine editorial fingerprint — specific to your voice, not a generic style guide. Adversarial compliance score improves measurably from Priority 1 baseline. Loading velocity increases as friction decreases (auto-classification and continuous synthesis reduce the manual work per correction).

---

### Priority 4: Platform Decision

**Goal:** Commit to Tauri or Swift as the long-term implementation.

**Why fourth:** The platform choice depends on whether the loop requires editor-level AI features (in-place rewrite). Priority 1 answers that.

**The product question:** Does Margin need to be an AI writing surface (corrections immediately rewrite the paragraph), or just a reading/annotation surface where the voice profile travels to wherever AI writes?

- If reading/annotation only → Swift is simpler (2 deps, 15MB binary)
- If in-place rewrite is core → Tauri/TipTap is required (content AI, tracked changes)
- If unsure → stay on Tauri until Priority 1 clarifies

**The full technical analysis** (platform comparison, dependency tradeoffs, gap-to-close estimates) is owned by [technical-strategy.md](./technical-strategy.md).

---

### Priority 5: Ship and Show

**Goal:** Make Margin visible — downloadable product, case study, portfolio evidence.

**Why fifth:** Margin is connected to two other projects: the personal site (case study content) and the job search pipeline (portfolio evidence). A shipped, polished product with a measurable quality delta is the strongest possible portfolio piece.

**Actions:**
- Polish: settings UI, onboarding (first-run experience explaining the loop), keyboard shortcuts reference
- Landing page on personal site: the problem (AI writing is generic), the mechanism (reading → rules → enforcement), the proof (adversarial delta)
- Case study: architecture decisions, the feedback loop theory, adversarial testing methodology, measured results
- Distribution: auto-update pipeline (Tauri updater or Sparkle), code signing, notarization, download link

**What makes this case study different from "I built an app":** It has a thesis (editorial judgment compounds into AI writing quality), two measurements (adversarial compliance delta AND correction rate over time per writing type), and a result. The compliance delta proves the rules work. The correction rate proves the system *learns* — fewer corrections needed over time. The graduation milestone ("text messages: zero corrections in 30 days") is the ultimate proof point.

**The case study story:**
1. **Problem:** AI writes generic content. You correct it. You correct the same things again. The feedback is scattered across chat history, your head, ad-hoc prompt instructions that don't persist. None of it compounds.
2. **Insight:** Every correction is training data. The missing piece isn't the AI model — it's the feedback UX. No tool captures structured feedback at the point of reading and routes it back to AI in a way that persists and compounds.
3. **Solution:** Margin captures corrections at the point of reading, in the most natural gesture (highlight + annotate), infers context automatically, synthesizes corrections into persistent rules scoped by writing type and register, and enforces them across every surface where AI writes — immediately on the current document, and automatically on every future document of the same type.
4. **Result:** Correction rate drops over time, per writing type. The goal isn't zero corrections forever — voice evolves, new writing types emerge. The goal is zero *repeated* corrections. You should never have to tell the system the same thing twice.

#### Metrics that prove the loop

**Correction rate** is the only output metric that matters. If the system works, corrections per document go down over time, per writing type. Margin already stores corrections with timestamps and document context — the data exists to compute: "For cover letters, the correction rate dropped from 12 per doc (January) to 3 per doc (March)." Not "the system has 47 rules" — that's an input metric. "You gave 3 corrections this time instead of 12" — that's the output.

**Graduation detection.** For any writing type, there's a point where the correction rate is effectively zero — the system has learned enough rules, with enough signal strength, scoped to the right context, that it produces content you don't need to correct. The system should surface when a writing type is approaching graduation: "You haven't corrected a text message in 30 days. Cover letters still average 4 corrections per doc."

**Override tracking.** When the guard hook fires and the user overrides it, that's a signal the rule is wrong for that context. If a rule is overridden more than it's enforced, it needs context scoping (wrong writing_type or register), not removal. Overrides are feedback too — they refine the routing logic.

**Uncovered pattern detection.** When a correction doesn't match any existing rule, that's a new pattern. Over time, the gap between "corrections given" and "rules that exist" should shrink to zero. When it reaches zero for a given writing type, that type is "learned."

---

### Priority 6: Expand the Loop

**Goal:** Make the writing quality system more powerful along dimensions that are already architecturally possible.

**Why last:** New features only matter if the core loop is proven and the system is loaded.

#### 6a: Expand enforcement coverage

Currently only kill-words and ai-slop auto-enforce. The writing guard can be extended to catch structural patterns:
- Consecutive paragraphs starting with the same word
- Excessive hedging ("it's worth noting," "it's important to")
- Uniform paragraph length (a statistical AI tell)
- Missing first-person voice in contexts where it's expected

#### 6b: Bidirectional AI annotation

MCP write-back tools exist (`margin_create_highlight`, `margin_create_note`). Claude can annotate *your* documents — flagging patterns that violate your own rules. "You wrote 'leverage' in paragraph 3. Your rules say that's a kill-word." This turns Margin from one-way capture into a dialogue.

#### 6c: Multi-source capture

Extend beyond markdown files. Web articles (keep-local integration already exists at localhost:8787). PDFs. EPUBs. Every reading source is a potential correction source. The annotation engine and feedback loop are format-agnostic; the challenge is rendering and anchor resolution per format.

#### 6d: Spaced repetition for rules

Surface rules you haven't reviewed recently. Show examples of violations from past writing. Test whether you can identify violations in prose samples. This converts the rule database from a static reference into an active learning system — you internalize the rules, not just the AI.

#### 6e: Rule sharing and composition

Export your voice profile as a portable artifact. Import someone else's. An editor could maintain a house style profile. Organizations could have a base profile that individuals extend. This requires: profile merging, conflict resolution (my rule vs. house rule), and provenance tracking.

#### 6f: Correction decay (90-day rule re-evaluation)

Rules that haven't been triggered or reinforced in 90 days surface for re-evaluation. Your voice evolves — a rule from 6 months ago that you've never re-corrected might be stale. The `reviewed_at` column (already in the schema) becomes the mechanism. Rules don't silently expire; they surface for a quick "still relevant?" check.

---

## What This Is Not

- **Not a reading app.** Reading is the input mechanism. The product is the writing quality output.
- **Not a note-taking tool.** Notes exist in the margin of documents as annotation, not as standalone knowledge objects.
- **Not an AI detector.** Margin prevents AI tells at the source, not after the fact.
- **Not a grammar checker.** Margin doesn't fix your grammar. It teaches the AI to write like you.
- **Not Grammarly.** Grammarly applies Grammarly's rules. Margin enforces *your* rules, derived from *your* annotations, verified against *your* compliance rubric.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **The delta is negligible** — voice profile doesn't measurably change Claude's output | Medium | Fatal | Priority 1 tests this directly. If true, either the rules are too thin (fixable by loading more signal) or the enforcement mechanism is too weak (fixable by expanding guard coverage). If neither fix works, the thesis is wrong. |
| **Users never reach synthesis** — they annotate but don't complete the correction → rule flow | High | High | The real fix is eliminating the synthesis step for common cases (continuous synthesis — auto-increment signal_count when correction matches existing rule). For novel patterns: auto-suggest synthesis at threshold. One-click export. Auto-classification removes tagging friction. See PIPELINE-AUDIT.md Layer 2. |
| **Friction kills the loop** — too many manual steps between correction and effect | High | High | Currently 5 manual steps between feedback and effect. Each step is a dropout point. Auto-classification, continuous synthesis, and in-place rewrite collapse this to zero for common cases. |
| **AI models improve and the problem disappears** — Claude 5 doesn't produce AI tells | Low | Medium | Even if base models improve, personal voice calibration remains valuable. "No AI tells" is not the same as "writes like you." |
| **Kill-word approach is too blunt** — binary blocking prevents legitimate use of flagged words | Medium | Low | Severity system already exists (must-fix, should-fix, nice-to-fix). Only must-fix kill-words auto-block. Others are advisory. |
| **Pipeline data loss** — corrections lost in synthesis, rules not persisted | Medium | High | Priority 2 fixes the transaction gap. Gap tracking ratchet logs production escapes. |
| **MCP protocol instability** | Medium | Medium | Voice profile also works via clipboard export. CLI alternative exists in Go. The loop doesn't require MCP. |

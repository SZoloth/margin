# Product Strategy — Margin

**Last updated:** 2026-03-04

---

## Strategic Context

AI writing has a quality problem that nobody is solving structurally. Every LLM produces prose with the same tells — hedge words, negative parallelism, corporate jargon, uniform cadence, absence of personal voice. Users notice. Hiring managers notice. Readers notice. The tools that claim to fix this either detect AI text after the fact (useless) or apply generic style rules that aren't yours (Grammarly).

Margin exists to fix this — not by detecting AI text, but by preventing AI tells at the source. It captures editorial judgment from reading, synthesizes it into enforceable writing rules, and mechanically prevents Claude from writing patterns you've flagged.

**The product thesis:** Every correction you give should immediately improve the document you're working on, propagate to all future documents of the same type, and never need to be given again. The system creates compounding returns on feedback — the more you use it, the fewer corrections you need to give, until AI writes content that doesn't need your feedback.

**UX north star:** Minimum friction between feedback and effect. The distance between "I corrected this" and "the system learned it" should approach zero. Today that distance is 5 manual steps (classify → export → synthesize → re-export → re-invoke). The target is zero manual steps for common cases.

**Constraint:** The entire system should work within a user's Claude Code subscription. No fine-tuning, no custom models, no external APIs. Rules travel as structured text in context windows, not as model weights.

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

**Why second:** The pipeline audit (2026-03-03, updated 2026-03-04) found 13 structural disconnects. If the loop is proven to work (Priority 1), these become critical — you can't lose corrections that have proven value, and you can't have rules scattered across 6 locations with no sync.

**Critical issues from audit:**

| Issue | Severity | Problem | Fix |
|-------|----------|---------|-----|
| Synthesis not transactional | P1 | `export_corrections_json` marks rows `synthesized_at = now()` before rules are confirmed created. Failed synthesis = lost corrections (marked done, rules never made). | Wrap in SQLite transaction; don't mark synthesized until rules are confirmed persisted. |
| Dual artifact generators | P2 | Rust (`export_writing_rules`) and MCP (`autoExportWritingProfile`) both generate `writing-rules.md` and `writing_guard.py` independently. Same intent, duplicated formatting logic, structural drift risk. | Single writer: MCP mutations trigger Rust export command. Or: golden parity test ensuring both produce identical output for same fixture data. |
| Enforcement coverage undefined | P2 | Only `kill-words` and `ai-slop` categories auto-enforce via guard hook. Other categories (tone, structure, voice-calibration) are advisory with no defined policy about what *should* be enforced. | Define explicit enforcement policy. Consider signal-driven severity: signal_count drives enforcement strength automatically (1-2 = guidance, 3-5 = soft gate, 6+ = hard gate). User behavior classifies severity, not manual tagging. |
| Editorial rules in 3-6 places | P2 | Same rules exist in `~/.claude/CLAUDE.md`, `~/.claude/rules/editorial.md`, `~/.margin/writing-rules.md`, `KILL_WORDS.md`, `AI_TELLS.md`, and `rules.json`. No sync. Already drifted. | Margin DB is source of truth. `editorial.md` auto-generated on export. CLAUDE.md defers. Reference files generated or retired. See PIPELINE-AUDIT.md §7, §10. |
| Guard hook nearly empty | P1 | `writing_guard.py` has `KILL_WORDS = []` and 1 slop pattern. The enforcement layer works but catches nothing. | Seed kill-words into DB. Populate slop patterns from must-fix rules with before/after examples. |
| Unclassified corrections pollute profile | P2 | Corrections without polarity set end up in "Unclassified" section. | Filter for `polarity IS NOT NULL` in profile export. |

**Additional hardening:**
- MCP schema parity: `SCHEMA_SQL` in `mcp/src/db.ts` must match Rust migrations mechanically. Schema drift has already caused a bug (`reviewed_at` column missing in test DB).
- `synthesized_at` semantics: MCP tools ignore this field, re-reading full correction history every time. Enforce the semantics or remove the field.
- Retire `word_guard.py`: merge its single banned word into DB, one guard hook not two.
- `reviewed_at` needs MCP write path: agents synthesizing rules via MCP can't mark them reviewed.

**Success signal:** Zero pipeline data loss. All corrections entering synthesis produce corresponding rules. Rust and MCP artifact outputs identical for same input. Editorial rules exist in exactly one place (Margin DB) with generated artifacts downstream.

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

**Friction reduction that accelerates loading (from PIPELINE-AUDIT.md Layer 2):**
- **Auto-classification from context:** Polarity and writing type inferred from gesture + document metadata. If you cross out a word, that's corrective polarity. If the document is tagged as `cover-letter`, the correction inherits that type. Manual tagging becomes a fallback, not the default.
- **Continuous synthesis for common cases:** When a correction matches an existing rule exactly, increment signal_count automatically — no manual synthesis step needed. Novel patterns still surface for review.
- **Context-aware rule loading:** Agent detects writing type from task and loads only the relevant subset. Cover letter rules fire for cover letters, not for text messages. This is the difference between a generic style guide and a context-aware voice model.

**Success signal:** Voice profile that feels like a genuine editorial fingerprint — specific to your voice, not a generic style guide. Adversarial compliance score improves measurably from Priority 1 baseline. Loading velocity increases as friction decreases (auto-classification and continuous synthesis reduce the manual work per correction).

---

### Priority 4: Platform Decision

**Goal:** Commit to Tauri or Swift as the long-term implementation.

**Why fourth:** The platform choice depends on whether the loop requires editor-level AI features. Priority 1 answers that.

**The question is simple:** Does the writing quality system need the AI to edit documents *inside* Margin? Or does the AI write elsewhere (Claude Code, chat) and the voice profile travels to that context?

| If... | Then... |
|-------|---------|
| AI writes elsewhere, profile travels via MCP/clipboard/hooks | **Swift.** The app only needs to be a fast annotator. NSTextView is fine. 2 deps, 1 language, 15MB binary. 5-7 day gap to close (floating toolbar, text anchoring wiring, tab drag, TOC). |
| AI writes inside Margin (inline suggestions, tracked changes, AI editor) | **Tauri.** TipTap's extension system supports Content AI, tracked changes, agent editing. NSTextView can't match this. 50+ deps but justified. |
| Unsure | Stay on Tauri until Priority 1 clarifies the interaction model. Don't migrate speculatively. |

**New consideration from pipeline audit (Layer 2 — in-place rewrite):** The UX north star calls for corrections to immediately fix the paragraph you're looking at, not just persist for future drafts. If this is in scope, it means Margin needs to call Claude to rewrite corrected paragraphs — making Margin an AI writing surface, not just a reading surface. This significantly favors Tauri (TipTap content AI, tracked changes) and weakens the Swift case. The platform decision should weigh this: is in-place rewrite a core UX requirement or a nice-to-have?

**Current assessment:** The writing quality system works through enforcement hooks and voice profiles that travel to Claude's context, not through in-editor AI features. This points toward Swift. But in-place rewrite changes the calculus — if frictionless feedback requires the corrected paragraph to be rewritten immediately, the app needs AI editing capabilities. Assessment should come from Priority 1 data and UX testing, not speculation.

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
1. **Problem:** AI writes generic content. You correct it. You correct the same things again. The feedback never compounds.
2. **Insight:** Every correction is training data. The missing piece is the feedback UX — no tool captures structured feedback at the point of reading and routes it back to AI in a way that persists and compounds.
3. **Solution:** Margin captures corrections in the most natural gesture (highlight + annotate), infers context automatically, synthesizes into scoped rules, enforces across every surface where AI writes.
4. **Result:** Correction rate dropped from X to Y per document. The goal isn't zero corrections forever — voice evolves. The goal is zero *repeated* corrections.

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

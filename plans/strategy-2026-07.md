# Margin — Strategy 2026-07 (v2)

_Written 2026-07-05 by the portfolio-CEO session; revised same day after Sam's correction: **"Margin is too broken to send — it was built with old models."** v1 of this doc ordered distribution before any code; that assumed a send-ready artifact. Sam, the only daily user, says it isn't one. Sending a broken app would burn the two best validators on a bad first impression, so the plan is now repair-first — with hard fences so the repair doesn't become another 90-day build hole. Blind-challenger verdicts (seed-VC, GTM) from v1 still bind everything downstream of "sendable."_

## Positioning (unchanged)

**One-sentence wedge:** Margin is the only writing tool where your corrections become enforceable rules — every edit teaches the system a pattern it mechanically blocks forever, instead of a preference an AI forgets next session.

## Who the user is (unchanged)

1. **Claude Code power users who write** — live in the plugin marketplace, install things, don't read announcements.
2. **Two named PM friends who write** — validators, not a market. They get one first impression; that's why we don't send broken.

## The strategic decision (recorded, v2)

**Repair to a send-ready bar with current-model leverage, then distribute — on a clock.** Three fences keep this honest:

1. **Repair ≠ rebuild.** The fix targets a checklist (below), not a re-architecture. "Built with old models" justifies fixing what old-model code got wrong; it does not authorize a rewrite. Any proposal that touches architecture bounces to a foundry decide.
2. **Fable specs, Codex executes.** Per the routing policy: the repair runs as spec-file handoffs to Codex (GPT-5.5) with verification commands and bounce-back triggers, reviewed by a fresh session against the spec. Sam's hours stay on judgment, not typing.
3. **The case study does not wait for the repair.** It rides the existing personal-site branch now. Its honest arc got *better* with this correction: "built with 2025 models, used daily for a year, and the gap between what it is and what current models make possible is itself the story."

## The send-ready bar (the checklist that ends the repair)

Margin is sendable when, on a fresh machine (or clean `~/.margin`):

1. Install from the GitHub release → app opens, no crash
2. Open a real document → read + annotate without data loss
3. Make a correction → it syncs into the rules pipeline (`margin export profile` reflects it)
4. A 30-minute real session completes with zero crashes and zero lost annotations
5. Whatever Sam names as his top-3 daily-driver breakages — fixed (list pending from Sam; this is the input only he has)

Nothing else gates the sends. Polish beyond this bar is post-first-user work.

## Next 3 concrete moves

1. **Sam names the top-3 breakages** (one message; he's the only person with this data). Meanwhile an automated health baseline (typecheck + test suite) runs to catch repo-level rot.
2. **Fable writes the repair spec** (`plans/repair-spec-2026-07.md`): checklist items → tasks with verification commands, discard conditions, and the no-re-architecture fence. Codex executes; fresh-context review gates each return.
3. **The moment the checklist is green: the two DMs go out** (drafts already written, in the 2026-07-05 session log; regenerate against the shipped version). Week after: rules-engine plugin packaging for the Claude Code marketplace, one time-boxed session (GTM verdict, unchanged).

## 90-day roadmap (every milestone names who sees it)

| Window | Milestone | Who sees it |
|---|---|---|
| Days 1–3 | Top-3 breakage list + health baseline + repair spec | Sam approves the spec |
| Days 4–21 | Codex repair sessions until checklist green (time-boxed: ~4 sessions max) | Fresh-context review sessions; Sam sees before/after |
| Days 8–30 | Margin case study published from existing branch — independent of repair | Hiring managers via applications; named contacts via direct links |
| Checklist green + 7 days | Two DMs sent | The two named PM friends |
| +14 days | Rules-engine plugin on the Claude Code marketplace | Strangers searching the marketplace |
| Day 60 (2026-09-03) | Decision checkpoint: any external session? | Sam + foundry ledger |

## Kill / park criteria (the clock)

- **Not send-ready by 2026-08-15 → convert to portfolio artifact.** The case study ships regardless and can honestly frame v1 as "what 2025 models could do" with the Fable-era version as a stated sequel. Conversion remains a legitimate outcome, not a failure.
- **Repair scope grows past the checklist → force a foundry decide.** The tell is any task that can't cite which checklist item it serves.
- **Checklist green but DMs not sent within 7 days → portfolio artifact, automatic.** At that point "broken" is no longer the reason, and the act-then-contract logic from v1 resumes with full force.
- **Zero external sessions by 2026-09-03 → portfolio artifact.**

## Enhancement roadmap (added 2026-07-05, on Sam's ask)

The feature fence stands, but it was always a sequencing device, not a permanent ban. Enhancements unlock in order as milestones clear — each horizon is gated by the one before it, so building can't re-become the avoidance channel.

**Horizon 0 — now, fence-compatible (data, not app code):**
- **Rules corpus cleanup.** The 293 rules were synthesized by older models and carry known defects (verbatim correction notes as "rules," near-duplicates, at least one inverted example pair, and the napkin's own `rule_too_vague` findings). A read-only audit is running (`reports/rules-quality-audit-2026-07.md`); applying it produces a smaller, sharper rule core — the single highest-leverage quality improvement available, zero app-code risk. Apply after Sam skims the report.

**Horizon 1 — after the repair checklist is green AND the two DMs are sent:**
- **Capture-time rule intelligence.** Today a correction becomes a good rule only after weekly batch machinery (GEPA/DSPy pipelines built to compensate for weak models — 52%→72% pass rates for months of effort). A current-model call at capture time can do in one shot what the batch pipeline approximates: classify the correction, extract the generalizable rule, write clean before/after examples, and dedupe against the existing corpus. This obsoletes most of `mcp/scripts/` complexity rather than adding to it.
- **LLM judge for enforcement quality.** The napkin's own conclusion: the mechanical proxy catches 41% of violations and "the remaining 59% needs LLM judge." Swap the proxy for a strong-model judge in the compliance path.

**Horizon 2 — after the first external user completes a session:**
- **Answer the margins.** The strongest feature evidence Margin has ever produced: Sam was already writing prompts and requests into margin notes against the grain of the data model (the NOT-FEEDBACK corrections). The repair makes `prompt` a first-class intent; the enhancement is responding to them — an AI that answers questions asked in the margin of the document, in place. This is the headline feature of the Fable-era Margin and the natural second act of the case study.
- **Marketplace plugin deepening** based on whatever the first external users actually ask for.

Explicitly not on any horizon: mobile, collaboration, cloud sync, themes, or any surface expansion. The wedge is corrections-to-rules; every enhancement above sharpens the wedge.

## Case-study angle (upgraded by the correction)

The arc now has three honest beats instead of two: built a 240-rule writing-quality system with 2025-era models and used it daily for a year; the kill criterion fired before the first DM ever went out (the 55:1 pattern, named); and the capability jump to current models exposed how much of the codebase was model-era scaffolding — with the repair itself run as spec-driven delegation to a cheaper executor. That last beat is a working demonstration of exactly the player-coach, agent-orchestration story AI-native hiring managers are trying to hire for. Write it that way.

# Margin Repair Spec — July 2026

_Written 2026-07-05 by the portfolio-CEO session after a live dogfood of the dev app (v1.16.2) plus DB forensics on `~/.margin/margin.db`. This is the execution packet for the repair phase defined in `plans/strategy-2026-07.md` (v2). Executor: Codex or a Claude session, cold context — everything needed is in this file. Work on branch `fix/loop-repair-2026-07`. Never commit to main. Never `git add -A`._

## Diagnosis summary (evidence, not vibes)

The DB timeline shows the core loop (read → highlight → note → correction) **died in late March 2026**: last correction 2026-03-22, last highlight/note 2026-03-30, while documents kept being opened (June 26) and the rules pipeline kept exporting (July 3+). Sam's verdict "too broken" decodes into three loop-severing defects, all verified live on 2026-07-05:

**What works (verified — do not churn here):** highlight create/render/persist; margin note create/persist; Cmd+S file save to disk; Cmd+Shift+E export mechanically creates correction rows + jsonl; typecheck, 287 frontend tests, and full cargo test suite all green; Go CLI `margin export profile` works from a shell.

## P0-1: Notes have no intent — everything becomes a "correction"

**Evidence:** the final corrections before the loop died (2026-03-21) all carry notes hand-prefixed `"NOT FEEDBACK, A REQUEST/PROMPT: ..."` in caps. Sam was using margin notes to talk to the AI (research requests, questions, prompts) and the export pipeline force-ingested every noted highlight as a writing-style correction. He fought the data model until he quit using the loop entirely the next week.

**Fix (taxonomy is decided — executor implements, does not redesign):** every note/noted-highlight gets an `intent` with exactly three values:
- `correction` (default) — editorial feedback; flows to corrections on export as today
- `note` — a thought for the reader/self; **excluded** from corrections export
- `prompt` — a request/instruction for AI; **excluded** from corrections export, written to a separate `~/.margin/corrections/prompts-YYYY-MM-DD.jsonl` sidecar so it's not lost

Mechanics: (a) intent selector in the note popover (three small toggle chips, `correction` preselected); (b) intent column on `margin_notes` via migration, defaulting existing rows to `correction`; (c) export flow filters by intent; (d) the export popover summary line reports the split ("2 corrections, 1 prompt skipped").

**Verify:** new Rust test: export with mixed-intent notes creates correction rows only for `correction` intent. New frontend test on the export input builder. Manual: create three notes with the three intents, Cmd+Shift+E, confirm corrections table gains exactly one row.

## P0-2: Note flow creates empty/whitespace highlights → garbage corrections

**Evidence:** live repro. Double-click a word → toolbar appears → click the note (rightmost) button → the created highlight was `text_content = " "` (one space), from_pos 463 to_pos 464 — not the selected word. The note attached to that whitespace highlight; on export the correction row had **empty original_text** — unusable by rule synthesis, and invisible to the user that it's broken.

**Fix, both layers:**
1. Frontend: the note-button path must capture the selection range at mousedown (before the click can collapse/shift the selection), same as the color-swatch path evidently does (the swatch path captured 331 chars correctly). Root-cause the divergence between the two paths.
2. Backend guard: reject (or repair-and-log) highlight creation where `trim(text_content)` is empty; reject correction insert with empty `original_text`. Surface rejection as a visible toast, not a silent no-op.

**Verify:** Rust test: `create_highlight` with whitespace-only text errors. Frontend test: note-button flow passes the same range the swatch flow does. Manual repro of the double-click → note sequence produces a highlight with the selected word.

## P0-3: Rules export fails silently in the production app (PATH bug)

**Evidence:** `src-tauri/src/commands/writing_rules.rs:730` — `std::process::Command::new("margin")` resolves via PATH. GUI-launched macOS apps get the minimal launchd PATH without `~/.local/bin`, so in the production Margin.app every auto-export after corrections has failed since this shipped. The frontend wraps it in `exportWritingRules().catch(console.error)` (App.tsx ~line 1064) — invisible. Also verified in dev: writing-rules.md was not refreshed by the 16:56 correction persist even with a good PATH — root-cause this during the fix (may be the same swallow, may be a second bug).

**Fix:**
1. Resolve the CLI by absolute candidates in order: `$HOME/.local/bin/margin`, `which margin` via login shell fallback, then error.
2. Replace the silent `.catch` with the existing ErrorToast surface ("Writing rules export failed: ...").
3. Append failures to `~/.margin/margin-app.log` so the next debugging session has evidence.

**Verify:** Rust test for the resolver (missing binary → typed error). Manual: `PATH=/usr/bin:/bin target/debug/margin` (env-stripped run) still exports rules after a correction persist; break the resolver deliberately and confirm the toast shows.

## P1 (fix after all P0s are verified; stop here if time-boxed out)

- **P1-1 Note popover modality:** Escape does not close the notes popover, and while open it swallows clicks meant for the document (verified live — an escape + double-click + type sequence went entirely into the popover). Esc closes; click-outside closes.
- **P1-2 Note popover dual-field confusion:** on open, the visible caret sits in one field while typed text lands in another (verified live). One field, focused, caret visible.
- **P1-3 Export discoverability:** the loop's linchpin (Cmd+Shift+E) has no visible affordance in the reading surface. Cheapest fix consistent with the minimal UI: when ≥1 unexported noted highlight exists, show a subtle count pill that opens the export popover on click. Do not build a toolbar.

## Decisions the executor may NOT make

- No re-architecture: no state-management change, no editor swap, no schema redesign beyond the migrations named above.
- No new features beyond this spec (the 90-day feature fence in strategy-2026-07.md is absolute).
- No changes to rule-synthesis logic, eval architectures, or anything under `mcp/scripts/`.
- The intent taxonomy is fixed at the three values above — naming and UI copy included.
- Nothing ships to main without the quality gates: `cargo check && cargo test && pnpm tsc --noEmit && pnpm test` all green.

## Bounce-back triggers (return to the orchestrating session instead of guessing)

- The P0-2 selection divergence turns out to require TipTap extension surgery beyond ~a day of work
- Any fix requires touching the high-collision files in ways that conflict with open branches (`src-tauri/src/lib.rs`, `src/App.tsx`, `src/lib/tauri-commands.ts` — check `git branch -a` first)
- The dev-mode rules-export failure (P0-3, second thread) root-causes to something outside the export path

## Discard condition

If after 2 sessions the P0 fixes aren't verifiable, stop and report — the strategy's 2026-08-15 hard stop converts Margin to portfolio-artifact status, and that outcome is acceptable. Do not death-march.

## Review rubric (for the fresh-context return gate)

1. Each P0 has: failing-test-first evidence, the fix, and a passing verification command output.
2. The live manual repro from this spec (double-click → note → export) now produces a correct correction row.
3. `git diff` touches nothing outside the named surfaces; no drive-by refactors.
4. All four quality gates green; diff is human-readable and small enough to review in one sitting (risk class: personal-tool data path — medium; no auth/money/network surfaces touched).

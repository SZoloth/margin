# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Validate the Margin-to-Vale adapter against 30 real documents on branch `feat/distribution-finetuning-research`.

### Outcome

The experiment selects 30 distinct private Markdown documents, compares raw-regex and Vale diagnostics, and produces a private review packet plus a text-free aggregate report.

### Constraints

- Keep implementation under `experiments/vale-adapter/` with no production imports.
- Keep all document paths, text, and excerpts under `~/.margin/experiments/`.
- Do not count correction history or an absent correction as a current alert label.
- Keep SQLite immutable and verify its hash before and after each read.
- Run the standard verification gate, stage only this lane's files, commit, and push.

### Steps

1. Audit readable documents and correction-label coverage.
2. Add privacy, selection, catalog-loading, and aggregate-report tests.
3. Run both evaluators on 30 deterministic documents.
4. Fix real-corpus compatibility and scope failures with regression tests.
5. Generate and validate the private review packet, record the decision, verify, commit, and push.

### Boundary

The original Codex worktree switched mid-run to `feat/two-pillar-product` and gained unrelated edits in `PLANS.md` and the editor toolbar test. Validation moved to this fresh worktree at commit `5d21194`. The only untracked test created in the other worktree was removed; its concurrent files were left untouched. This lane changes only the isolated experiment, its package script, and this plan.

### Decisions

- Margin's database remains authoritative. Vale projects exist only in temporary directories.
- General rules apply to every run. Writing-type rules join the active style only for their matching type.
- Vale diagnostics map back to Margin rule IDs so evaluation output preserves provenance.
- Correction history enriches sampling but does not label current alerts.
- The adapter remains optional until Sam adjudicates the private alerts and Vale shows a precision gain without recall loss.

### Results

- Thirty distinct Markdown documents were selected from 55 readable catalog files. Six selected files had correction history.
- Raw regex and the final Vale adapter each returned 25 document-rule alerts and agreed on every alert.
- The private review packet contains 25 unlabeled judgments. The promotion gate remains pending.
- Two consecutive runs produced the same review-packet SHA-256.
- The live database SHA-256 remained `e71e26e771432babbd96978d4d77d9b399143988df5bd83048019feb910248d3`.

### Surprises

- A `blog` document failed because the compiler enabled an empty writing-type style. The compiler now enables only populated styles.
- Vale text scope hid the Markdown syntax targeted by the inline-header bullet rule. Markup-targeting patterns now use raw scope, restoring the five missed alerts.

### Verification

- Fifteen Vale adapter tests pass across five files.
- Strict adapter and application TypeScript compilation pass.
- The private 30-document run completes twice with identical review output and an unchanged SQLite hash.
- The audience-perspective receipt for the private judgment packet passes validation.
- `MCP_NODE_BIN=/opt/homebrew/Cellar/node@22/22.23.1/bin/node scripts/verify standard` passes, including 292 frontend tests, 18 post-training tests, 15 adapter tests, the production build, 184 MCP tests, MCP TypeScript, and the gap audit.

### Handoff

Keep Vale optional. The run proves deterministic parity on this corpus and does not show enough gain to add a production dependency. Private text remains outside Git.

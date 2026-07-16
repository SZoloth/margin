# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Research and specify Margin's post-training writing-model lane on branch `feat/distribution-finetuning-research`.

### Outcome

Margin has a source-backed decision packet covering live data readiness, a six-condition experiment, loss definitions, compute, evaluation, promotion gates, and a collision-free first implementation unit.

### Constraints

- Keep this checkpoint documentation-only.
- Read the live database through SQLite read-only mode.
- Do not copy, edit, stage, or interpret Claude's uncommitted files in the main checkout.
- Mark every proposed Rosmine mechanism as an inference.
- Keep `plans/pipeline-strategy-2026-07.md` as the strategy source of truth and link its research packet.
- Run `scripts/verify standard`, stage only this lane's files, commit, and push.

### Steps

1. Verify the supplied public sources and separate facts, inferences, and proprietary unknowns.
2. Audit the live database and existing evaluation harness.
3. Define capture requirements, six experimental conditions, loss computation, compute, evaluation, and promotion gates.
4. Record the boundary around concurrent main-checkout work.
5. Save the research packet and strategy decision.
6. Run verification, commit, and push.

### Decisions

- Pursue capture and evaluation now. Adapter training waits for complete, provenance-safe examples.
- Use cover letters as the first register because 122 of 258 corrections carry that writing type.
- Use Qwen3-4B-Instruct-2507 for the first experiment.
- Margin rules remain the production memory and control layer through the experiment.
- The first implementation unit is an offline, read-only dataset and evaluation contract under `experiments/post-training/`.
- Use Sam's funded Fireworks account for hosted generation and standard SFT/DPO after a no-spend capability probe. Keep D/F on self-managed CUDA because the documented custom callback lacks full-vocabulary logits.

### Surprises

- The live database still has 258 corrections and now has 284 rules.
- All 258 corrections have empty `suggested_edit`, `rationale`, `accepted_at`, and `feedback_type` fields.
- Polarity is more complete than the March audit: 134 corrective, 7 positive, and 117 unset.
- The main checkout contains overlapping uncommitted evaluation work under `mcp/scripts/`; this lane did not inspect or change those files.
- The required `.claude/napkin.md` file is absent in this worktree.
- Fireworks supports managed LoRA SFT and DPO for Qwen3 models. Its custom Training API is in private preview and currently returns target-token log probabilities to custom losses, which cannot express D or F as specified.

### Verification

- `MCP_NODE_BIN=/opt/homebrew/Cellar/node@22/22.22.2_2/bin/node scripts/verify standard` passes.
- The gate covered TypeScript, 292 frontend tests, the production build, 184 MCP tests, MCP TypeScript compilation, and the harness gap audit.
- A fresh-worktree setup required `pnpm install --frozen-lockfile` and rebuilding the workspace-local `better-sqlite3` native binding before the unchanged MCP suite could run.

### Handoff

Research packet is in `docs/research/post-training-writing-model-2026-07.md`. The strategy decision is recorded in `plans/pipeline-strategy-2026-07.md`. No production code or private corpus data changed.

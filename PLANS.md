# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Implement Margin's offline post-training dataset and evaluation contract on branch `feat/distribution-finetuning-research`.

### Outcome

Margin has a tested, read-only experiment package for capture eligibility, leakage-safe splits, deterministic metrics, evaluation manifests, database readiness audits, and no-spend Fireworks capability checks.

### Constraints

- Keep the implementation under `experiments/post-training/` with no production imports.
- Read the live database through SQLite immutable read-only mode and fail when a non-empty WAL is present.
- Do not copy, edit, stage, or interpret Claude's uncommitted files in the main checkout.
- Keep private prompts, documents, and outputs outside Git.
- Make the Fireworks probe read-only and prevent it from launching paid jobs.
- Run `scripts/verify standard`, stage only this lane's files, commit, and push.

### Steps

1. Add synthetic fixtures and failing contract tests.
2. Implement capture validation and training-export eligibility.
3. Implement document-grouped chronological splits and duplicate checks.
4. Implement deterministic metrics and frozen evaluation manifests.
5. Implement the read-only database auditor and Fireworks capability probe.
6. Wire the isolated suite into standard verification, document it, commit, and push.

### Decisions

- Corrective spans and imported correction text cannot become positive training finals.
- A document group belongs to one split, and the locked test partition is chronological.
- Exact or near-duplicate finals cannot cross splits.
- Fireworks model metadata must prove source and revision parity before managed SFT or DPO is allowed.
- Conditions D and F remain blocked on Fireworks because its documented custom callback lacks full-vocabulary logits.
- The existing autoresearch directory remains untouched. Its loop can consume these manifests in a later unit.

### Surprises

- The Fireworks API key is not present in this worktree's environment, so the live probe recorded missing credentials and made no request.
- Fireworks' model endpoint exposes a Hugging Face URL but may omit a pinned revision. The probe fails closed without separate revision evidence.
- SQLite immutable mode can ignore uncheckpointed writes. The auditor rejects a non-empty WAL before reading.
- The live audit reproduced 258 corrections, 284 rules, and zero populated training-pair fields without changing the database SHA-256.

### Verification

- Eighteen post-training tests pass across six files.
- Strict post-training TypeScript compilation passes.
- The live immutable audit left SHA-256 `aeaf190786d50def088f00f28104132afb23af1421eef8973c0c568a09eefcdc` unchanged.
- `MCP_NODE_BIN=/opt/homebrew/Cellar/node@22/22.22.2_2/bin/node scripts/verify standard` passes.
- The full gate covered root and experiment TypeScript, 292 frontend tests, 18 post-training tests, the production build, 184 MCP tests, MCP TypeScript, and the harness gap audit.

### Handoff

The implementation lives under `experiments/post-training/`. No production code, production schema, existing autoresearch file, or private corpus data changed. The next product action is collecting complete prompts, source packets, drafts, and Sam-approved finals until the 20-document evaluation floor is met.

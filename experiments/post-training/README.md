# Post-Training Experiment Contract

This directory holds Margin's offline data and evaluation contract. It has no production imports and does not write to the Margin database. Private prompts, documents, and model outputs belong under `~/.margin/experiments/post-training/`.

## Included

- Versioned JSON Schemas for complete capture records and frozen evaluation manifests.
- Training-eligibility checks that keep corrective spans out of positive targets.
- Document-grouped, chronological splits with exact and near-duplicate checks.
- Deterministic token n-gram, repetition, length, and factual-constraint metrics.
- An immutable SQLite auditor that emits counts and ID hashes without corpus text.
- A Fireworks capability probe that uses model-inspection GET requests and never launches a job.

## Commands

Run the isolated checks.

```bash
pnpm test:post-training
pnpm typecheck:post-training
```

Audit the live database without writing to it.

```bash
pnpm post-training:audit -- --db /Users/samzoloth/.margin/margin.db
```

Validate a capture record.

```bash
pnpm post-training:validate -- --file experiments/post-training/fixtures/eligible-example.json
```

Probe a Fireworks model after setting `FIREWORKS_API_KEY`. The expected revision must appear in Fireworks' model metadata. Missing revision evidence blocks managed training.

```bash
pnpm post-training:fireworks -- \
  --model accounts/fireworks/models/qwen3-4b \
  --expected-hf https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507 \
  --expected-revision <pinned-revision>
```

The probe records custom Training API access as `unverified` and blocks conditions D and F because Fireworks' documented callback exposes target-token log probabilities instead of full-vocabulary logits.

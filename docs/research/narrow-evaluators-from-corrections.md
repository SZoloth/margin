# Narrow Evaluators from Correction History

Design for `SAM-161`. How Margin's correction corpus becomes a set of narrow,
debuggable evaluators that plug into the existing compliance/adversarial
pipeline.

## Why narrow evaluators

The current compliance check is deterministic (kill words, slop patterns,
structural tells) plus one broad optional LLM audit. The 2026-09-12 poolside
baseline shows the limits: coached output gained +5.8 dimension points but
regressed on slack (-4) — prose-tuned rules hurt terse casual writing, and a
single broad audit can't tell you *which* judgment was violated. Danny Aziz's
judge-building pattern (SAM-158 research): small judges trained on explicit
thumbs-up/down + rationale outperform long handcrafted prompts. Margin already
stores exactly that shape: polarity, notes, category, writing_type, and the
corrected text.

## Data model (already exists)

`corrections`: `original_text`, `notes_json`, `category`, `writing_type`,
`polarity` ('positive'|'corrective'), `prefix_context`/`suffix_context`,
`document_source`, `document_path`.

`writing_rules`: `category`, `severity`, `polarity`, `signal_count`,
`detection_pattern`, `register`, `source`.

A "label" = corrective correction (this was wrong) or positive correction
(this was right). The note is the rationale. That is a labeled dataset with
no new capture work.

## First five evaluators

| Evaluator | Signal extracted from corrections | Judge form |
| --- | --- | --- |
| `generic-opening` | corrective items on first-paragraph spans flagged as throat-clearing / "get to it" / boilerplate openers | Few-shot judge: 5-8 flagged openings vs 5-8 positive/unflagged openings |
| `overwordiness` | corrections whose accepted edit is materially shorter than `original_text` | Few-shot judge scoring redundancy; deterministic fallback: sentence-length + filler-phrase probes |
| `voice-drift` | positive `voice-sample` corrections + corrective "not me / sounds like AI" notes | Judge comparing passage against voice samples (same polarity labels as data) |
| `structural-repetition` | corrections flagging parallel sentence shapes, template-y transitions, formulaic lists | Judge + deterministic probe (existing structural-tell patterns extended) |
| `register-fit` | per-`writing_type` corrections, especially where a rule helped one type and hurt another (slack regression) | Judge scoring channel-fit given the declared type/register |

## Extraction path

```
SQLite corrections
  → filter: category/notes match evaluator's theme, polarity set, writing_type
  → emit JSONL at ~/.margin/evals/<evaluator>.jsonl
      {text, label: "violation"|"approved", note, writingType, correctionId}
  → each evaluator definition in repo: mcp/evaluators/<name>.json
      {name, version, description, judgePromptTemplate, minExamples}
```

Extraction is a Go CLI subcommand (`margin evals extract <name>`) — CLI is the
single writer for generated artifacts, keeping parity with the existing
artifact rules. `docs/invariants.md` stays authoritative: SQLite truth →
derived JSONL.

## Plug-in points

- `compliance-check.ts --judges`: runs each applicable evaluator on the input,
  reports per-judge score (0-10) + flagged spans. Deterministic checks stay
  primary; judge results are an advisory block in the report, never silently
  merged into pass/fail.
- `adversarial-test.ts`: reports per-judge deltas per type, so "coached vs
  uncoached" decomposes into *which* judgments improved — and catches cases
  like the slack regression where rules help prose but hurt casual text.
- Judges generate through `evalGenerate()` → same `MARGIN_EVAL_CMD`
  provider contract. A judge run with a dead provider reports an error, not
  a zero.

## Guardrails

- Evaluator definitions are versioned files in the repo — diffs are reviewable.
- Deterministic checks remain the pass/fail authority; LLM judges are advisory
  until a judge proves stable across providers.
- Judge outputs cached by content hash — same passage + same evaluator version
  never re-bills a generation.
- Every judge result includes the label distribution it was derived from, so a
  judge built on 3 corrections is visibly weaker than one built on 50.
- `uncertain`/conflicting labels go to a review file (same pattern as the
  SAM-958 Vale review packet) rather than silently picked.

## Failure modes to avoid

- **Judge on thin data**: refuse to activate an evaluator below `minExamples`
  (suggest 8+ labeled items per polarity per type).
- **Provider confound**: score drift between providers is recorded with the
  provider name in the baseline JSON — a poolside baseline is not a claude
  baseline.
- **Silent pass**: an all-failed judge run invalidates the report, matching the
  eval-harness rule that zero-issue output is invalid evidence.

# Post-Training Writing Model Checkpoint

**Date:** 2026-07-16
**Status:** Research checkpoint. No production code or training data changed.
**Decision:** Build capture and evaluation first. Begin adapter training only after the data floor and leakage checks in this packet pass.

## Recommendation

Margin should pursue a writing-model lane as an optional generator behind its existing memory and control system. Rules remain named, scoped, reviewable memory. Complete human finals and draft-to-final pairs become training data. Margin's agent layer keeps prompt preparation, retrieval, factual checks, rule checks, candidate judging, and final selection visible.

Training now would mostly test memorization of rejected snippets. The live database has 258 corrections and 284 rules, but it has no accepted draft-to-final pairs and only seven positive corrections. The first useful checkpoint is a local dataset and evaluation prototype. A 4B adapter experiment starts after Margin has complete, provenance-safe examples in one register.

This lane creates an evidence-gated exception to the current `docs/strat/technical-strategy.md` constraint that the product use only a Claude Code subscription. The production architecture should keep that constraint until an adapter beats rules plus retrieval and ordinary supervised fine-tuning without losing factual accuracy.

## Source Reconstruction

| Source | Confirmed facts | Margin use | Unknown or unsupported |
|---|---|---|---|
| [Rosmine technical report](https://rosmine.ai/2026/05/18/fixing-llm-writing-with-distribution-fine-tuning/) | Rosmine trained Qwen3 Instruct models at 4B, 8B, and 14B on about 185,000 cleaned FineWeb samples and evaluated on 2,000 held-out samples. Qwen3-32B reconstructed prompts, style, and use case. GPT-5-mini produced outlines. Twenty-five percent of training examples omitted an outline. Reported metrics include embedding MMD, token n-gram L2, judge preference, and self-BLEU. All disclosed Distribution Fine Tuning runs used a sequence of LoRA adapters. | Use the evaluation framing and model-family choice. Treat the reported gains as a first-party result worth testing. | The optimizer, differentiable objective, loss weights, batch construction, source code, model weights, seeds, and complete training recipe remain proprietary. Any Margin loss described below is a separate inference. |
| [Deft launch post](https://deftwriting.com/blog/introducing-distribution-fine-tuning) | Deft says its early product uses nearly the same model as the demo and repeats the report's first-party quality gains. | Confirms that the research became a product surface. | The post adds no reproducible training detail or independent validation. |
| [Deft developer documentation](https://deftwriting.com/developers) | API usage identifies prompt preprocessing, Qwen3-14B final-text generation, chunk judging, and post-processing. The API supports generation and rewrite modes and recommends complete documents. | Treat the shipped system as a tuned generator inside a multi-stage writing agent. Margin should compare the adapter and agent as one complete workflow. | Prompts, judge criteria, decoding settings, retry policy, and post-processing logic are undisclosed. |
| [Hacker News comment](https://news.ycombinator.com/item?id=48227152) | A reader proposed The Economist's house style as a plausible corpus-specific use case. | Useful hypothesis for per-register adapters. | Rosmine did not report an Economist experiment or demonstrate house-style transfer. |
| [DEFT arXiv page](https://arxiv.org/html/2604.01787v1) and [authoritative EMNLP 2024 publication](https://aclanthology.org/2024.findings-emnlp.898/) | Zhu et al. construct positive and negative token-frequency distributions from chosen and rejected responses, subtract them into a discrepancy vector, score model average log probabilities against that vector, select a low-reward subset, and add the reward to DPO or PRO. The published experiments used Llama 3 8B and eight A800 80 GB GPUs. | Margin can build the positive distribution from final edits and the negative distribution from rejected drafts. | This paper predates and is unrelated to Rosmine's writing method. Using it for Margin tests a separate preference-learning idea. |
| [Community Gemma experiment](https://huggingface.co/TheZeez/gemma-4-e4b-creative-DFT-exp) | The model card describes an 8B BF16 model trained for about 1.3 epochs with effective batch size 96. Its author says the custom loss used MSE between a batch-level predicted vocabulary distribution and a human target distribution. | Supplies one concrete public approximation to falsify. | The card includes a disclaimer, and no training code, target corpus, ablation, held-out evaluation, or reproducibility evidence was released. It does not reveal Rosmine's method. |
| [Fireworks managed tuning](https://docs.fireworks.ai/fine-tuning/managed-finetuning-intro) and [custom-loss documentation](https://docs.fireworks.ai/fine-tuning/training-api/loss-functions) | Fireworks supports managed LoRA SFT and DPO on listed Qwen3 models. Its private-preview custom Training API runs a local loss callback over target-sequence log probabilities while GPU forward and backward passes run remotely. | Use the funded account for hosted baselines and standard SFT/DPO after a no-spend capability probe. | The documented callback does not expose full-vocabulary logits, so it cannot compute D or F as written. Funding does not confirm private-preview access or an exact mapping to the pinned upstream checkpoint. |

## Live Data Readiness

The audit used SQLite URI `mode=ro&immutable=1` plus `PRAGMA query_only=ON` against `/Users/samzoloth/.margin/margin.db`. No WAL file was present on July 16. A repeated audit left the database SHA-256 unchanged at `aeaf190786d50def088f00f28104132afb23af1421eef8973c0c568a09eefcdc`. The database file was last modified on July 13, and content timestamps show the latest correction was created on March 22.

| Signal | Live value | Consequence |
|---|---:|---|
| Corrections | 258 | Enough for rule retrieval and violation fixtures. |
| Writing rules | 284 | Enough for a frozen rules-plus-retrieval baseline. |
| Non-empty `suggested_edit` | 0 | No draft-to-final SFT pairs. |
| Non-empty `rationale` | 0 | No explicit reason for a preferred edit. |
| Populated `accepted_at` | 0 | No accepted suggestion events. |
| Populated `feedback_type` | 0 | No reliable preference-event taxonomy. |
| Polarity | 134 corrective, 7 positive, 117 unset | Positive reference text is too scarce for a target corpus. |
| Writing type | 122 cover letter, 57 general, 51 blog, 20 outreach, 7 pitch, 1 email | Cover letters are the best-supported first register. |
| Distinct documents and sessions | 25 documents, 65 sessions | Split by document and session to prevent leakage. |
| Exact duplicate spans | 45 duplicate groups, 83 rows beyond the first occurrence | Deduplicate by normalized text hash before any metric or retrieval index. |
| Span size | 133 characters on average; 111 spans under 40 characters | Corrections are local editorial evidence, not complete writing samples. |
| Empty original spans | 6 | Reject during dataset validation. |
| Document metadata | 124 documents, 5 with an author, 0 content snapshots | File presence does not prove Sam authorship or preserve a final revision. |
| Rule metadata | 261 reviewed, 36 with register, 16 with detection patterns | Rules can score and explain outputs, but scope quality still needs validation. |
| Stored evaluation runs | 2, latest March 7, one completed | Current database runs cannot support a model promotion decision. |

### Readiness by condition

| Condition | Ready now | Blocker |
|---|---|---|
| A. Base model | Yes | A locked prompt and source-packet set still needs to be created. |
| B. Base plus Margin rules and retrieved examples | Yes | Freeze rule IDs, correction IDs, retrieval logic, and artifact hashes for each run. |
| C. SFT LoRA | No | Complete prompts, source material, and Sam-approved final documents are absent. |
| D. SFT plus token-distribution loss | No | Condition C data plus a sufficiently large per-register human target corpus is absent. |
| E. DPO | No | Chosen and rejected responses for the same prompt are absent. |
| F. DPO plus the EMNLP DEFT reward | No | Condition E data is absent. Small data also makes the paper's 5% filtering step impractical. |

The current 27-sample autoresearch harness compares prompt architectures and scores rule compliance. Its own experiment log reports high variance, a strong zero-shot result, and an uncalibrated proxy. It should remain a fast regression check. Model promotion needs held-out complete documents, blinded Sam preference, factual preservation, and distribution metrics.

## Capture Contract

Raw writing data stays outside Git under `~/.margin/experiments/post-training/`. Git stores schema, fixtures made from synthetic text, aggregate manifests, and hashes. Private document text, prompts, and model outputs must not enter the repository.

Each complete example needs this logical record before it becomes training-eligible.

```json
{
  "schema_version": 1,
  "example_id": "uuid",
  "document_group_id": "stable-root-id",
  "created_at": "ISO-8601",
  "writing_type": "cover-letter",
  "register": "professional",
  "prompt": "complete assignment",
  "source_material": ["fact or source record"],
  "factual_constraints": ["name", "number", "claim"],
  "draft": {
    "candidate_id": "uuid",
    "text": "model draft",
    "model_id": "provider/model@revision",
    "generation_config": {},
    "rules_snapshot_hash": "sha256"
  },
  "final": {
    "text": "Sam-approved final",
    "author_provenance": "sam_edited_model_draft",
    "finalized_at": "ISO-8601"
  },
  "preference": {
    "chosen_candidate_id": "uuid",
    "rejected_candidate_ids": ["uuid"],
    "rationale": "optional explanation",
    "rule_ids": ["uuid"]
  },
  "training_eligible": true,
  "content_hash": "sha256"
}
```

Eligibility rules are strict.

1. A Sam-approved complete final can become an SFT target when its prompt, source packet, and authorship are known.
2. A draft and its final edit can become a DPO pair only when both answer the same assignment and share the same source packet.
3. A candidate choice can become a DPO pair when the rejected candidate is preserved and the choice happened before labels or model identity were shown.
4. Positive annotations can support retrieval and narrow evaluators. A highlighted span alone cannot stand in for a full response.
5. Margin rules condition generation, select data, score failures, and explain judgments. Rule text is not an SFT completion.
6. Existing corrective `original_text` spans cannot enter the human target distribution. They are text Sam rejected.

### Experimental data floor

These thresholds define only this small pilot.

- Start the evaluation prototype after 20 complete cover-letter assignments have source packets and Sam-approved finals.
- Start C and D after 100 training documents and 20 validation documents pass the schema and deduplication checks.
- Start E and F after 60 training pairs and 15 validation pairs pass content-preservation and factual checks.
- Lock 30 later-date cover-letter assignments after the training cutoff for final evaluation. No rule, example, target distribution, or retrieval index may be derived from these documents.

## Falsifiable Experiment

### Register and model

Use cover letters as the first register because 122 live corrections are tagged `cover-letter`. Use [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) at a pinned revision. It is a 4B, Apache-2.0, non-thinking instruct model from the same family Rosmine studied. The smaller model keeps six conditions tractable and leaves room for clear improvements or failures.

Sam now has a funded Fireworks account. Use it first for hosted generation and for ordinary SFT or DPO if a capability probe confirms an immutable Fireworks base model that maps to the selected upstream revision. [Fireworks managed fine-tuning](https://docs.fireworks.ai/fine-tuning/managed-finetuning-intro) currently lists `qwen3-4b` and `qwen3-8b` as tunable models, supports managed LoRA SFT and DPO, and accepts OpenAI-compatible JSONL. Record the Fireworks model resource, job configuration, dataset hash, and returned checkpoint identity.

Conditions D and F still require a self-managed CUDA path. Fireworks' [custom Training API](https://docs.fireworks.ai/fine-tuning/training-api/introduction) is in private preview and its [documented loss callback](https://docs.fireworks.ai/fine-tuning/training-api/loss-functions) exposes per-token log probabilities for the supplied target sequence, not the full vocabulary logits required by the batch distribution loss or the full discrepancy vector. Account funding does not establish private-preview access. Run D and F with 4-bit NF4 QLoRA on a Linux NVIDIA host with one A100 80 GB GPU unless Fireworks adds a full-logit primitive. The local M4 Mac with 32 GB memory can build datasets, run deterministic metrics, drive hosted jobs, and review outputs.

Do not mix model checkpoints within a comparison. If Fireworks cannot prove parity with the pinned upstream model through model metadata plus a fixed-token log-probability probe, run A through F on the self-managed stack and use Fireworks only for serving candidates after training.

Training settings are frozen across comparable arms.

- LoRA rank 16, alpha 32, dropout 0.05, bias `none`, target modules `all-linear`.
- Sequence length 1,024, response-only loss, no cross-document packing.
- Physical batch 4, distribution group 32, length-bucketed shuffle, fixed data order and seed.
- Two epochs, learning rate `1e-4`, cosine schedule, 3% warmup, BF16 compute.
- C and D start from the same base revision and LoRA initialization.
- E and F start from the selected C checkpoint and use identical DPO settings.
- Every run records package locks, model revision, tokenizer revision, dataset hash, split hash, seed, and Git commit.

### Conditions

| ID | Generator |
|---|---|
| A | Frozen base model with the task prompt and source packet. |
| B | Frozen base model with type-scoped Margin rules and retrieved training examples. Retrieval sees the training split only. |
| C | Ordinary SFT LoRA trained on Sam-approved complete finals. |
| D | C's setup with the differentiable batch token-distribution loss below. |
| E | DPO initialized from C and trained on content-preserving chosen/rejected pairs. |
| F | E's setup with the unrelated EMNLP DEFT discrepancy reward below. |

### Token-distribution approximation for D

For vocabulary size \(V\), build a frozen target \(q \in \mathbb{R}^{V}\) from response tokens in training-set human finals for the cover-letter register.

\[
q_v = \frac{c_v}{\sum_{u=1}^{V} c_u}
\]

For a physical batch, let \(z_{b,t,v}\) be teacher-forced logits and \(m_{b,t}\) mark response positions. Prompt, padding, and special control tokens have mask zero.

\[
p_{\text{batch},v} =
\frac{\sum_{b,t}m_{b,t}\,\operatorname{softmax}(z_{b,t})_v}
{\sum_{b,t}m_{b,t}}
\]

\[
L_{\text{token}} = \sum_{v=1}^{V}(p_{\text{batch},v}-q_v)^2
\]

\[
L_D = L_{\text{SFT}} + \lambda L_{\text{token}}
\]

Set \(\lambda\) once from eight fixed training-only calibration groups. Compute gradient norms with respect to LoRA parameters and choose \(\lambda = 0.1\,\operatorname{median}(\lVert g_{\text{SFT}}\rVert)/\operatorname{median}(\lVert g_{\text{token}}\rVert)\). This makes the auxiliary gradient about 10% of the SFT gradient at initialization. Abort a run if its moving median exceeds 30% or if validation diversity collapses.

Gradient accumulation over independent microbatch losses would optimize the mean of eight four-document distances, which differs from the declared 32-document distance. Use a two-pass distribution group. The first pass computes \(p_{\text{batch}}\) without retaining activations. The second pass recomputes each microbatch, accumulates SFT gradients, and applies the exact first derivative of the group loss before one optimizer step. Softmax sums should be chunked over response positions to bound FP32 memory.

```python
with torch.no_grad():
    prob_sum, token_count = 0, 0
    for micro in distribution_group:
        logits = model(**micro).logits[:, :-1, :]
        mask = micro["labels"][:, 1:].ne(-100)
        prob_sum += masked_softmax_sum(logits, mask)  # chunk response positions
        token_count += mask.sum()
    p_group = prob_sum / token_count
    coefficient = (2 * (p_group - q_target) / token_count).detach()

optimizer.zero_grad()
for micro in distribution_group:
    outputs = model(**micro)
    logits = outputs.logits[:, :-1, :]
    mask = micro["labels"][:, 1:].ne(-100)
    micro_prob_sum = masked_softmax_sum(logits, mask)
    token_surrogate = (coefficient * micro_prob_sum).sum()
    sft_weight = mask.sum() / token_count
    (outputs.loss * sft_weight
     + lambda_token * token_surrogate).backward()
optimizer.step()

logged_token_loss = ((p_group - q_target) ** 2).sum()
```

This objective sees teacher-forced next-token probabilities. Deployment uses free rollouts, so improved training loss may fail to improve generated-text distributions. MMD and n-gram distance are computed on free generations to catch that failure. A sparse personal corpus may also push rare vocabulary toward zero. The initial run keeps the full-vocabulary objective so the hypothesis stays clear; a frequent-token-plus-other-bucket variant becomes a separate experiment only if D fails through vocabulary collapse.

### Discrepancy reward for F

Build normalized token distributions \(q^+\) from chosen finals and \(q^-\) from rejected drafts, using training pairs only.

\[
d = q^+ - q^-
\]

For a response of length \(T\), average model log probabilities over response positions for each vocabulary token.

\[
\bar{\ell}_v = \frac{1}{T}\sum_{t=1}^{T}\log p_\theta(v\mid x,y_{<t})
\]

\[
R_d = \sum_{v=1}^{V}d_v\bar{\ell}_v
\qquad
L_F = L_{\text{DPO}} - \omega R_d
\]

Calibrate \(\omega\) with the same 10% initial gradient-norm rule used for D. Apply \(R_d\) to the chosen response's teacher-forced prefixes. This mapping from final edits into the published reward is a Margin adaptation. The pilot omits the paper's lowest-reward 5% filtering because 60 pairs would leave only three examples. F tests only the reward term and carries no replication claim.

### Batching and leakage controls

- Split by `document_group_id`, then by time. No document, revision, correction span, or paraphrase crosses a split.
- Deduplicate normalized text and near-duplicates before splitting. Record all removed hashes.
- Compute target distributions, discrepancy vectors, retrieval indexes, and rule snapshots from the training partition only.
- Keep C and D batches identical. Keep E and F preference batches identical.
- Balance output length through prompt constraints and report length separately. A model cannot improve distribution metrics by becoming shorter.
- Reject DPO pairs whose final changes names, numbers, or claims without support in the shared source packet.

### Fixed generation

Generate two samples for each of 30 locked test assignments under every condition, for 360 outputs total. Use Qwen's documented baseline settings of temperature 0.7, top-p 0.8, top-k 20, min-p 0, presence penalty 0, fixed seeds, and a task-specific maximum of 800 new tokens. Freeze the chat template, system prompt, source serialization, stop tokens, and inference engine.

## Evaluation and Promotion Gates

### Metrics

1. **Blinded Sam preference.** After automatic gates, compare the strongest distribution-trained condition against B and C in 50 randomized, model-hidden pairwise judgments per baseline. Allow ties and record the reason plus implicated rules.
2. **Factual preservation.** Check names and numbers deterministically. A source-grounded judge then scores unsupported, contradicted, and omitted claims without seeing the condition label.
3. **Task adherence.** Score the assignment's audience, requested evidence, length, and format against a frozen rubric.
4. **Rule compliance.** Run Margin's mechanical checks and a frozen rule judge. Retain per-rule violations alongside the aggregate score.
5. **Distribution distance.** Report token 1-gram, 2-gram, and 3-gram L2 against training-human and test-human references. Report unbiased RBF-kernel MMD using `nvidia/llama-embed-nemotron-8b` at a pinned revision, the median-distance bandwidth fixed from training-human embeddings, and bootstrap confidence intervals. Promotion uses distance to test-human finals; training-reference distance remains diagnostic.
6. **Repetition and diversity.** Report repeated sentence starts, distinct n-grams, self-BLEU, non-English token rate, and completion-length distribution.
7. **Stability.** Repeat training for two seeds before promotion. Report each seed and the pooled result.

### Gates

A distribution-trained adapter advances only when every gate passes.

- It passes all deterministic factual checks with zero critical unsupported claims.
- Its factual-preservation and task-adherence scores remain within two percentage points of both B and C.
- Its rule-violation rate does not exceed B.
- It improves free-generation token 1-gram L2 and MMD by at least 10% relative to C on the locked set.
- Its repeated-sentence-start rate rises by no more than two percentage points, its non-English token rate rises by no more than one point, self-BLEU rises by no more than 5% relative, and median completion length stays within 10% of C.
- Sam prefers it over B and over C in at least 60% of non-tied judgments, and the 95% Wilson interval excludes 50% for each comparison.
- Both training seeds pass. A mean that hides one failed seed does not pass.

If no distribution arm clears the automatic gates, stop before Sam review. If B beats C through F, keep rules plus retrieval as the generator path and continue collecting outcomes. If C wins, use per-register SFT while Margin remains the memory and evaluation layer. If D or F wins, keep the adapter optional and preserve rules as explanation and enforcement.

## Alternatives Deferred

MMD should remain an evaluation metric in the first run. Differentiating through sampled text is unavailable, and policy-gradient rewards built from batch MMD have high variance and weak token-level credit assignment.

Distribution-aware candidate selection followed by DPO is the strongest second experiment. Generate several candidates per prompt, reject any factual failures, measure each candidate's marginal effect on batch distribution metrics, and create preference pairs from the surviving candidates. This path is easier to stabilize than policy gradients, but it can overfit the selector and needs an untouched Sam-judged test set.

## Collision Boundary

The isolated worktree began clean at commit `bcf10b0`. The main checkout was on `main`, 17 commits ahead of `origin/main`, with a modified `plans/strategy-2026-07.md` and untracked work under these overlapping surfaces:

- `mcp/scripts/autoresearch/`
- `mcp/scripts/dspy/optimized_prompts/`
- `mcp/scripts/regression/`
- `plans/external-validation-2026-07.md`

Those files were neither copied nor edited. The future implementation unit must avoid the current prompt-optimization lane and all production database paths.

## Recommended Next Implementation Unit

Create a read-only dataset and evaluation contract under a new `experiments/post-training/` directory. Keep generated private artifacts under `~/.margin/experiments/post-training/`. This unit touches no production schema, Tauri command, UI, or existing autoresearch script.

Deliverables should include:

1. A versioned JSON Schema for the capture record above.
2. A read-only SQLite auditor that emits aggregate readiness counts and a hash-only manifest.
3. A splitter that groups by document, deduplicates before splitting, and enforces a chronological test cutoff.
4. Deterministic token n-gram, repetition, length, and factual-entity metrics.
5. An evaluation manifest that freezes conditions, prompts, rules snapshot, model revisions, decoding settings, and seeds.
6. A Fireworks capability probe that records accessible base-model IDs, tunability, LoRA support, and custom Training API access without starting a paid job or printing credentials.
7. Synthetic fixtures and tests. No private corpus text enters Git.

Acceptance criteria are explicit.

- A fixture containing a cross-split document fails validation.
- A fixture containing a duplicate or near-duplicate across splits fails validation.
- A corrective span cannot be exported as a positive final.
- A record missing prompt, final provenance, source packet, or model revision remains training-ineligible.
- Metric outputs are deterministic for a fixed fixture and seed.
- The Fireworks probe fails closed when the selected model revision cannot be matched or the custom API does not expose the tensors an objective needs.
- The live read-only audit reproduces 258 corrections, 284 rules, and zero populated `suggested_edit`, `rationale`, `accepted_at`, and `feedback_type` fields without changing the database checksum.
- `scripts/verify standard` passes.

After this unit passes, collect real complete examples. The first model code should live in the same isolated experiment directory and begin with C versus D. E and F wait for the preference-pair floor.

## Implementation Checkpoint

The first unit was implemented on July 16 under `experiments/post-training/`. It includes both JSON Schemas, capture eligibility checks, document-grouped chronological splitting, exact and near-duplicate leakage checks, deterministic n-gram and factual-constraint metrics, frozen evaluation manifests, an immutable SQLite auditor, and a no-spend Fireworks model probe.

The live auditor reproduced 258 corrections, 284 rules, and zero populated `suggested_edit`, `rationale`, `accepted_at`, and `feedback_type` fields. Database SHA-256 remained `aeaf190786d50def088f00f28104132afb23af1421eef8973c0c568a09eefcdc`. The Fireworks key was absent from the worktree environment, so the live probe stopped before making a request. Synthetic tests cover the required failure cases, including non-empty WAL rejection.

No production code, schema, existing autoresearch file, or private corpus data changed. Data collection is next. The evaluation prototype begins after 20 complete cover-letter assignments have prompts, source packets, model metadata, and Sam-approved finals.

## Vale Adapter Spike

An isolated adapter under `experiments/vale-adapter/` tested Vale as the mechanical rule evaluator for post-training outputs. The August 12 run compiled all 16 live reviewed rules that had detection patterns against Vale revision `8fe98044d4bc90e5291372a183b4c7021490aa09`. The read-only database hash remained unchanged.

On six labeled Markdown fixtures, the current raw-regex behavior produced three true positives and two false positives. Both false positives came from rule text inside fenced or inline code. Vale produced the same three true positives with zero false positives and zero false negatives because its parser excluded those scopes.

Use Vale as an optional derived evaluator after a 30-document private-corpus validation. Keep rule IDs, provenance, writing type, signal count, and review state in Margin. Autoresearch may consume Vale's per-rule diagnostics as one objective, while blinded preference and factual preservation remain promotion gates. The small fixture result does not justify replacing the guard or shipping Vale with Margin yet.

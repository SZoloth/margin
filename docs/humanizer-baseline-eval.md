# Eval design: Margin rules vs. a generic humanizer

**Status:** design only. Nothing here has been run. No model weights were downloaded
to write this doc.

## The claim

> Margin's rules, learned from Sam's corrections, beat a generic humanizer on
> Sam's own drafts, on both **voice fidelity** and **fact preservation**.

The baseline is [`jialinyyzz/humanizer`](https://huggingface.co/jialinyyzz/humanizer):
a Gemma 4 12B fine-tune (SFT, then DPO, then GRPO; Apache-2.0) that rewrites
AI-written drafts so they read as human. Its model card says it is trained to keep
numbers, units, dates, names and quotes, and to add nothing. It targets
"sounds human", not "sounds like Sam".

## What the existing harness can and cannot say

`mcp/scripts/autoresearch/eval.ts` (see `docs/evals.md`) asks a model to **write
from scratch** from one of 9 adversarial prompts (3 samples each, n=27), then scores
the text with `compliance-check.ts`: Sam's kill-words, slop patterns, voice checks
and a 5-dimension score. Pass means zero mechanical issues and dimension score at
least 35/50.

Four problems for this comparison:

1. **Wrong task.** A humanizer rewrites an existing draft. There is no draft corpus
   in the harness, so arch-c's second pass is the closest thing but is only ever fed
   the first pass's own output.
2. **Circular metric.** The checker enforces rules derived from Sam's corrections.
   Margin's arm is told those rules; the humanizer never saw them. A Margin win on
   `pass_rate` would be true by construction, so it cannot count as evidence of
   voice fidelity. It is reported as a secondary number only.
3. **Underpowered.** Each sample is 3.7 points of pass rate (1/27). PLANS.md's
   "c (editor+rules) 70.4% vs null 66.7%" is **one sample** of difference, and
   `experiment-log.md` records ±20pp run-to-run swings at n=27 for the same arch.
   The March 88.9% for arch-c did not reproduce on the second provider (70.4%).
4. **Single-author rules.** Every number measures Sam's rules on prompts written
   for Sam's rules. Nothing tests whether rules generalize to drafts the rules were
   not built from.

So this eval needs a new input (a frozen draft corpus), new voice metrics that do
not reuse the rule checker, and a paired design.

## Arms

All arms receive the same frozen draft and return a rewrite.

| Arm | What it is | Why it is here |
|---|---|---|
| **A0 identity** | the draft, unchanged | floor; every arm must beat it or editing is pointless |
| **A1 generic editor** | the Margin editor model (`MARGIN_EVAL_CMD`) with a plain "rewrite so it reads like a person wrote it, keep every fact" prompt, **no rules** | separates "an LLM was asked to humanize" from "Sam's rules did it" |
| **A2 humanizer** | humanizer-12b Q4_K_M via llama-server, model-card prompt and sampling (below) | the baseline under test |
| **A3 Margin** | arch-c pass 2: `editWithRules()` over the draft with the per-type rules built from the **training split only** | the system under test |
| **A4 stack** | A2 output fed to A3 | tests whether the two are complements |

Confounds that survive this design, stated so the result is read correctly:

- **Model size.** A3 and A1 run on a frontier or hosted model; A2 is a 12B local
  model. A3 beating A2 is partly "bigger model". Only **A3 vs A1** isolates the
  rules. Only **A2 vs A1** is *not* clean (different models), so do not read it as
  "fine-tune beats prompt".
- **Quantization.** The card's quality numbers are for the larger files; we run
  Q4_K_M (7.6 GB) because it fits Sam's disk. If A2 loses narrowly, rerun the loss
  cases on Q8_0 (12.7 GB) before concluding anything.
- **Sampling noise.** Humanizer samples at temperature 1.0. Run it 3 times per draft.

Optional A5: Margin rules on a same-class 12B instruct model, to remove the size
confound. Not required for a verdict; add it only if A3 beats A2 and the size
objection matters.

## Drafts

**Unit:** an AI-written draft whose problems Sam has already marked in Margin.

**Source:** documents in `~/.margin/margin.db` that have rows in `corrections`
(applying `CORRECTION_FILTER` from `mcp/scripts/shared.ts`: no
non-feedback rows, no positive polarity, no `__backfilled__`). `corrections.original_text`
is the flagged span and `notes_json` is what Sam said about it. Where Sam also saved
a revised version of the document, that is the **final** and enables metric V2.

**Size:** target 30 to 40 drafts, 100 to 400 words each (the model's 8192-token
window covers instruction, draft and rewrite). **Measured 2026-10-13 on Sam's Mac:
22 documents have usable corrections** (15 with at least 3 flagged spans, 10 with at
least 5). By writing type: general 10, cover-letter 6, blog 3, outreach 2, pitch 1.
That is below the 30-draft bar and three of five types have 3 or fewer documents, so
**the first run is a pilot by this doc's own rule**: no win/loss call, and no
per-type claims. Re-run the count as corrections accumulate:

```bash
sqlite3 ~/.margin/margin.db "
  SELECT document_id, COUNT(*) AS flagged_spans, MIN(document_title)
  FROM corrections
  WHERE notes_json IS NOT NULL AND notes_json != '[]'
    AND session_id != '__backfilled__' AND UPPER(notes_json) NOT LIKE '%NOT FEEDBACK%'
    AND (category IS NULL OR category != 'non-feedback')
    AND (polarity IS NULL OR polarity != 'positive')
  GROUP BY document_id ORDER BY flagged_spans DESC;"
```

Fewer than 30 usable documents means the run is a **pilot**: report it, make no
win/loss call. In a pilot, V3 (Sam's blind picks) and the F1 hard-fail counts are
still worth collecting as direction, with the intervals shown.

**Split (leakage control, the expensive part).** Rule rows carry no per-document
provenance, so rebuilding rules per split is not possible and a document-only split
would leak. The runner therefore uses a **time split**: the newest ~30% of drafts
(by first correction) are held out, and A3 sees only rules whose `updated_at` is
strictly before the earliest held-out correction. A rule that later absorbed more
signal moves its `updated_at` forward and is excluded, which errs against Margin.
Rules are read from the live DB read-only; nothing is written to `~/.margin`.
Consequences: held-out types skew toward whatever Sam wrote recently, and early
rules are the only ones tested. See `mcp/scripts/regression/rewrite-eval/README.md`
for the commands and DECISIONS.md (ADR-002) for the reasoning.

Freeze the drafts to `mcp/scripts/regression/humanizer-drafts/` (text files plus a
manifest of split, type, spans and notes). Real writing from the user's DB is
private: do not commit it. Commit only the manifest schema and the runner.

## Metrics

### Voice fidelity (primary)

- **V1 Held-out correction recovery.** For each flagged span in a held-out draft,
  an LLM judge sees the span, Sam's note, and the output's corresponding passage
  (blind to arm) and answers: *fixed*, *unchanged*, or *made worse*. Score =
  fixed / flagged spans. This is the closest non-circular proxy: it uses Sam's
  literal feedback, not the synthesized rules.
- **V2 Gap closed to Sam's final** (only drafts that have a final). `1 - d(out, final) / d(draft, final)`
  with `d` as normalized character edit distance, or chrF. 1.0 means identical to
  Sam's final, 0 means no closer than the draft, negative means worse.
- **V3 Blind pairwise preference by Sam.** Per draft, shuffle A2, A3 (and A1 on a
  subset) with labels hidden; Sam picks "sounds more like me" or "tie". This is the
  only metric that is ground truth, so it carries the verdict. Cost: about 30 drafts
  x 2 pairs, 20 to 30 minutes.

### Fact preservation (primary)

- **F1 Mechanical fact check (deterministic).** From the draft, extract numbers
  (with units and %), dates, quoted strings, URLs, and capitalized names that are
  not sentence-initial. Normalize, then compute **recall** (kept / present in the
  draft) and **additions** (extracted from the output, absent from the draft).
  A draft **hard-fails** if any item is dropped or changed or any is added. Report
  hard-fail rate per arm. Primary because it needs no judge.
- **F2 Claim-level judge.** Strict LLM judge, blind to arm, lists dropped, altered
  and invented claims. Calibrate first: Sam spot-checks 20 rewrites and we require
  at least 85% agreement before trusting F2 on the rest. Self-preference risk (a
  Claude judge grading Claude-edited text) is why F1, not F2, is primary.
- **F3 Hygiene.** Length ratio (output words / draft words), markdown/list structure
  retained, language unchanged. The card admits the model sometimes drops
  formatting, answers in the wrong language, and adds slang in casual genres.

For reference only: the card self-reports 376 of 420 English rewrites (89.5%) with
no factual problem under its own strict judge. Its judge and ours are different, so
treat that as a prior, not a number to beat.

### Secondary (reported, never decisive)

- Existing `runComplianceCheck`: mechanical issue count, dimension score, pass rate.
  Circular for A3 (see above). It is still informative in the *other* direction: if
  A2 scores well here, a generic humanizer already removes much of what the rules
  target.
- Latency and cost per draft.

## Statistics

- Unit of analysis is the **draft**, not the sample. Average the 3 humanizer samples
  per draft first.
- All arm comparisons are **paired** (same draft). Paired bootstrap, 10,000
  resamples, 95% intervals. V3 uses an exact binomial test on non-tie picks.
- No verdict from a difference smaller than the interval. Given the existing ±20pp
  noise at n=27, expect to need the full 30 to 40 drafts to resolve a 10pp effect.
- Thresholds below are fixed **before** any model output is seen.

## What counts as a win or a loss

Gates, all required for any arm to be called useful:

- **G1 beats do-nothing.** Arm V1 > A0 V1 and F1 hard-fail rate not above A0's
  (A0's is 0 by definition, so an arm may only be declared safe if its hard-fail rate
  is at most 10%).
- **G2 Margin beats its own prompt.** A3 > A1 on V1, interval excluding 0. If this
  fails, the rules add nothing over a generic editor and the claim is dead
  regardless of A2.

Verdict for the claim (A3 vs A2), after gates:

| Outcome | Condition |
|---|---|
| **Win (claim holds)** | V3: Sam prefers A3 in at least 60% of non-tie pairs with the binomial lower bound above 50%; **and** V1: A3 minus A2 at least +10pp with interval excluding 0; **and** facts: A3 F1 hard-fail rate strictly lower than A2's, interval excluding 0 |
| **Partial: voice only** | voice conditions met, facts not strictly better (including non-inferior). Claim is half true; say which half |
| **Partial: facts only** | facts strictly better, voice not. Margin is safe, not distinctive |
| **Loss** | Sam prefers A2 in 50% or more of non-tie pairs, or A2 V1 at least A3 V1 |
| **Inconclusive** | any interval spans 0 on the deciding metrics. Report the width and the n needed; do not call it a tie |

Note the asymmetry in "facts": the claim says *beats*, but the realistic best case
for A3 is *not worse*, because the humanizer is explicitly trained for fidelity. A
non-inferiority result is reported as "Partial", not "Win".

Stack result (A4) is exploratory: if A4 beats both A2 and A3 on V3, the finding is
"complements", and the product question changes from "vs" to "pipeline".

## Running the humanizer (Sam's Mac, after Sam approves the download)

Everything below needs the 7.6 GB Q4_K_M file. **Do not run the download step
without Sam's go-ahead.** Mac disk is tight (about 25 to 33 GB free); delete
`~/humanizer-model` and the Homebrew cache afterwards.

Model-card facts used (as read from the card on 2026-10-13):

- **Text completion, not chat.** No system prompt, no turn markers. The prompt is
  `instr + "\n\n" + draft.strip() + "\n\n### Rewritten:\n\n"`, where `instr` is the
  English instruction in `prompt_format.json` (starts "Rewrite the text below so it
  reads like a person wrote it, not a language model."). I could not retrieve the
  file's full text from the cloud, so the script below reads it at run time instead
  of hardcoding a paraphrase.
- Self-test from the card: the first 16 hex chars of `sha256(prompt)` for the draft
  `X` must equal `cc51d66b4c593fbe`. The script aborts if not.
- **Sampling:** temperature 1.0, top_p 0.95, **top_k 0, min_p 0, repeat_penalty
  1.0**. llama.cpp defaults to top-k 40 and min-p 0.05, so these must be set
  explicitly.
- **Stop on EOS only.** No stop strings, especially not `###`.
- Context 8192 tokens total; split longer documents at paragraph breaks.
- Newer GGUFs embed a chat template and sampling defaults. Use the raw
  `/completion` endpoint, not `/v1/chat/completions`, so the template is bypassed.

### 1. Setup

```bash
brew install llama.cpp                       # provides llama-server
pip install -U "huggingface_hub[cli]"        # provides `hf` (or: brew install huggingface-cli)
mkdir -p ~/humanizer-model
df -h ~ | tail -1                            # want > 15 GB free
```

### 2. Fetch the prompt file (tiny) and, once approved, the model

```bash
hf download jialinyyzz/humanizer prompt_format.json --local-dir ~/humanizer-model
# --- STOP: only after Sam says yes (7.6 GB) ---
hf download jialinyyzz/humanizer humanizer-12b-Q4_K_M.gguf --local-dir ~/humanizer-model
```

### 3. Serve

```bash
llama-server -m ~/humanizer-model/humanizer-12b-Q4_K_M.gguf \
  -c 8192 -np 1 -ngl 99 --host 127.0.0.1 --port 8080
# wait for: "server is listening"; check: curl -s 127.0.0.1:8080/health
```

### 4. Wrapper that fits the harness contract (stdin draft, stdout rewrite)

Saved as `mcp/scripts/regression/humanizer-cmd.py` (this PR). `--selftest` was run
against the real `prompt_format.json` on 2026-10-13 and printed
`cc51d66b4c593fbe OK`. Re-run it after any model or prompt-file update.

```python
#!/usr/bin/env python3
"""stdin: a draft. stdout: humanizer-12b's rewrite. Text completion, EOS stop only."""
import hashlib, json, os, sys, urllib.request

PF = os.path.expanduser(os.environ.get("HUMANIZER_PROMPT_FILE", "~/humanizer-model/prompt_format.json"))
URL = os.environ.get("HUMANIZER_URL", "http://127.0.0.1:8080/completion")
instr = json.load(open(PF))["instr"]

def build(draft: str) -> str:
    return instr + "\n\n" + draft.strip() + "\n\n### Rewritten:\n\n"

if "--selftest" in sys.argv:
    got = hashlib.sha256(build("X").encode()).hexdigest()[:16]
    print(got, "OK" if got == "cc51d66b4c593fbe" else "MISMATCH (expected cc51d66b4c593fbe)")
    sys.exit(0 if got == "cc51d66b4c593fbe" else 1)

body = {
    "prompt": build(sys.stdin.read()),
    "temperature": 1.0, "top_p": 0.95, "top_k": 0, "min_p": 0.0,
    "repeat_penalty": 1.0, "n_predict": 2048, "stop": [], "cache_prompt": False,
}
req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json"})
print(json.load(urllib.request.urlopen(req, timeout=300))["content"].strip())
```

```bash
python3 mcp/scripts/regression/humanizer-cmd.py --selftest   # must print OK
echo "We shipped 3 features in Q2, up 40% from 2025." | python3 mcp/scripts/regression/humanizer-cmd.py
```

If `--selftest` mismatches, stop: either `prompt_format.json` carries a separator
other than the one on the card or the file changed. Read its `sep` field and the
card, fix `build()`, and do not run the eval on an unverified prompt.

### 5. Run (once the draft runner exists; see Implementation)

```bash
cd mcp
for i in 1 2 3; do
  MARGIN_EVAL_CMD="python3 scripts/regression/humanizer-cmd.py" \
    pnpm exec tsx scripts/regression/run-rewrite-eval.ts --arm humanizer --split heldout --run $i
done
```

### 6. Cleanup

```bash
pkill llama-server
rm -rf ~/humanizer-model /tmp/margin-eval
brew cleanup -s
```

### Smoke test result (2026-10-13, Q4_K_M, Sam's MacBook Air)

One made-up paragraph (not Sam's writing) with six figures went through the wrapper:
all figures survived and the output was not truncated. Observations that matter for
the eval: the model is **terse and drops connective wording** (a risk for V1/V2 and
F3 length ratio, and a reason A3's "minimal changes" editor prompt may look better
on fidelity), and it ran at **10.5 tokens/s generation, 89 tokens/s prompt
processing** on this machine, versus about 37 tokens/s on the card's M5 Max Q8_0
run. Budget about 10 to 40 s per draft per sample; 3 samples x 22 drafts is on the
order of 20 to 40 minutes of generation.

## Implementation

Built in `mcp/scripts/regression/rewrite-eval/` (see its README for commands):
corpus builder with the time split, the five arms, F1/F3 scoring, V1 and F2 judge
prompts, V2 when finals exist, the blind A/B sheet for V3, and the verdict rules from
the table above as code (`verdict.ts`) so the call cannot drift after results are in.
Unit tests cover the extractor, split, blind scoring, verdict table, judge parsing,
arm wiring and the leakage filter. The pipeline was dry-run end to end against a
synthetic database with stub generators; it has **not** been run on Sam's data.

## Decisions to make with Sam before building

- OK to download the 7.6 GB Q4_K_M file to the Mac, and run on Q8_0 only if A2 loses narrowly?
- Is 20 to 30 minutes of blind judging (V3) acceptable? Without it there is no
  ground-truth voice measure and the verdict falls back to V1/V2, which are proxies.
- Are there at least 30 documents with corrections? If not, run as a pilot.

## What this eval will not tell us

- Whether Margin's rules generalize to anyone but Sam (zero external users as of
  the October audit). This tests Sam's rules on Sam's drafts, as the claim says.
- Whether the output beats an AI detector. Neither arm optimizes for one.
- Chinese-language behavior.

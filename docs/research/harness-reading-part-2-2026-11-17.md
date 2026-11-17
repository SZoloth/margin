# Harness reading, part 2 (2026-11-17)

Addendum to [part 1](harness-notes-2026-11-16.md). Source: [Shishira's second post](https://x.com/ShishiraReddy05/status/2122681455625035834), which links eight X Articles. All eight were read in full. Two linked GitHub pages returned only a one-line blurb. Statistics are the authors' claims, mostly uncited, so treat them as hints. Nothing was changed on GitHub or X.

Part 1 already covered the loop, tools as schemas, untrusted-content wrapping, loop detection, structured tool errors, skills as a context budget, read-only subagents, memory as files, and boundary tests. Only new points are listed.

## Sources

**1. [@undefinedki, "How to Design an Agent Harness"](https://x.com/i/status/2088611136027361368).** Six decisions: where the loop stops, which tools it sees, what stays in memory, what survives a crash, what it may touch, and who says it is done. Most concrete of the batch.
New: a one-sentence stopping rule written before the run. Four repo files the agent keeps current: SPEC.md (human-owned), PLAN.md (steps with acceptance criteria), PROGRESS.md, DECISIONS.md (append-only), plus a commit after every working change. Pin rules (as opposed to facts) in a file re-read after every reset; it cites one unreviewed single-author study where rule violations rose after compaction. Boundaries at the OS level (writable directories, domain-allowlist proxy) rather than approval prompts, which it says people approve 93% of the time. Review in a fresh session. Eval set from past failures, each task run three times, judged on the worst run.

**2. [@akshay_pachaar, "Let's build Claude Code's harness"](https://x.com/i/status/2077455755066868098).** Rebuilds a Claude Code-style loop in CrewAI. Mostly duplicates part 1 and is tied to CrewAI. New: a demo where "fix the implementation, not the tests" stops the agent from editing failing tests.

**3. [@lunarresearcher, "Harness Engineering: The Complete Guide"](https://x.com/i/status/2096570562625655088).** Principles only, no data or code, plus a Substack plug. Worth keeping: a task contract (outcome, scope, what must not change, evidence of completion, which actions need approval); an "instruction ladder" (a rule that matters repeatedly moves from prose to a check or hook); retries must change a condition and sit inside a budget; a short change receipt stating what was proven; delete harness parts that stop earning their place.

**4. [@sermakarevich, "Build your own harness in 17 steps"](https://x.com/i/status/2102024724817564092).** Summary of a LangGraph tutorial series (repo: sermakarevich/harness). Specific and practical. New: send tool output over a size cap to a file and keep a preview plus the path; compact only at a turn boundary and keep names, paths, numbers and decisions; standing rules live outside the message list so compaction can't drop them; keep the todo list as harness state with at most one item in progress; classify errors before retrying and let only one layer retry; helper agents may use only tools that need no permission; report pass count next to tokens, cost and time.

**5. [@eyad_khrais, "AI Harness Engineering 101"](https://x.com/i/status/2069552027382980882).** Beginner explainer ending in a hiring pitch. Duplicate of part 1, apart from one point: validate before executing (record exists, amount in range, action not already run).

**6. [@_avichawla, "How to Cut Agent Tokens by 2.7x"](https://x.com/i/status/2091804330118861239).** Sponsored by TrueFoundry, to promote its open harness TrueForge. The cost reasoning is sound: a 50,000-token tool result left in context is re-read on every later call, and prompt caching lowers the price, not the window use. Remedies: load tool schemas on demand, write large results to disk, run sub-agents for lookups, let the agent write a script that joins data instead of pulling rows into context, compact past a threshold, and keep credentials out of the sandbox. The benchmark is the vendor's own: 14 tasks, same model; I checked the repo's table: accuracy was within one task across harnesses, and tokens were 3.7M vs 10.0M (TrueForge vs Claude Managed Agents).

**7. [@zostaff, "Harness Engineering: Designing the Scaffolding..."](https://x.com/i/status/2086081592368279859).** Seven layers (environment, tools, context, orchestration, observability, verification, permissions). Overlaps source 1. New: guides (act before) vs sensors (check after), each computational or model-judged, and a critical check should not depend on a model judge alone; draw the permission boundary by reversibility and cost, not action type; treat messages between agents as data; test a harness edit on tasks outside the one it was made for (it claims tuned harnesses regressed on other task sets; no source given).

**8. [@jelipenguin, "Agent Harness Is Not Enough"](https://x.com/i/status/2046632311714984296).** Argues for an "environment" layer, promoting the author's holaOS project. No evidence. One usable question: if the runner changed tomorrow, which files, memory, tool-visibility rules and logs should still hold?

## What to change in our repos

Small and only where a source supports it:

1. **Stopping rule in each agent instruction file** (1, 3): one line stating what "done" means for that repo, e.g. which test or validate command must pass.
2. **Run state in files for long tasks** (1, 4): PROGRESS.md and an append-only DECISIONS.md, committed as work lands. Keep the plan as a short list with one item in progress.
3. **Pin must-not-break rules** (1, 4): keep a short rules block in the instructions file, not in chat history.
4. **Prose rule violated twice becomes a check** (1, 3): a lint, hook or test instead of another paragraph.
5. **Spill large tool output** (4, 6): cap results at a size, save the rest to a file, return preview plus path. Keep exit codes first.
6. **Verify with a fresh session, not the author** (1, 3, 7): review in a clean context and run the thing; prefer deterministic checks over a model judge for gates.
7. **Retry rule** (3, 4): classify the error, retry once with something changed, then stop with a structured blocked result.
8. **Small eval loops** (1, 4): 20 to 50 tasks from real past failures, three runs each, judged on the worst, with tokens and time recorded.
9. **Test harness edits off-target** (7): check that a new rule or hook did not make unrelated tasks worse.

Not used: sources 2, 5 (duplicates), 8 (promotion), and the TrueForge comparison in 6.


# Product Vision — Margin

**Last updated:** 2026-03-04

---

## One-liner

AI writing is generic because LLMs have no memory of your taste. Margin fixes this — it captures editorial judgment from your reading and turns it into enforceable writing rules that make Claude write like you.

---

## The Problem

AI prose has tells. "Delve," "leverage," "it's worth noting," negative parallelism ("The problem isn't X — it's Y"), hedged declarations, uniform paragraph lengths, absence of personal voice. Every LLM defaults to the same median internet prose. Readers can smell it. Hiring managers can smell it. You can smell it in your own drafts.

The root cause isn't that LLMs can't write well. It's that they have no persistent memory of how *you* write. Every session starts from zero. Claude doesn't know you never use "facilitate." It doesn't know you prefer short declarative sentences over compound hedges. It doesn't know that when you write casually you drop periods but when you write professionally you don't use contractions. There is no system that accumulates this knowledge and enforces it.

Existing approaches to the problem:

- **Grammarly** learns your patterns but applies *its* rules, not yours. The voice profile is a black box you can't inspect, export, or feed into other tools.
- **Claude's memory** retains facts about you but doesn't enforce writing constraints. Telling Claude "don't use leverage" works for one session. It doesn't persist, compound, or get verified.
- **Prompt engineering** — pasting style guides into system prompts — works but doesn't scale. You can't manually maintain a comprehensive voice specification, and you can't verify that the AI actually follows it.
- **AI detectors** (Turnitin, GPTZero) identify AI-generated text after the fact but don't prevent the patterns. Detection is the wrong end of the problem.

Nobody is building the feedback loop: **capture what you hate in AI writing → codify it into rules → enforce those rules on the next generation → verify compliance → repeat.**

---

## What Margin Actually Is

Margin is a writing quality system disguised as a reading app.

The surface is a desktop app where you open markdown files, highlight text, and write margin notes. That's the input mechanism. The actual product is underneath:

### 1. Structured capture of editorial judgment

Every annotation carries metadata that generic highlighting tools don't capture:

- **Polarity** — positive ("emulate this") vs. corrective ("never do this")
- **Writing type** — general, email, prd, blog, cover-letter, resume, slack, pitch, outreach
- **Before/after examples** — the specific edit, not just the complaint
- **Context** — prefix/suffix text for re-anchoring after document edits

When you highlight "leveraging cross-functional synergies" and write "corporate jargon — say what you mean," that isn't a bookmark. It's a training signal.

### 2. Rule synthesis from accumulated corrections

Corrections synthesize into writing rules via Claude:

```
Rule: "leveraging"
Category: kill-words
Severity: must-fix
Writing type: general
Signal count: 4 (seen across 4 documents)
Source: synthesis
```

Rules have categories (kill-words, ai-slop, voice-calibration, tone, structure), severities (must-fix, should-fix, nice-to-fix), and registers (casual, professional, universal). The collection of rules *is* the voice profile — a machine-readable specification of how you write.

### 3. Enforcement on AI writing

The voice profile generates two artifacts:

- **`~/.margin/writing-rules.md`** — the full voice profile, consumed by Claude via MCP or clipboard. Voice calibration rules grouped by register, writing samples (patterns to emulate), corrections (patterns to avoid), and categorized rules with examples.

- **`~/.claude/hooks/writing_guard.py`** — a pre-tool hook that intercepts Claude's Write and Edit operations on prose files. Kill-words and ai-slop patterns trigger automatic rejection. Claude literally cannot write "delve" into a markdown file if your rules say so.

### 4. Verification that the loop works

Adversarial testing infrastructure generates 27 prose samples (9 writing types x 3) using prompts designed to tempt AI tells. A two-layer compliance checker scores the output:

- **Mechanical layer:** Kill-word scan, structural tell detection (consecutive same-structure paragraphs, hedge patterns), slop pattern matching, voice calibration violations
- **LLM layer:** Claude scores the prose against the full writing-rules.md rubric

The regression suite diffs against baselines over time. If the compliance score doesn't improve as rules accumulate, the system isn't working.

### The loop

**Read → Annotate → Correct → Synthesize rules → Enforce on AI writing → Read AI output → Annotate again.**

Each iteration makes the system more precisely yours. The adversarial baseline proves it.

---

## Who This Is For

**Writers who use AI collaborators and care that the output sounds like them, not like everyone.** Product managers writing PRDs with Claude. Job seekers drafting cover letters. Bloggers who want AI to handle first drafts without the AI smell. Anyone who has ever read their own AI-assisted prose and thought "this doesn't sound like me."

The common thread: they already use AI for writing, they already notice the tells, and they have no systematic way to train the AI out of those tells.

---

## Design Principles

### 1. The writing output is the product, not the reading experience

Every feature is evaluated against: "Does this make AI write better prose?" A beautiful reading app that doesn't improve writing output is a failure. An ugly one that measurably reduces AI tells is a success.

### 2. Enforce, don't suggest

Grammarly suggests. Writing guides advise. Margin enforces. The writing guard is a binary gate: Claude cannot write kill-words into prose files. This is stronger than any prompt instruction because it operates at the tool level, not the prompt level. The AI doesn't choose to comply — it's mechanically prevented from violating.

### 3. Verify the loop, not just the plumbing

It's not enough that annotations flow into rules that flow into profiles. The product hypothesis — that accumulated editorial judgment makes AI write measurably better prose — must be tested adversarially. Compliance scoring and regression baselines are product features.

### 4. Database is the source of truth

Rules live in SQLite, not in markdown files or prompt templates. The generated artifacts (`writing-rules.md`, `writing_guard.py`) are derived from the database. This means rules are queryable, countable, versioned, and accessible from multiple surfaces (desktop app, MCP tools, CLI).

### 5. Local-first because editorial judgment is private

Your writing rules are a fingerprint. What you flag, what you fix, what you admire — this is the most personal data an AI tool could hold. It lives on your machine in SQLite. No cloud account. No sync service. No sending your editorial taste to a server.

---

## Competitive Positioning

Margin doesn't compete with reading apps or note-taking tools. It competes with every approach to making AI writing less generic:

| Approach | What it does | Why it doesn't solve the problem |
|----------|-------------|----------------------------------|
| **Grammarly voice profiles** | Auto-detects your style, applies it to rewrites | Black box — you can't inspect, edit, or export the profile. Grammarly's rules, not yours. No hook into Claude/ChatGPT. |
| **Claude memory / ChatGPT memory** | Persists facts between sessions | Remembers "Sam prefers short sentences" but doesn't enforce it. No signal counting, no severity, no verification. |
| **System prompts / style guides** | Paste rules into context | Doesn't scale (manual maintenance), doesn't verify (no compliance scoring), doesn't accumulate (no feedback loop). |
| **AI humanizer tools** (Undetectable.ai, etc.) | Paraphrase AI text to evade detectors | Treats symptoms, not causes. Adds noise rather than fixing the underlying patterns. |
| **Custom fine-tuning** | Train a model on your writing | Expensive, static (doesn't update with new corrections), requires large corpus, no per-rule granularity. |

**Margin's position:** The only system where highlighting a weak sentence today mechanically prevents Claude from writing that pattern tomorrow — with a verification layer that proves the delta.

---

## What Success Looks Like

### The adversarial score improves over time

27 prose samples. Scored against the full rule set. The compliance delta between "Claude with no voice profile" and "Claude with your voice profile" should widen as rules accumulate. If it doesn't, the product doesn't work.

### Kill-word violations approach zero

The writing guard catches kill-words at the tool level. Over time, Claude's own generation should also avoid them (because the voice profile in context discourages them before the guard triggers). The guard firing should become rare — not because it's off, but because Claude learned.

### The rules feel like your editorial voice, not a generic style guide

50+ rules across categories (kill-words, ai-slop, voice-calibration, tone, structure). Rules grouped by register (casual vs. professional). Signal counts showing which patterns you flag most. Before/after examples showing your actual edits. This isn't a Strunk & White reprint — it's *your* writing specification.

### The loop runs without friction

Annotate in Margin → synthesis CTA appears when correction count reaches threshold → one-click export to Claude → rules created automatically → guard and profile updated → next writing session uses new rules. The user shouldn't have to think about the pipeline.

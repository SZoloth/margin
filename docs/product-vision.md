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

### Adjacent Inspiration

Tools that don't compete with Margin but share adjacent design instincts worth studying:

| Tool | What it is | What Margin can learn |
|------|-----------|----------------------|
| **[ghostmd](https://mimoo.github.io/ghostmd/)** | Minimalist markdown notes app. Anti-Obsidian: zero config, Metal GPU rendering, pure writing speed. Built out of frustration. | Philosophy signal. Users are rejecting feature-bloated tools and building stripped-down alternatives. Margin's reading experience should feel this fast and focused — time from open to annotating should be near-zero. |
| **[Ghostnote](https://www.ghostnoteapp.com/)** | macOS app that attaches contextual notes to files, folders, and apps. Notes appear automatically based on what you're working on. | Same core insight as Margin: notes should live *with* the thing you're reading, not in a separate app. Ghostnote does it at the OS context level; Margin does it at the prose level. Both argue against the "dump everything in a flat list" paradigm. |
| **[MarginNote 4](https://apps.apple.com/us/app/marginnote-4-ai-notes-mindmap/id1531657269)** | PDF/EPUB reader with margin annotations, mind mapping, and spaced repetition. iOS/Mac. | Direct adjacent competitor at the reading layer. Name collision worth being aware of. They solve annotation-to-knowledge; Margin solves annotation-to-voice-rules. Different end goals, shared interaction surface. |
| **[with.md](https://github.com/emotion-machine-org/with-md)** | Filesystem-first markdown collaboration with live cursors, anchored comments, and threaded edit suggestions — all backed by GitHub repos, no proprietary formats. | Anchored comments with fuzzy text recovery and accept/reject suggestion workflows are directly adjacent to Margin's text anchoring for highlights. The threaded resolution model (comment → reply → resolve) could inform how corrections surface status in the writing quality pipeline. |
| **[Fish Eye](https://wattenberger.com/thoughts/fish-eye)** | Essay proposing interfaces should display information at multiple levels of abstraction simultaneously — zoomed-in detail and zoomed-out summary coexisting — rather than forcing users to choose one view. | Margin's annotation sidebar operates at a single level of detail. A fish-eye model suggests showing the highlight in full context alongside a one-line distillation, so reviewing corrections can happen without switching views. |
| **[Polylogue](https://www.polylogue.page/w/samos-5qXyyo/d/getting-started-with-polylogue-Y0bWT_)** | Collaborative document editor where AI agents participate as active team members — you @mention agents in comments and they read, edit, and respond alongside human collaborators. | Treats AI as a peer in the document rather than a separate tool. Suggests a direction where corrections and rule synthesis happen inline — Claude annotating as a collaborator rather than being invoked separately via MCP. |
| **[agentation](https://www.npmjs.com/package/agentation)** | Floating toolbar React component that lets users annotate web UIs and generate structured, code-level feedback for AI agents — CSS selectors, React component trees, element positions instead of vague screenshots. | Corrections today capture flagged text but not enough structural context. Richer annotation metadata (sentence position, paragraph type, document section) would make rule synthesis more precise and mechanical. |
| **[Boo, Chatbots](https://wattenberger.com/thoughts/boo-chatbots)** | Essay arguing chat-based AI interfaces hide context requirements, prevent output comparison, break flow state, and offer no affordances communicating how to use them. | Margin's writing guard is already better than prompting — mechanical and visual rather than conversational. But the "isolated outputs" critique applies: users can't easily compare corrected drafts against originals side-by-side. A diff-style correction view would close this gap. |
| **[Aesthetic Commands](https://maggieappleton.com/aesthetic-commands)** | Practical guide to making the terminal visually appealing — the argument being that tools you live in are worth making beautiful. | The underlying principle — daily-use tools deserve aesthetic investment — reinforces Margin's editorial design posture. |
| **[Ambient Co-presence](https://maggieappleton.com/ambient-copresence)** | Design patterns for soft, peripheral shared awareness in digital spaces — ambient presence through softened cursors, spatial audio, and annotation trails. | Annotation trails as ambient signal is directly applicable. Surfacing correction density as a peripheral quality signal — a heatmap overlay showing rule-trigger density — would guide reading focus without forcing triage. |
| **[Drawing Invisible Concepts](https://maggieappleton.com/drawinginvisibles1)** | Guide to visualizing abstract programming concepts through illustration, arguing visual metaphor — not decorative art — is the essential foundation for making invisible systems comprehensible. | Margin's rules and corrections are invisible concepts. The metaphor-first framing suggests making the rule synthesis loop tangible: show raw corrections, then the rule they became, then the enforcement. Make the pipeline visible, not just the artifacts. |
| **[Our Interfaces Have Lost Their Senses](https://wattenberger.com/thoughts/our-interfaces-have-lost-their-senses)** | Essay arguing modern interfaces have stripped away sensory richness until interaction feels frictionless but meaningless, and that multimodal design (movement, sound, spatial awareness) is the path back. | What does a correction *feel* like? Even small additions — distinct sounds per correction severity, haptic-style UI transitions when a rule propagates — could make the feedback loop more embodied and memorable. |
| **[hyper-material-theme](https://www.npmjs.com/package/hyper-material-theme)** | Material Design theme for the Hyper terminal with named color variants (Darker, Palenight, Ocean) and customizable accents. | Theme variants with named palettes succeed by giving users language to express aesthetic preference — a model Margin could apply to highlight color systems or reading mode themes. |
| **[Hemingway AI](https://hellohemingway.com/)** | Developer tool that lets you click any text element on a local web page and receive AI-generated copy alternatives inline, with changes persisting to source files. Learns from selection history to improve future suggestions. | The preference-learning model is directly applicable. Hemingway tracks which suggestions you accept to calibrate future ones — Margin already has this data (signal_count, accepted corrections) but doesn't visibly feed it back. Surfacing "this pattern has been corrected 7 times" would make Margin feel like it's learning, not just logging. |
| **[Addy](https://addy-ade.com/)** | Native macOS app for directing multiple AI coding agents simultaneously, with split panes per agent, integrated terminals, git workflows, and persistent project memory — built around agents as active participants. | Addy's bet — that context persistence and project-scoped memory make agents useful — maps to Margin's synthesis loop. The writing guard and rule set are Margin's "project memory." Suggests making that memory more navigable: a queryable record of what it knows about your voice, not just a flat markdown file. |
| **[Agentation](https://agentation.dev/)** | Desktop annotation tool for clicking UI elements, attaching notes about bugs, and exporting structured context (CSS selectors, component trees, source paths) that AI agents can act on directly. | Solving structurally identical problems in different domains. Agentation converts UI annotations into structured agent context; Margin converts editorial annotations into structured writing rules. Margin's corrections are still semi-structured — tightening the schema at creation time would make synthesis more mechanically reliable. |
| **[Design Engineers](https://maggieappleton.com/design-engineers)** | Essay defining "design engineers" — people who run design processes and implement in live code simultaneously, enabling rapid iteration without handoff overhead. | The essay's core tension — that design engineering's most valuable work is invisible in public portfolios — is Margin's product problem. Margin captures invisible editorial judgment and makes it enforceable. Useful framing for positioning: not a writing assistant, but infrastructure for capturing tacit expertise. |
| **[DialKit](https://joshpuckett.me/dialkit)** | React component library providing a floating control panel (sliders, toggles, color pickers, spring editors) wired directly to live UI values via a `useDialKit` hook. | Real-time parameter tuning through a floating panel applies to annotation UX — Margin could expose a live panel for adjusting highlight color, note type, or synthesis thresholds without leaving the reading flow. |
| **[JetBrains Mono](https://www.jetbrains.com/lp/mono/)** | Monospace typeface designed for coding environments, with attention to glyph differentiation, ligatures, and reading fatigue reduction. | Desktop apps often overlook font selection as part of the product experience. A well-chosen reading face signals craft — Margin's reading surface benefits from intentional typographic decisions. |
| **[LLMs as a Tool for Thought](https://wattenberger.com/thoughts/llms-as-a-tool-for-thought)** | Essay arguing LLMs are most valuable as thinking partners — external memory, idea generators, perspective-givers — that extend human cognition rather than replace it. | Margin's synthesis pipeline already operates on this principle. The essay surfaces a sharper framing: the interface should prompt "how do I think about X?" not "solve X for me." Margin could surface patterns from annotation history to provoke reflection, not just generate rules. |
| **[Hermes](https://github.com/Egotistical-Engineering/hermes)** | Open-source markdown editor with inline AI annotations — eight highlight types (questions, edits, voice notes, wordiness flags, fact-checks) that appear directly in text, each individually accept/reject/discussable, with style learning from past essays. | Eight-category inline annotation taxonomy is a concrete model for expanding Margin's correction types. The accept/reject/discuss loop per suggestion and explicit "voice consistency note" type are direct analogs to problems Margin is solving. |
| **[What Does a Tool Owe You?](https://dearhermes.com/read/kfniw9y/what-does-a-tool-owe-you)** | Essay on the Hermes platform exploring product philosophy around tool obligations to users — transparency, trust, and what users deserve from software they depend on. | Aligns with Margin's "dignified technology" framing — the argument that tools owe their users legibility about how they work and what they do with your data. |
| **[Digital Garden](https://maggieappleton.com/garden)** | Personal knowledge repository with 163+ essays organized by growth stage — seedling, budding, evergreen — a live example of the "digital garden" philosophy where ideas are cultivated rather than published-and-abandoned. | Growth-stage metadata (seedling/budding/evergreen) is a direct model for writing rules — rules from one correction could be "seedling," rules confirmed across multiple documents "evergreen." Gives users a signal about how much to trust a rule. |
| **[AI Enlightenment](https://maggieappleton.com/ai-enlightenment)** | Essay arguing AI chatbots undermine Enlightenment values by being sycophantic — reinforcing beliefs rather than challenging reasoning due to RLHF training that rewards flattery. Proposes interface toggles and Constitutional AI techniques. | Margin's writing guard is mechanically anti-sycophantic (refuses kill words regardless of preference). The essay points to a gap: Margin could offer a "challenge mode" for draft review — AI asking "is this the right argument?" rather than "is this well-written?" |

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

# Theory: Margin as a Writing Feedback Loop

## Problem

Writers improve by reading their own work critically — but critical reading is ephemeral. You notice a weak transition, wince at a cliché, admire a sentence that landed — and then the moment passes. There's no systematic way to accumulate editorial judgment into something durable and actionable.

The deeper problem is that AI writing tools are generic. Claude writes competent prose but not *your* prose. The missing input is a machine-readable record of your taste: what you flag, what you fix, what you admire. Without that record, every AI writing session starts from zero.

## Operating Theory

Margin is a desktop reading app with a hidden payload: it builds a persistent, structured record of editorial judgment that feeds back into AI writing tools.

The surface experience is conventional — open a markdown file, highlight text, write margin notes. The differentiating layer is underneath: every annotation is persisted in SQLite with polarity (positive or corrective), typed by writing concern (voice, clarity, structure, etc.), and accumulated into writing rules. Those rules synthesize into a voice profile. The voice profile travels into Claude via MCP tools or clipboard export.

The loop is: **read → annotate → correct → synthesize → write better → read again**.

Three systems make this work:

**The annotation engine.** TipTap editor with custom extensions for multi-color highlights and margin notes. Highlights are stored separately from document text — the file on disk never contains markup. A 4-tier text-anchoring system (`text-anchoring.ts`) re-resolves highlight positions when documents change externally, with explicit confidence levels (exact / fuzzy / orphaned) rather than silent degradation. This is the foundation — if highlights are unreliable, the entire feedback loop breaks.

**The diff review system.** When a file changes externally (VS Code edit while Margin is open), the file watcher triggers a diff pipeline. Small changes auto-accept. Larger changes surface per-change accept/reject controls. This solves the co-editing problem: Margin and your text editor can both be open without conflicts destroying annotations.

**The MCP integration.** A Node.js MCP server opens the SQLite database directly and exposes 14 tools to Claude: reading annotations, searching documents, creating highlights, managing corrections, querying writing rules. The export bridge (`ExportBridge`) is an in-process HTTP server that enables push-based annotation delivery — when you hit "Export to Claude" in the app, the MCP server receives the payload via callback and sends resource-updated notifications to the client. Claude doesn't need to hold a blocking call open; it gets interrupted with your annotations.

## Strategy

The development strategy has three layers, built bottom-up:

**Layer 1: Trustworthy data.** WAL-mode SQLite, foreign keys, cascading deletes, busy timeouts. Text anchoring with explicit confidence levels. The diff review system to prevent external edits from silently destroying annotations. This layer is non-negotiable — a local-first tool that loses your data is worse than no tool at all.

**Layer 2: Rich annotation.** Two-polarity system (positive signals to emulate, corrective signals to avoid). Writing type classification. Before/after examples on corrections. Writing rules with signal counts and severity. Voice profile generation. This layer transforms raw highlights into structured editorial knowledge.

**Layer 3: AI integration.** MCP tools for bidirectional access (Claude reads your annotations AND annotates your documents). Export bridge with push notifications. Clipboard export with embedded prompt instructions (the writing-quality-gate footer). This layer closes the loop — editorial judgment accumulated in Margin flows into Claude's context automatically.

The sequence matters: you can't build Layer 3 without Layer 2's structure, and Layer 2 is worthless without Layer 1's reliability.

## Key Discoveries

**The `~/.margin/` directory emerged as an informal protocol.** The database, MCP port file, corrections export, voice profile, and writing rules all live in `~/.margin/`. This started as a storage location and became a coordination mechanism between the desktop app, the MCP server, and external scripts. It works but is an organic contract, not a designed one.

**Push beats pull for the export bridge.** The original design had Claude call `margin_wait_for_export` and block until annotations arrived. The in-progress work adds push notifications — `onExport` callbacks trigger `resource-updated` signals and alert-level log messages. This lets Claude Code receive annotation exports as interrupts rather than coordinating a blocking call. The UX difference is significant: Claude can be mid-task and still receive your annotations.

**The harness engineering pivot.** A full 4-tier testing DAG was evaluated and rejected as over-engineered for a solo project. What replaced it is minimal but systematic: gap tracking with a ratchet mechanism, 2-tier risk classification (data-layer files like `text-anchoring.ts` and migrations get extra scrutiny), and a 2-job CI split (Linux for cheap tests, macOS for integration). The discipline is in knowing when quality infrastructure is premature and when it's overdue.

**State-in-hooks works at this scale.** No centralized store — each hook (`useDocument`, `useAnnotations`, `useDiffReview`, `useSearch`, etc.) owns its domain. `App.tsx` wires them together. This keeps coupling low and makes each hook independently testable, but it means cross-cutting coordination lives in the root component as prop threading. The current complexity is manageable; a second major cross-cutting concern might tip the balance toward shared state.

## Open Questions

**Will the bidirectional annotation model get used?** The MCP write-back tools let Claude annotate your documents — but the workflow ("Claude reviews your draft and marks it up in Margin") hasn't been validated. The infrastructure exists; the habit doesn't yet.

**How far does the `~/.margin/` protocol scale?** Adding more consumers (scripts, other editors, other AI tools) to the directory means the informal contract needs to harden — or things will break silently.

**When does the hooks architecture need shared state?** The current domain-per-hook pattern is clean but App.tsx is already a significant coordination point. If another feature requires cross-hook reactivity (e.g., annotations affecting search ranking, or corrections influencing highlight display), the wiring gets complex fast.

**Is the voice profile actually useful in practice?** Writing rules and corrections accumulate, but the feedback loop only closes if Claude's output measurably improves when given the voice profile. This is the core product hypothesis and it's unproven at scale.

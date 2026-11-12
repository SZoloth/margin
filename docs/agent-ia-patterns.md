# Agent IA Patterns: Interpreter, Polylogue, and Moss

Research for SAM-7. Documents IA and agent integration patterns from three reference products and extracts what applies to Margin.

---

## Interpreter (openinterpreter.com)

### What it is

A macOS desktop agent that controls the computer and manipulates documents using natural language. Executes code (Python, JavaScript, Bash) locally, controls the GUI via mouse/keyboard, and can read/write Word, Excel, PDF, and Markdown files.

### Key IA patterns

- **Document as the unit of work.** The app wraps AI around specific document types rather than around a project or conversation session. Each document type has an embedded AI panel — the agent lives alongside the editor, not in a separate workspace.
- **Session-less by default, persistable on demand.** Sessions are ephemeral; past conversations are resumable via `interpreter --conversations` (arrow-key navigation). Auto-saved to local disk. No persistent project model exposed in UI.
- **Profile-based configuration.** Behavioral settings (model, system prompt, permissions) live in YAML profiles — not in the app UI. Power users configure context once; the app consumes it.
- **Streaming output.** Responses render in real time; no wait-then-display.

### Agent integration patterns

- **Explicit approval gate before code runs.** Code is shown to the user before execution; they type `y` to approve. This is the primary trust mechanism. Power users can bypass with `-y` / `auto_run = True` — two distinct modes.
- **Vision feedback loop.** Visual outputs (charts, rendered HTML) are screenshot and re-injected into model context so the agent can iterate on what it sees.
- **Multi-language execution via a single `exec()` call.** Python, JS, Bash run through one interface; language is a parameter, not a mode switch.
- **Computer API for GUI control.** The agent can identify on-screen elements and control mouse/keyboard — enabling it to operate any app without native API access.
- **LiteLLM abstraction.** One interface over 40+ providers; model selection is a config flag. The agent is provider-agnostic by design.

### Notable design decisions

- "The document is the unit of work, not the session" is a deliberate inversion of the conversation-centric framing used by Claude.ai, ChatGPT, Cursor.
- The approval gate makes agent actions legible and reversible. Simon Willison notes sandboxing would be more robust — but approval gates are the practical middle ground.
- CLI-to-GUI transition is intentional: the CLI limits reach to technical users; the GUI extends the agent to non-technical users without changing the underlying model.

---

## Polylogue (polylogue.page)

### What it is

A collaborative writing platform where AI agents join a workspace as first-class team members. Agents can read documents, post inline/threaded comments, and push edits, using any API-compatible model the user provides.

### Key IA patterns

- **Workspaces → Folders → Documents.** Standard hierarchical document structure; workspaces are the top-level container for both humans and agents.
- **Two participant types: humans and agents.** Both are workspace members with assigned roles (Member or Viewer). Agents are priced ($10/month each); humans are free. The cost is attached to AI slots, not user count — AI is the primary value unit.
- **Comments as the primary interaction surface.** Inline (anchored to highlighted text) and document-level threaded discussions. Agent responses live in the same comment system as human feedback — no separate AI panel. This flattens the human/agent distinction.
- **Per-workspace agent instructions.** Standing instructions injected when an agent reads a document — a persistent system prompt attached to the workspace, not a per-interaction parameter.
- **Version history** for all edits.

### Agent integration patterns

- **Bring Your Own Model.** Any agent that can make HTTP requests authenticates with a Bearer API key and becomes a workspace participant. GPT wrappers, Claude agents, custom pipelines all work. The platform is a coordination layer; the intelligence is external and swappable.
- **@mention activation.** Agents are triggered by being @mentioned in a comment. They receive full document context plus comment details via webhook POST.
- **Real-time webhook delivery.** Polylogue pushes events to agents on @mention or reply; agents don't poll.
- **Full document read/write via REST API.** Agents can list, create, read, and update documents and comments programmatically.
- **Multi-agent composition.** Multiple specialized agents (editor, researcher, fact-checker) can coexist in the same workspace and be triggered independently.
- **HMAC-signed webhooks** for security.
- **TipTap-based editor** (same foundation as Margin).

### Notable design decisions

- Comments-as-protocol: using the existing annotation system as the agent communication channel means agent behavior is immediately legible to human collaborators — no separate AI log to check.
- Workspace-level instructions as a configuration primitive is more durable than per-prompt instructions; behavior is shaped once, not re-stated each session.
- Model-agnostic by design: the platform doesn't care which model runs the agent. This is a strong signal for composability over lock-in.

---

## Moss (mossnotes.app)

### What it is

A local-first notes app that embeds a collaborative AI agent directly into markdown documents. Positions itself as "calm software" — the agent operates in the background or on demand, never taking over the writing surface. Notes stay as plain markdown files on disk; no account, no proprietary format.

### Key IA patterns

- **Flat local-first structure.** No workspace or folder hierarchy imposed by the app. Structure is inferred automatically — Moss tags and links notes in the background. The user never manually organizes; the agent does it.
- **Notes as the universal format.** Every note is a markdown file on the user's machine. Rich features (formulas, charts, live data) are optional layers that serialize back to markdown. No data gravity, no lock-in.
- **Skills as reusable instruction primitives.** Users define named instruction sets ("Skills") — custom behavioral prompts the agent inherits when invoked. Skills are explicitly @mentioned to scope agent behavior. This is a user-authored, note-level configuration layer.
- **Connected Folders for read-only context.** External directories (codebases, Obsidian vaults, project docs) can be connected without importing. The agent reads them as context when @referenced; they never move or change.
- **Timeline as the audit trail.** Every agent interaction is preserved in a timeline, allowing the user to review what the agent did and revert.

### Agent integration patterns

- **⌘K inline invocation.** The agent is triggered via keyboard shortcut from within the note — not from a sidebar or separate window. Invocation is always in-document.
- **Selection context.** Users highlight specific text before triggering the agent, scoping its actions to a passage rather than the whole document.
- **@mention for context injection.** Notes, Skills, and Connected Folders are wired to the agent via @mention at invocation time. Context is explicit and user-controlled per interaction.
- **Comments as agent output.** The agent can review a document and respond with inline comments — the same comment surface the human uses. This is identical to Polylogue's model: agent output = annotation, not chat message.
- **Passive by default.** The agent does nothing unless explicitly invoked. No background suggestions, no auto-completions unless requested. "Calm software that waits for you."
- **Claude Code integration (free tier).** Claude Code is listed as a core integration at the free tier — notes from Claude Code plans work natively as Moss notes.

### Notable design decisions

- "Shared agentic workspace" is Moss's framing: both the human and the agent annotate, revise, and comment on the same surface. The distinction between human annotation and AI annotation is surface-level, not architectural.
- Skills are the user-space equivalent of a system prompt — defined once, reused across sessions, @mentioned when relevant. This is a more granular, composable version of Polylogue's workspace-level instructions.
- Local-first + markdown-only is an aggressive portability bet. It positions Moss as a coordination layer over files, not a data silo. The agent operates on files the user already owns.
- Passive default with explicit invocation addresses the trust problem without a formal approval gate: the agent can't act without being summoned.

---

## Synthesized patterns for Margin

### Pattern 1: The annotation surface is the agent surface

All three apps converge on this: Interpreter embeds AI in the document editor, Polylogue routes agent output through the comment/annotation system, and Moss uses the same comment surface for human and agent annotations. None use a separate AI panel. For Margin, **the annotation layer (highlights + margin notes) should be the primary interface for agent interaction**.

**Margin application:** When an agent proposes a correction or writing rule, it should appear as a margin note or highlight — not in a separate AI sidebar. The user reviews it the same way they review their own annotations.

### Pattern 2: Workspace-scoped instructions as a configuration primitive

Polylogue's per-workspace instructions, Interpreter's YAML profiles, and Moss's Skills all solve the same problem: **durable behavioral context that survives individual sessions without requiring the user to re-specify it each time.** Moss adds a refinement — Skills are composable named instruction sets, @mentioned to scope behavior per interaction rather than applied globally.

**Margin application:** The writing-rules profile (`~/.margin/writing-rules.md`) already implements the global version of this pattern. The Moss refinement suggests a next step: named rule subsets (e.g., "essay-rules", "technical-docs-rules") that agents can @reference for a specific document type, rather than always loading the full profile.

### Pattern 3: Legible, reversible agent actions with an explicit approval gate

Interpreter's approval gate, Polylogue's comment-as-response model, and Moss's Timeline all prioritize **legibility of what the agent did**. Moss makes the timeline a first-class UI element. The user can always see, and revert, any agent action.

**Margin application:** Correction synthesis — where individual annotations become generalized writing rules — is the highest-stakes agent action in Margin's loop. It should have an explicit approval gate: the user reviews proposed rules before they are committed to the rules file. The current flow auto-synthesizes; making synthesis a visible, confirmable action would increase trust. A timeline of synthesized rules (with source annotation, date, and revert path) would directly mirror the Moss pattern.

### Pattern 4: Multi-agent composition via @mention or role assignment

Polylogue lets multiple specialized agents coexist and be triggered independently. Interpreter's Computer API + LiteLLM abstraction enables model-agnostic composition. Moss's Skills + @mention system lets the user wire different behavioral profiles to different invocations. All three point to **role-specific agents triggered by context, not a single monolithic AI**.

**Margin application:** Margin's pipeline is currently a single loop. A composable model would allow different agents for different writing types: a style agent for prose, a structure agent for technical docs, a fact-checker for research. The immediate implication is that the writing-rules system should segment rules by `writing_type` (already true via `UNIQUE(writing_type, category, rule_text)`) and that agents should be invokable per-type.

### Pattern 5: Document as the unit of work, not the session

Interpreter's explicit design choice and Moss's flat, file-centric architecture are the strongest advocates of this framing. Moss takes it further: the document is a file on disk, not a cloud object — the app wraps intelligence around files the user already owns.

**Margin application:** Confirm that the agent integration story always starts from "a document is open" — not "a session is active." Corrections and rules should always carry a document reference (already true: corrections link to `document_id`). The agent context window should be the document content + relevant writing rules, not a floating conversation history.

### Pattern 6: Read-only context injection without importing

Moss's Connected Folders pattern — granting the agent read-only access to external directories without importing or copying files — is a clean solution to the context problem. The agent can reason over a codebase, a research archive, or an Obsidian vault without the app owning that data.

**Margin application:** Margin currently operates on documents loaded into the app. A Connected Folders equivalent would let the agent reason over external writing samples, reference documents, or an existing Obsidian vault as context for rule synthesis — without requiring the user to import them. This would strengthen the writing-rules profile by grounding it in real examples the user cares about.

---

## Sources

- [openinterpreter.com](https://www.openinterpreter.com/)
- [Open Interpreter GitHub](https://github.com/OpenInterpreter/open-interpreter)
- [Open Interpreter Docs](https://docs.openinterpreter.com/)
- [polylogue.page](https://www.polylogue.page/)
- [polylogue.page/docs](https://polylogue.page/docs)
- [mossnotes.app](https://www.mossnotes.app/)
- [mossnotes.app/features](https://www.mossnotes.app/features)
- Simon Willison's review of Open Interpreter (simonwillison.net)
- Nat Eliason on Polylogue (x.com/nateliason)

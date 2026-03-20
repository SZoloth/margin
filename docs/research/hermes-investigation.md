# Hermes Investigation — Annotation Feedback Patterns

**Beacon #104** | Investigated: 2026-03-17 | Ticket: SAM-117
**Repo:** https://github.com/Egotistical-Engineering/hermes (Egotistical-Engineering)

---

## What Hermes Is

Hermes is an AI-guided markdown writing tool built around a "dignified technology" philosophy: Claude acts as a reader/editor, not a ghostwriter. The model never rewrites your text unprompted — it asks probing questions, flags weaknesses, and proposes small targeted edits via inline highlights, but authorship stays with the writer.

**Stack:** React 19 + Vite (web), Tauri (native), Express 5 + TypeScript (server), Claude Sonnet 4.6, Supabase (PostgreSQL + Auth), TipTap + ProseMirror decoration layer.

**Core loop:** User sends a chat message → server sends document + conversation history to Claude → Claude streams a response and may call `add_highlight` tool → frontend renders colored highlights inline on the text → user clicks highlight to see comment and take action.

---

## Annotation Model

### Eight feedback types

| Type | Color | When used | Requires `suggestedEdit` |
|------|-------|-----------|--------------------------|
| `question` | blue | Unclear intent, asks for clarification | no |
| `suggestion` | yellow | Structural/conceptual improvement | no |
| `edit` | green | Specific text replacement | yes |
| `voice` | purple | Passage sounds unlike writer's established voice | no (requires prior essays) |
| `weakness` | red | Weakest argument or thinnest section | no |
| `evidence` | teal | Where examples/data/anecdotes would strengthen | no |
| `wordiness` | orange | Could be said in fewer words | yes |
| `factcheck` | pink | Claim needing citation or potentially wrong | no |

### Data structure per annotation

```typescript
type HighlightData = {
  id: string;             // "h{counter}-{timestamp}"
  type: FeedbackType;
  matchText: string;      // exact verbatim substring from document
  comment: string;        // shown in popover
  suggestedEdit?: string; // edit + wordiness types only
};
```

### How they're triggered

All feedback is conversational — there is no "analyze" button. The user sends a message, Claude decides whether highlights are warranted, and emits them via tool call mid-stream. The system prompt instructs Claude to use highlights sparingly (1–4 per response) and to skip them entirely on empty or very short documents.

### Text anchoring

Server-side: `stripMarkdown()` converts content to flat text before sending to Claude. Client-side: `getDocFlatText(doc)` walks the ProseMirror tree concatenating text nodes. Highlight positions are resolved via `flatText.indexOf(matchText)` → `flatOffsetToPos()` to get ProseMirror coordinates. `Decoration.inline()` is then applied with a type-specific CSS class and `data-highlight-id`.

**Failure mode:** `indexOf` breaks on duplicate passages — the first occurrence always wins. There is no fallback.

### Interaction

- Click highlight → popover appears below the decorated span
- `edit`/`wordiness` types: **Accept** (replaces matchText with suggestedEdit in editor) or **Dismiss**
- Other types: **Reply** (pre-fills chat input) or **Dismiss**
- Outside click or Escape closes popover without dismissing
- Dismissed state: tracked in React state only — **lost on page reload**, not persisted

---

## Storage

Highlights are stored in two places (denormalized):
1. `projects.highlights` JSONB column — append-only via `append_highlights` RPC, capped at 200 total per project
2. `assistant_conversations.messages[n].highlights` JSONB — per-message history for conversation replay

On load, conversation history is replayed to restore highlight state from the last assistant message.

The `dismissed` flag is **never written to Supabase**. Dismissal is session-ephemeral.

---

## What's Worth Adopting in Margin

### 1. Streaming tool calls for real-time highlight delivery

Hermes emits `event: highlight` SSE events **mid-stream** as Claude calls `add_highlight` — highlights appear on the document while the chat response is still being typed. This is noticeably better UX than waiting for the full response to resolve before showing annotations.

**Margin relevance:** Margin's AI corrections currently arrive as complete responses. If Margin ever adds a conversational feedback mode (asking Claude about a selected passage), streaming tool calls would make the interaction feel immediate. The existing MCP tool infrastructure already uses the same Anthropic SDK pattern — the streaming plumbing would be additive.

### 2. Feedback type taxonomy as a design primitive

Hermes' eight-type taxonomy (question, suggestion, edit, voice, weakness, evidence, wordiness, factcheck) is well-considered — each type implies a distinct user action and has a distinct visual identity. The types don't overlap and cover the primary failure modes of prose.

**Margin relevance:** Margin's corrections today are undifferentiated — a correction is a correction. Introducing a feedback type dimension would enable:
- Color-coded highlights that signal intent before the user reads the comment
- Filtering ("show me only `weakness` flags")
- Synthesis pipeline weighting (a `factcheck` flag is more serious than a `wordiness` flag)

This is a concrete schema change: add a `feedback_type` column to `corrections` with the eight-type enum, or a Margin-specific variant. Low implementation cost, high UX leverage.

### 3. Accept/dismiss as first-class actions on the annotation

Hermes distinguishes three states: active, accepted, dismissed. Accept on `edit`/`wordiness` types applies the suggested replacement immediately. This is cleaner than Margin's current model where corrections require a separate synthesis step.

**Margin relevance:** For AI-generated corrections on a highlighted passage, an inline Accept button that writes the suggested text directly into the document would close the loop immediately. This would be a meaningful UX improvement for the "edit" and "wordiness" correction types — the user doesn't have to leave the document to act on the feedback.

### 4. Reply-to-highlight as a feedback gesture

Clicking a non-edit highlight pre-fills the chat input with the highlighted passage as context. This is a lightweight way to start a conversation about a specific annotation without losing document position.

**Margin relevance:** This maps cleanly to Margin's margin note model. A "reply" action on a margin note could pre-load a conversation context pointing at the annotated passage — useful if Margin ever adds a per-passage chat mode.

---

## What to Skip

### Ephemeral dismissed state

Not persisting dismiss decisions to the database is a product mistake. On reload, every dismissed highlight reappears. Margin already persists annotation state to SQLite — this is a non-issue, but it's worth noting as an anti-pattern to avoid.

### `indexOf` text anchoring

Hermes' flat-text `indexOf` approach is fragile: first occurrence wins, duplicate passages silently anchor wrong, and edits break anchors with no recovery path. Margin's existing 4-tier fallback (exact position → text+context → text alone → orphan) is strictly superior. Don't regress to indexOf.

### JSONB highlight storage with 200-item cap

Denormalizing highlights into a project's JSONB column and enforcing a hard cap (200 total) is a pragmatic shortcut for a startup's v1. Margin's relational `annotations` table with proper rows is more correct and scales better. Keep it.

### Offline-first SyncEngine

Hermes has a non-trivial `packages/offline` package with a `DataSourceAdapter` interface and `SyncEngine` for offline writes. Margin is a Tauri desktop app with SQLite — it's inherently offline-first by design. This pattern doesn't apply.

---

## Recommended Follow-up Issues

These are concrete improvements Hermes' model suggests, scoped as separate tickets:

1. **Add `feedback_type` to corrections** — introduce the eight-type enum (or a Margin-specific subset) to the `corrections` schema. Enables color-coded highlighting, filtering, and weighted synthesis. Low risk, additive schema change.

2. **Inline Accept action on `edit`-type corrections** — when a correction has a `suggested_edit` value, surface an Accept button that writes the replacement directly into the TipTap editor. Closes the loop without requiring a round-trip through the synthesis pipeline.

3. **Conversational feedback mode for highlighted passages** — allow the user to select a passage and open a Claude conversation anchored to that selection, with streaming tool calls emitting highlights mid-response. This is the full Hermes interaction model applied to Margin's annotation UX.

---

## Summary Assessment

Hermes is the closest public implementation to what Margin's AI feedback layer could become. The philosophy is identical — the AI deepens reading/writing, never replaces it. The most transferable patterns are (1) the feedback type taxonomy as a schema primitive, (2) streaming tool calls for real-time highlight delivery, and (3) inline Accept/Dismiss as first-class annotation actions. The text anchoring and storage approaches are both weaker than Margin's existing implementations and should not be adopted.

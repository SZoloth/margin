# Tambo Generative UI SDK — Investigation

**Ticket:** SAM-121
**Date:** 2026-03-17
**Beacon:** #159 — [tambo-ai/tambo](https://github.com/tambo-ai/tambo)

## What is Tambo?

Tambo is a React SDK for generative UI — AI agents that dynamically select and render React components in response to user messages, not just text. The core mechanic: you register React components with Zod schemas, which become LLM tool definitions automatically. The AI picks the right component, generates its props, and streams the rendered result into the chat UI in real time.

It is not a chatbot library. It is infrastructure for making UI components the AI's output medium.

**Stats:** 11k GitHub stars, 135 npm versions of `@tambo-ai/react`, actively maintained (last commit March 16 2026), v1.2.2, MIT licensed.

## How it works

### Two component models

**Generative components** — AI selects and instantiates these per message. Each message gets a fresh rendered component. You register these in a `TamboComponent[]` array:

```tsx
const components: TamboComponent[] = [
  {
    name: "CorrectionCard",
    description: "Shows a writing correction with the original text and suggested fix",
    component: CorrectionCard,
    propsSchema: z.object({
      original: z.string(),
      suggestion: z.string(),
      ruleViolated: z.string(),
      severity: z.enum(["low", "medium", "high"]),
    }),
  },
];
```

**Interactable components** — Pre-placed in the UI, but Tambo can observe and update their props via conversation. Uses a `withTamboInteractable` HOC and `useTamboComponentState`. Useful for sidebar panels or annotation overlays that the AI modifies live.

### Provider setup

```tsx
<TamboProvider
  apiKey={import.meta.env.VITE_TAMBO_API_KEY}
  userKey={currentUserId}
  components={components}
>
  {children}
</TamboProvider>
```

No Next.js required — works with Vite directly.

### Key hooks

| Hook | Purpose |
|------|---------|
| `useTambo()` | Messages, streaming state, thread management |
| `useTamboThreadInput()` | User input, image uploads, submit, isPending |
| `useTamboStreamStatus()` | Prop-level streaming progress |
| `useTamboComponentState()` | Bidirectional state sync for interactable components |
| `useTamboSuggestions()` | Contextual follow-up suggestions |
| `useTamboVoice()` | Voice input/transcription |

## Integration requirements

**Tambo requires a backend.** It is not a pure client library. Every conversation routes through `api.tambo.co` (or your self-hosted Tambo instance). The backend handles LLM orchestration, conversation persistence, tool calling, and component selection — you do not write this logic.

**Self-hosting is available** via Docker Compose (NestJS API + Next.js UI + PostgreSQL 17). You supply your LLM provider keys to the self-hosted stack; the React client never holds LLM credentials.

**LLM providers supported:** OpenAI, Anthropic, Google Gemini, Groq, Mistral, any OpenAI-compatible endpoint. Provider configuration is done in the Tambo console (cloud) or self-hosted config — not in client code.

**Authentication:**
- `userKey` — simple string identifier for thread scoping. Sufficient for single-user desktop apps.
- `userToken` — OAuth JWT for multi-user apps.

## React 19 + Tauri webview compatibility

**React 19: fully supported.** Peer dependency is `^18.0.0 || ^19.0.0`. The showcase app runs React 19.

**Tauri webview: should work.** The React SDK is a client-side library with no SSR requirement. It uses `fetch` for HTTP streaming — available in Tauri's Chromium/WebKit webview with no special configuration. No WebSockets detected. No Node.js APIs required in the renderer.

**One friction point:** `react-media-recorder` (voice dependency) uses `MediaRecorder` API. Behavior may vary on macOS WebKit. Only relevant if using `useTamboVoice` — irrelevant for text-based annotation surfaces.

**One security consideration:** The `VITE_TAMBO_API_KEY` is baked into the bundle. For a single-user desktop tool like Margin this is acceptable (same as any desktop app with embedded credentials). Self-hosting eliminates this exposure entirely.

## Fit for Margin annotation surfaces

### Where Tambo could add value

Margin renders AI feedback as plain text today. The surfaces where Tambo's generative UI model would be genuinely useful:

**Correction cards** — Instead of a text description of a correction, the AI renders an interactive component with the original text, suggested fix, rule violated, and a one-click "apply" button. The user sees a structured card, not a paragraph.

**Rule violation overlays** — AI agent identifies a violation in the editor and renders a rich inline component: highlighted text, rule name, severity badge, suggested rewrite with diff view.

**Writing rule suggestions** — After synthesizing patterns from annotations, the AI renders a `RuleSuggestionCard` component with accept/reject/modify actions directly in the conversation.

**Contextual follow-ups** — `useTamboSuggestions()` can surface contextual next-question chips after each AI response (e.g., "Apply all corrections", "Show rule explanation", "Add exception").

### Where it doesn't fit

Margin's annotation system (highlights, margin notes) is already implemented in TipTap with a custom SQLite-backed persistence model. Tambo does not replace this — it would add a conversational AI layer on top. The annotations themselves stay in the existing stack.

Margin's writing guard hook is Rust + hook-layer enforcement — that pipeline doesn't change with Tambo. Tambo is only relevant for the UI surfaces that render AI feedback to the user.

### Build vs adopt tradeoff

**The core value Tambo provides** that would otherwise require custom work:
- Zod schema → LLM tool definition pipeline (eliminates hand-rolling tool specs)
- Prop-level streaming into components
- Thread persistence without a local DB
- `interactable` component pattern (AI-driven prop updates on pre-placed UI)

**What you're taking on:**
- Cloud or self-hosted backend dependency
- An API key in the bundle (or self-hosted credential management)
- An external SDK's abstractions over LLM providers (versus using Anthropic SDK directly, which Margin already does via the MCP layer)

**The key question:** Margin's current AI features go through the MCP layer (Rust → MCP → Claude). Adding Tambo would introduce a second AI pathway (React → Tambo → LLM). This creates two parallel AI surfaces with different orchestration models, which is a complexity cost.

## Recommendation

**Adopt Tambo's *patterns*, not the SDK — at least initially.**

The generative UI concept is directly applicable to Margin's correction and rule violation surfaces. The specific Tambo mechanics worth adapting:

1. **Component registration with Zod schemas** — even without Tambo's backend, defining a `CorrectionCard`, `RuleViolationBanner`, and `RuleSuggestionCard` with typed prop schemas makes the AI's output structured and enforceable.

2. **Streaming into components** — achievable with the existing Anthropic SDK's streaming + React state. Not unique to Tambo.

3. **Interactable pattern** — worth stealing: pre-placing annotation-aware components in the editor that the AI populates vs. generating new components per message.

**If Margin ever adds a persistent conversational AI panel** (a "writing coach" sidebar), Tambo becomes a strong candidate for the frontend layer. The self-hosted deployment path means no vendor lock-in on the cloud service. At that point, the integration would be: Tambo backend (self-hosted) → Anthropic, Margin Rust backend → Tauri commands, Tambo React SDK → Tauri webview.

**Short-term action:** File a follow-up issue to design the `CorrectionCard` and `RuleViolationBanner` components as typed React components with Zod prop schemas — independent of Tambo adoption. This is the architectural precondition for generative UI regardless of which SDK eventually drives it.

## References

- [GitHub: tambo-ai/tambo](https://github.com/tambo-ai/tambo)
- [Tambo docs](https://tambo.co/docs)
- [Self-hosting guide](https://github.com/tambo-ai/tambo/blob/main/SELF_HOSTING.md)
- [npm: @tambo-ai/react](https://www.npmjs.com/package/@tambo-ai/react)

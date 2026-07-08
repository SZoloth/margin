# Margin — Design Reference (July 2026)

_Durable design control surface for the experience work (Horizon 3). Built from primary sources Sam had already collected: the Moss editor (extracted from `/Applications/Moss.app`, v0.8.2 — a shipping Claude-in-a-writing-app), and the designer repos/threads in his X bookmarks + GitHub stars (via beacon). This doc is the thing cheaper future sessions execute H3 from without re-researching._

## 0. The north-star sibling: Moss

Moss (`com.brsbl.moss`) is the single most useful reference because it's not a mood board — it's a **shipping product solving Margin's exact problem**: a warm-cream, considered, native-feeling writing app with Claude built in (`@anthropic-ai/claude-agent-sdk`), React 19, Lexical editor. Its palette is almost Margin's already. Where Margin is serif-editorial-*reading*, Moss is sans-*editing* — so we steal its craft and system discipline, not its type identity.

## 1. Tokens to adopt or adapt (concrete values)

Margin's existing cream/Newsreader/Tufte token layer was confirmed excellent in the July design audit. These are **additions/refinements** proven in Moss:

| Token | Moss value | Margin action |
|---|---|---|
| **Ink-tinted elevation shadow** | `0 8px 24px rgba(72,67,60,.08)` — tinted with the ink color, not black | Adopt using Margin's ink. Black shadows make cream look muddy; this is the single highest-value steal. |
| **Faint floating shadow** | `0 -1px 6px rgba(0,0,0,.025), 0 1px 6px rgba(0,0,0,.025)` (symmetric) | For popovers/toolbars that hover without a heavy drop. |
| **Brand focus ring everywhere** | `*:focus, *:focus-visible { outline-color: #378055 }` | Replace browser-blue globally with Margin's accent. Cheap, consistent, reinforces brand as a functional signal. |
| **Agent-context selection** | separate subtler bg (`#f7f3ee`) distinct from normal text selection (`#E8E7E3`) | When Margin sends text to Claude as context, give it its own quiet treatment — makes agent involvement legible without shouting. |
| **6-swatch highlight palette** | green `#E2F4D9` / yellow `#FFF4C3` / orange `#FFE2CC` / blue `#DDEBFF` / red `#FFD9D9` / purple `#E8DDFF`, pastel | Margin already has multicolor highlights; align to a curated pastel set, `rounded-full` swatches, badge-dot on the trigger showing current color. |
| **Dedicated search-mark yellow** | `#fef3b5`, separate from highlight-yellow | Separate "user highlight" from "system match" — don't reuse one yellow for both. |
| **Motion vocabulary** | ~one transition: `background-color .15s ease`; standard `cubic-bezier(.4,0,.2,1)`; **no spring/bounce anywhere** | Confirms Margin's 120ms register. Quiet, quick motion reads as "considered." Skeleton/streaming: opacity 0→.3 pulse. |
| **Two line-heights at one size** | chrome text 14px/1.25 vs reading text 14px/1.5 | Deliberately distinguish chrome from prose even at the same font-size. |

## 2. Designer primary sources (from Sam's bookmarks — read these before H3)

The three named designers, with the actual material Sam saved:

- **Josh Puckett** (richest cluster, 5 bookmarks) — the *how*:
  - "melty and organic feeling" UI elements in code: https://x.com/joshpuckett/status/2049699225701884149
  - "always make a jig" — build a small custom tool to dial in a UI (e.g. a curved-path editor): https://x.com/joshpuckett/status/2050978027417559523. **Directly applicable**: Margin should build its own compliance/blind-lineup harness as a "jig" (see pipeline strategy).
  - on product designers' primary output: https://x.com/joshpuckett/status/2048141632760074404
- **Benji Taylor** — `benjitaylor/agentation` (GitHub star): "the visual feedback tool for agents." His actual repo, agent-facing feedback UI — adjacent to Margin's correction-feedback surface.
- **Rauno Freiberg** — `raunofreiberg/motion` (GitHub star): his animation library for React. Source material for the motion feel.
- **Emil Kowalski** (adjacent, Sam tracks him) — design-skill-file tips: https://x.com/emilkowalski/status/2031742178297335879; distilled into `kylezantos/design-motion-principles` skill (Kowalski + Krehel + Tompkins).

Design-engineering skill packs Sam starred (taste-as-enforceable-rules — same architecture as Margin's writing guard, applied to visuals):
- `ibelick/ui-skills` — "Skills for Design Engineers"
- `vercel-labs/design-systems-to-agent-skills`
- `zeke/swiss-design-skill` — Swiss style as an agent-consumable ruleset
- `pbakaus/impeccable` — `npx impeccable detect` scans for 25 design anti-patterns (typography/color/layout/motion), no LLM, CI-ready JSON. **This is the writing guard's architecture in the design domain** — a candidate model for a future Margin "design guard."

## 3. The steal / avoid list (adapted to Margin's serif-editorial character)

**Steal:**
1. Ink-tinted elevation shadows (§1).
2. Brand-accent focus ring globally (§1).
3. Separate "agent is reading this" vs "I selected this" highlight treatments (§1).
4. **Markdown-native annotation storage** — Moss stores comments as inline `{%c:ID%}...{%/c%}` spans + one trailing HTML-comment JSON footer, keeping notes as portable plain-markdown with no sidecar DB. Margin uses SQLite; worth evaluating a portable-markdown export mode so a user's annotations travel with their files (also the iA Writer "config travels with content" point).
5. **Regex-classified acknowledgment phrases** — Moss shows an instant, no-LLM "on it" line chosen by regex-classifying the user's instruction (fix / quick-edit / deep-think / draft), plus rotating progress-stage strings ("Reading pages…", "Applying edits…"). Zero-latency personality masking real latency. Trivially portable.
6. **Delayed-show-on-ready window** — hide until `did-finish-load` with a hard timeout fallback; kills the white-flash-on-launch. Matters more for a "considered cream" app than for Moss.
7. Quiet, single-transition motion vocabulary (§1) — this IS the Puckett/Kowalski register for an editorial tool; springs would be wrong here.
8. **Calibrate polish inversely to frequency** (Taylor's rule): over-invest in Margin's least-visited surface (the Style Memory dashboard) — a genuinely finished empty state, a small delight when a rule is earned.
9. **Shared-element popover motion** (Taylor): the note popover originates from the highlight it belongs to, not a centered modal. Nothing teleports.
10. Radix-popover swatch mechanics with a badge-dot showing current selection (Moss's highlight trigger).

**Avoid (given serif-reading, not sans-editing):**
1. Moss's all-Inter, chrome-first type hierarchy on *reading* surfaces — keep Margin's Newsreader identity; use dense UI scales for chrome only.
2. A floating *formatting* toolbar (bold/italic/indent) as the primary text interaction — Margin's verbs are highlight/comment/ask, not restructure. Adapt the popover mechanics, strip the editing verbs.
3. `⌘K = "new action"` command-palette-as-editor-entry framing — Margin's Claude surface is reader/annotator-shaped ("ask/annotate"), not "command my document."

## 4. Mapping to Margin's surfaces

- **Reader (primary):** motion + shadow refinements only; the reading surface stays near-still. Add the agent-context selection treatment if/when Margin sends passages to Claude.
- **Note popover:** shared-element origin from the highlight; ink-tinted floating shadow; Radix swatch + badge-dot; annotation verbs only.
- **Style Memory dashboard (least-visited → most polish):** the one place to spend delight budget. One dense legible visual object (Singer/Weathergraph), not tab-per-stat.
- **Chrome (menus, window):** brand focus ring; delayed-show-on-ready; quiet transitions; native menus already fixed in the July design pass.

## 5. What NOT to do (anti-patterns that would break the illusion)

Library-default transitions applied uniformly; centered modals detached from their trigger; uniform delight (confetti everywhere); tab-per-stat dashboards; any effect that breaks text selection/copy on the reading surface; bespoke per-feature colors instead of the one disciplined palette; loud illustrated onboarding on a serious reading tool.

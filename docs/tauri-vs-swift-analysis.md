# Tauri vs. Native Swift: Strategic Analysis for Margin

## Context

Margin exists in two parallel implementations: a **feature-complete Tauri app** (React 19 + Rust + TipTap, ~6,700 LOC across frontend+backend) and a **75%-complete Swift rebuild** (SwiftUI + GRDB + NSTextView, ~3,700 LOC). Both share the same SQLite database (`~/.margin/margin.db`). The question is which to invest in going forward.

---

## Tauri Pros

| Advantage | Evidence |
|-----------|----------|
| **Feature-complete today** | Floating toolbar, undo toast, tab drag reorder, TOC, ARIA accessibility, margin gutter indicators, staggered animations — all shipped |
| **TipTap editor is battle-tested** | ProseMirror-backed rich editing with custom extensions (MultiColorHighlight, MarginNote). Markdown serialization built-in. Years of ecosystem maturity |
| **4-tier text anchoring works** | Exact pos → text+context → fuzzy scoring → orphan. This is the hardest feature to replicate and it's done |
| **Web tech velocity** | Hot reload via Vite (<100ms). CSS custom properties for theming. Rapid iteration on UI |
| **Cross-platform option** | If you ever want Linux/Windows, Tauri gives it for free. Swift locks you to Apple |
| **Zero TODO/FIXME debt** | Clean codebase. TypeScript strict mode with 14 checks enabled |
| **Ecosystem depth** | npm has a package for everything. TipTap extensions, markdown plugins, accessibility tooling |

## Tauri Cons

| Disadvantage | Evidence |
|--------------|----------|
| **~80MB bundle** | WebView + Rust backend + SQLite. Swift app would be ~15MB |
| **Two languages, two build systems** | Node + pnpm + Vite + Rust + Cargo + Tauri CLI. Six tools to keep updated |
| **50+ npm dependencies** | Supply chain surface area. Lockfile churn. Occasional breaking updates |
| **NSTextView gap** | TipTap wraps a web contenteditable, not a native text view. Selection behavior, spell check, system Services menu, dictation — all subtly wrong vs. native |
| **Memory overhead** | WebView process + JS runtime + Rust backend. For a reading app, this is heavy |
| **Tauri v2 is young** | Active development means breaking changes. Plugin ecosystem thinner than Electron's |
| **No native feel** | CSS can approximate macOS aesthetic but never match it. Scroll physics, text selection handles, context menus, toolbar blur — all slightly off |

---

## Swift Pros

| Advantage | Evidence |
|-----------|----------|
| **~15MB bundle** | Native binary. No WebView, no JS runtime |
| **2 dependencies** | GRDB + swift-markdown. Minimal supply chain risk |
| **True native text editing** | NSTextView gives you system spell check, Services menu, dictation, proper IME, native selection — for free |
| **Single language** | Swift throughout. One build system (`swift build`). One mental model |
| **macOS integration depth** | Spotlight (mdfind), DispatchSource file watching, NSOpenPanel, @AppStorage, NSPasteboard — all first-class |
| **Performance** | No JS overhead. Native rendering. Lower memory footprint for a reading app that's open for hours |
| **App Store ready** | Native Swift apps have smoother signing, notarization, and App Store submission |
| **SwiftUI momentum** | Apple's investment direction. Gets better each WWDC. Automatic support for new OS features |

## Swift Cons

| Disadvantage | Evidence |
|--------------|----------|
| **25% feature gap** | Missing: floating toolbar, undo toast, tab drag, TOC, search debouncing, file watcher debouncing, keyboard accessibility |
| **6 critical bugs found on first audit** | Tab dirty flag, keep-local save, JSONL export, mdfind injection, highlight wipe, FTS5 syntax (now fixed) |
| **NSTextView + SwiftUI is painful** | NSViewRepresentable wrapping is fragile. Highlight reapply, selection restore, settings sync — all have edge cases |
| **No rich editor equivalent** | TipTap gives you inline formatting toolbar, markdown round-tripping, custom marks/nodes. NSTextView is bare metal — you build everything yourself |
| **Text anchoring not wired** | TextAnchoring.swift exists but is dead code. Editor uses naive exact+search fallback. The 4-tier system must be ported |
| **Apple-only** | No cross-platform path. If you ever want that, you'd need a separate codebase |
| **SwiftUI limitations** | No built-in drag-reorder for custom tab bars. ScrollView doesn't expose scroll offset easily. Popover positioning requires geometry hacks |
| **~900 LOC dead code** | CorrectionStore, document_tags, unused utilities — needs cleanup |

---

## The Real Question

This isn't "which tech is better" — it's **"what's the product strategy?"**

### Choose Tauri if:
- You want to **ship features fast** and iterate on UX
- Cross-platform is even a remote possibility
- The editor experience (TipTap) is a core differentiator you want to keep extending
- You're comfortable maintaining two languages and a larger dependency tree

### Choose Swift if:
- Margin is a **personal tool / Mac-only product** and will stay that way
- Native feel matters more than feature velocity (reading apps live in the "texture" of the OS)
- You want a codebase you can maintain solo with minimal dependency rot
- You're willing to spend 2-4 weeks closing the 25% feature gap
- App Store distribution or system integration (Shortcuts, Share Extension) is on the roadmap

### The hybrid option:
- **Keep both alive temporarily.** Tauri is your production app. Swift is the long-term bet.
- Use Tauri as the spec — port features methodically to Swift using compound product loops
- The shared SQLite database means you can switch between them without data migration
- When Swift reaches parity, deprecate Tauri

---

## Effort Estimate to Close the Swift Gap

| Feature | Complexity | Estimate |
|---------|-----------|----------|
| Floating toolbar (NSTextView geometry) | Hard | 1-2 days |
| Undo toast | Easy | 2 hours |
| Tab drag reorder | Medium | 4 hours |
| Table of contents | Medium | 4 hours |
| Search + file watcher debouncing | Easy | 2 hours |
| Wire TextAnchoring to editor | Medium | 4 hours |
| Keyboard accessibility pass | Medium | 4 hours |
| Dead code cleanup | Easy | 1 hour |
| Corrections UI (export integration) | Medium | 4 hours |
| **Total** | | **~5-7 days** |

---

## Recommendation

**Invest in Swift, use Tauri as the reference implementation.**

Margin is a reading app — the native text experience matters more than web tech velocity. The 5-7 day gap is closable, and the long-term maintenance burden of Swift (2 deps, 1 language, 1 build tool) is dramatically lower than Tauri (50+ deps, 2 languages, 6 build tools). The shared SQLite database makes the transition zero-risk.

The only blocker worth pausing on: if TipTap's editor extensibility (custom marks, inline formatting toolbar, markdown round-tripping) is something you plan to push hard on, NSTextView will fight you every step of the way. In that case, Tauri's web-based editor wins on capability ceiling.

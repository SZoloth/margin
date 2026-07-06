# Margin — Design Authority Audit (July 2026)

_Senior-product-designer pass, 2026-07-06, run against the repaired build (post loop-repair merge, commit a38306b) as a real app on macOS. Viewports: the brief asked for desktop/tablet/phone in a browser; Margin is a Tauri desktop app with an 800px minimum window and no browser surface, so the honest equivalents used were **wide (~1450px)**, **default (~1200px)**, and **minimum (~815px)** windows, in both light and dark themes. Evidence screenshots for the fixes land in `reports/design-audit-evidence/`._

## 1. Taste baseline (derived before touching anything)

**Product intent in 3 lines:** A single writer (Sam today, one or two peer writers next quarter) reads and annotates documents; underneath, corrections become enforceable writing rules. The surface must disappear into the reading. Character: a quiet editorial instrument — Tufte-warm, serif, chrome that whispers; premium through restraint, never through decoration.

**Docs and tokens as hypotheses:** The token system (warm cream `#fffff8` page, Newsreader serif at 65ch/1.72, six-step UI type scale, radius and easing scales, warmed semantic colors, dark theme that preserves warmth) is genuinely coherent and was **confirmed, not revised** — every place the app feels right, it's because these tokens are being obeyed. The product strategy doc's UX north star ("minimum friction between feedback and effect") held up as the correct judgment standard.

**What this product should feel like at its best:** opening a paper book that happens to know things. Everything visible earns its place by serving reading or the correction loop; anything that explains the system instead of the text is a defect. Gradients, glassmorphism, decorative motion: not earned, correctly absent. The existing micro-interaction language (120ms transitions, entrance/exit easings) is the right amount of life.

**Verdict against the baseline:** the reading surface and token layer are excellent. The failures are all in the *connective tissue* — chrome, state restoration, and discoverability — where the app quietly assumes its only user already knows everything.

## 2. What was improved and why (ranked by impact)

### L2 — Native menu bar (isolated commit)

**Before:** the File menu contained exactly one item — "Close Window." The View menu rendered nothing. Every capability (open ⌘O, export ⌘⇧E, find ⌘F, Style Memory ⌘⇧M, Settings) existed only as an undocumented keyboard shortcut. Settings had **no route at all** except a link inside the export popover. For the app's strategy — first external users this quarter — this was the single largest failure: the standard macOS discoverability surface was a void, which is also an accessibility failure (no pointer-only path to most features).

**After:** a real menu bar — Margin (About, Settings… ⌘,), File (Open… ⌘O, Export Annotations… ⌘⇧E, Close Window), Edit (full clipboard set), View (Find… ⌘F, Style Memory ⌘⇧M, Fullscreen), Window. Custom items emit a `menu-action` event; the frontend maps ids onto the exact code paths the shortcuts already used (single behavior path, no drift). Settings gains ⌘, — its first keyboard route.

**Why menus, not a toolbar:** the character brief says chrome whispers. Menus are invisible until asked for, which is exactly the product's own aesthetic, and they teach the shortcuts in place.

### Correctness fixes (L1, unconditional)

1. **TOC absent after every app launch** (`useTableOfContents.ts`). Restored tabs set content with `emitUpdate=false`; the hook only listened for `"update"`, so heading extraction ran against an empty editor and never re-ran. Navigation was missing on every session start until the user happened to type. Fixed by listening to `"transaction"` (fires on external sets too); regression test proves red-on-bug/green-on-fix (`src/hooks/__tests__/useTableOfContents.test.tsx`).
2. **Style Memory header reported "0 ACTIVE RULES" over a 232-rule corpus** (`StyleMemorySection.tsx`). The stat was only populated by the Rules tab's own load, which never runs until that tab is clicked. The product's core asset, displayed as zero on its own dashboard — the single worst copy/data moment in the app. Fixed by loading the count on section mount.
3. **Find bar unclosable from keyboard when unfocused** (`FindBar.tsx`). Escape was handled only on the bar's input; click into the document and the bar stuck open. Window-level Escape while open.
4. **TOC dot-rail contrast** (`toc.css`): collapsed-mode dots at opacity 0.4 on secondary text color were near-invisible in dark mode; 0.55 keeps the whisper while surviving the dark theme.

## 3. What was verified and left alone (positive findings)

- Reading surface: measure, leading, serif rendering, `text-wrap: balance/pretty` — no changes warranted at any width.
- Narrow window (~815px): TOC collapses to the dot rail with hover tooltips; text reflows cleanly; no horizontal scroll, overflow, or clipping anywhere tested, including popovers anchored near window edges.
- Dark mode: full-surface token remap holds, including dark highlight variants and popover chrome. Charming detail: highlight swatches in Settings show their dark values.
- Dashboard (Settings → Dashboard): giant-numeral Tufte stats with honest staleness ("121d ago LAST TESTED"), correct rule count via its own query, per-type table with signed deltas. Best-designed screen in the app.
- Note popover intent chips (correction/note/prompt), polarity +/− controls, floating toolbar: consistent radii, spacing rhythm, and token use in both themes.
- Export popover: reports the intent split plainly ("1 correction, 1 prompt skipped") — copy that helps the user act. Good.

## 4. L3 proposals (not executed — need product owner sign-off)

1. **First-run/empty surface.** With no document open, the app is a blank cream void; onboarding exists as toasts only. Propose a single quiet start card (recent documents + "Open… ⌘O" + one line about the loop). This is the remaining discoverability cliff for the first external user.
2. **Retire or populate the "Violations" column** (Dashboard per-type table) — currently reads "none" in every row; a dead column costs scan attention on the app's best screen.
3. **Register/channel field on writing rules** — schema change through Rust migrations, already specced in the rules-audit apply notes; resolves the voice-calibration vs. ai-slop precedence at the data-model level instead of via `when_to_apply` prose.
4. **Find-bar state resurrects** after visiting Settings (reopens closed). Root cause likely in snapshot/restore of UI state; small but grating. Needs a short investigation, not folded into this pass blind.
5. **Version hygiene:** git tags stop at v1.8.5 while the app ships 1.16.2; the App Store-style About panel shows metadata from defaults. Tag on release (fixed as part of this release cycle) and populate `AboutMetadata` properly.

## 5. Correctness table

| Surface | Window | Issue | Severity | Status |
|---|---|---|---|---|
| Reader (any doc) | all | TOC never renders after app relaunch until first edit | High | **Fixed** + regression test |
| Style Memory | all | "0 active rules" header over populated corpus | High | **Fixed** |
| Menu bar | all | File menu = "Close Window" only; no Settings route; capabilities keyboard-only | High (a11y + discoverability) | **Fixed** (native menus) |
| Find bar | all | Escape only works while input focused | Medium | **Fixed** |
| TOC dot rail | <1200px | Dot contrast ~0.4 opacity, near-invisible in dark | Low | **Fixed** (0.55) |
| Find bar | all | State resurrects after Settings round-trip | Low | Open (L3 #4) |
| Export popover | all | Stale "corrections saved" popover restored on relaunch | Low | Open (known P2 from repair report) |
| Reader/empty | all | No first-run surface; blank app without a doc | Medium (new users only) | Proposed (L3 #1) |
| Reader narrow | 815px | Overflow/clipping/horizontal scroll | — | None found |
| Dark mode | all | Contrast regressions | — | None found beyond dot rail |
| Popovers | narrow | Edge clipping | — | None found |

## 6. Design-system doc verdict

The documented system (tokens, type scale, easing, theme) survived contact with every page tested; no doc revisions were triggered. The gap the audit exposes is *coverage*, not correctness: the system says nothing about menus, empty states, or state restoration — the three places the app failed. Recommend adding a short "chrome and states" section to the design docs when the L3 empty-state work happens.

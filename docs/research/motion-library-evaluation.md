# Motion Library Evaluation

**Decision: Hold** — revisit when layout animations or gesture interactions become requirements.

## Premise check

The ticket asked: if Margin uses Framer Motion, is the `motion` library the migration path?

**Margin has zero animation library dependencies.** The three grep hits for "motion" in `src/` are:
- `RunButton.tsx` — Tailwind's `motion-reduce:animate-none` utility (CSS only)
- `globals.css` — `@media (prefers-reduced-motion: reduce)` media query (CSS only)
- `margin-tokens.json` — unrelated token naming

No migration needed.

## What raunofreiberg/motion actually is

The [linked repo](https://github.com/raunofreiberg/motion) is Rauno Freiberg's personal fork of the canonical `motion` library by Matt Perry / Motion Division. The real library is at `motion.dev` — it was extracted from the Framer product and published as a standalone open-source library. Rauno's fork was last touched July 2025 and is an experiment, not a published package.

Evaluation below is against the canonical `motion` npm package.

## Margin's current animation system

Zero JS animation dependencies. The system is:

- **CSS easing tokens**: `--ease-entrance`, `--ease-exit`, `--ease-micro`, `--ease-spring`, `--duration-fast/normal/slow`
- **CSS utility classes**: `.interactive-item`, `.btn-sm`, `.transition-entrance`, `.transition-exit`, `.transition-fade`, `.sidebar-list-item`, `.empty-state-entrance`
- **CSS keyframes**: `sidebar-item-in`, `empty-state-in`, `barFill`
- **`useAnimatedPresence` hook** (9 usages): manages mount/unmount lifecycle so exit transitions complete before DOM removal. Uses a double-`requestAnimationFrame` pattern for enter timing.
- **`prefers-reduced-motion`**: globally collapses all animations to 0.01ms

This covers all current animation needs with ~0KB runtime cost.

## Where Motion would add value (future scenarios)

The CSS approach has known gaps:

1. **Layout animations** — when element DOM position changes (e.g., annotations panel reflow), CSS can't interpolate between old and new positions. Motion's `layout` prop handles this automatically.
2. **Gesture-driven physics** — drag interactions with momentum/spring release (e.g., drag-to-dismiss annotation card). No CSS equivalent.
3. **Shared element transitions** — animating an element from one location to another across state changes.
4. **Interrupt-safe springs** — `useAnimatedPresence` uses a fixed-duration `setTimeout` that can glitch if open/close happens faster than the duration. Motion's spring engine handles mid-animation reversals correctly.

None of these are current requirements.

## Bundle cost

~34KB (full bundle) or ~5–10KB (selective imports via `m.*` components + `LazyMotion`). Real cost for a Tauri app where perceived performance matters.

## Recommendation

Don't adopt now. Trigger to revisit: any of these arrive as requirements:
- Annotations sidebar or corrections panel needs smooth content reflow (layout animation)
- A panel gets drag-to-resize with spring physics
- Document list navigation gets shared element transitions
- `useAnimatedPresence` double-rAF jitter becomes a user-visible bug

File a new issue when one of those lands. At that point, Motion is the right call.

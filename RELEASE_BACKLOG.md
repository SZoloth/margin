# Release backlog

Unreleased changes ready to ship.

## Features

- **Style Memory pipeline redesign.** Corrections and Rules tabs now have inbox/archive semantics. Corrections get `synthesized_at` tracking — export marks them synthesized instead of deleting. Rules get `reviewed_at` tracking with "To review" / "All" toggle. Stats bar shows pipeline health ("To process", "To review"). Source badges on rule cards. Style Memory section renders full-width, no longer crammed into the narrow settings column.

## Bug fixes

- **Fix settings button unresponsive without a document open.** AppShell only rendered `{children}` inside the reader grid (gated by `hasContent`), so the settings overlay never mounted when no file was loaded. Now renders children unconditionally.
- **Fix repeated "file was deleted" toast for existing files.** The focus handler treated any transient `stat` failure as a deletion and fired the toast on every window focus. Now retries once after 500ms before concluding deletion, deduplicates per path, and cancels stale listeners.

## Chores

- **Remove `dialkit` dev dependency.** Removed the `dialkit` package and its `DialRoot` overlay from `App.tsx`. `useDesignDials` now applies design tokens as static defaults instead of interactive dials.

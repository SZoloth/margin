# Design skills

Vendored, unmodified, MIT. Same pinned copies as samzoloth.com uses (read 2026-11-04):

| Skill | Author | Source |
|---|---|---|
| defaults, color, match | Raphael Salaja | github.com/raphaelsalaja/skills @ 31031e9 |
| find-animation-opportunities | Emil Kowalski | github.com/emilkowalski/skills @ c8a7962 |

Licenses: `LICENSE-raphaelsalaja`, `LICENSE-emilkowalski`. `verify-margin` is Margin's own.

## When to use them

- `find-animation-opportunities` before adding motion. Its proposals must fit the budget table in `docs/motion-spec.md`.
- `defaults` and `color` as a QA pass on new UI, in light and dark.
- `match` when working from a reference app or site. It writes compare pages to `.match/`, which is gitignored.
- Prove the result with `verify-margin`, as for any UI change.

## Precedence

`CLAUDE.md`, `docs/motion-spec.md`, the tokens in `src/styles/globals.css` and `docs/design-rules.md` win over these skills. Known conflict: Margin's rule that keyboard-initiated actions never animate (motion-spec rule 1) overrides any skill suggestion to animate a keyboard result.

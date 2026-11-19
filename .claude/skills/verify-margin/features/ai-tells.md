# AI tells lens

Margin marks phrases that make prose read machine-made, using the vendored Tells rules in `src/lib/tells/`. A tell looks like a rule match: an underline, and a card with the rule's note and a suggested fix. Only `flag`-tier rules show. Where one of the reader's own rules covers the same text, the reader's rule shows instead.

## Sub-features

- Tells are underlined in the open document and rescanned after each edit.
- Clicking a tell opens the rule card, labelled "AI tell", with the note and "Try: <fix>". It has no Replace button, because a tell's fix is advice, not replacement text.
- The "AI tells" switch in the Aa popover turns the lens off and on. The setting persists with the other reader settings.

## How to get to it (user POV)

Open any document. Tells are on by default. To turn them off, open Aa in the toolbar and switch off "AI tells".

## Driving it with drive.mjs

`node .claude/skills/verify-margin/scripts/drive.mjs ai-tells --theme both`

Types "I wanted to reach out to delve into the rich tapestry of logistics." as a new paragraph, waits for the rescan, and checks that "I wanted to reach out" and "rich tapestry" carry `tells:` decorations. Opens the card for the first and waits for the "[just reach out]" fix. Then turns the lens off in Aa, checks that no tell decorations remain, and turns it back on. Proof: the `marked`, `card`, `lens-off` and `lens-on` screenshots.

## Gotchas

- The toolbar with Aa hides until the pointer reaches the top edge. The journey moves the mouse there first.
- The stubs seed one personal rule, "leverage". It stays underlined with the lens off, which is how the journey tells personal rules from tells.

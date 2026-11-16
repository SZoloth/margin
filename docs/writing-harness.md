# Writing harness: product spec

Status: direction A chosen 15 Nov 2026 (ADR-012); nothing here is built, and building needs Sam's go-ahead. It follows ADR-010 (who writes depends on the writing type) and ADR-011 (Margin is a writing harness for people and agents), and ADR-012 records the choices it proposes. The four UX directions are a clickable page in the project files, `harness/harness-directions.html`.

## The problem this has to solve

Margin learns from corrections, and it has received none since March. Draft review (`docs/draft-review.md`) asked Claude, running in another app, to hand its draft to Margin. No draft came through in its first three days. The lesson is about where the tool sits. A tool collects before/after pairs only when the writer has to pass through it to finish the piece. Translation tools get every post-edit for free because the translator delivers from inside the tool. Code review gets every accepted and rejected change because the merge button lives there.

So the agent beside the text is the smaller half of this spec. Two moments decide whether Margin captures anything: how a piece starts, and how it leaves.

**This premise may be wrong.** A translator has to deliver from the tool. Nothing makes Sam start a piece in Margin; he can still draft in a chat and paste into Gmail. Eight months without a correction also fits "Sam doesn't want this step" as well as it fits "the tool sat in the wrong place". The harness only wins if starting in Margin is the shorter path: today a note takes a chat, a copy, a paste into Gmail and edits there; here it should take a brief, one review and one copy. And if the real obstacle to outreach is deciding to send, a better drafting surface does not remove it. The first slice exists to find out, which is why the order below stops after it.

## One setting, three positions

ADR-010's three modes are one setting: what Claude is allowed to put on the page. The writing type sets it. The interface has no mode picker.

| Writing type | Claude may | Claude may not | Shown as |
|---|---|---|---|
| Outreach, cover letter | Write the draft; propose changes to it | Apply a change without review | "Claude drafts, you edit" |
| Blog post, general | Offer items beside the text: a point, a question, a connection, a phrase, a short blurb | Change the text; offer anything longer than a blurb | "Claude offers, you write" |
| Essay, State of Sam | Flag a problem and say what it is | Supply any wording | "You write, Claude flags" |

Each limit is enforced by the shape of what Claude returns, the way the writing guard enforces rules at the tool and not in the prompt:

- In essay types the reply format has no field for replacement text. A flag is a location, a message and the check it came from. The message is free text, so it can still smuggle wording ("try X instead"). Two local checks close that: a flag is dropped if its message quotes anything that is not in Sam's passage, and at finish Margin compares the final text with every message Claude sent on that piece and reports any shared run of four or more words.
- In materials types every item has a kind and a length cap (a phrase up to 12 words, a point, question or connection up to 30, a blurb up to 40). A longer item is dropped before Sam sees it.
- In draft types a change is always a proposal. See "Changes to existing code" for the auto-accept that has to go.

One override exists: on a single piece, Sam can let Claude draft a type it normally doesn't. Margin records that the setting was moved, so the numbers for that type stay clean.

## The flow, by type

Every piece has the same four steps. Only step 3 differs.

**1. Start.** Two ways in.
- Sam presses ⌘N, picks a writing type and writes a brief: who it is for, what it should do, and the facts it may use. The brief is the first block of the document and stays visible.
- An agent hands one in. `margin_review_draft` already accepts a draft; it gains a `brief` field and can be called with a brief and no draft. This is the path for drafts that originate in another agent's pipeline.

**2. Claude works.** Margin runs the Claude Code that is already signed in on the Mac (`claude -p`, with no tools, in a scratch folder, given the brief, the text and one short skill for that writing type). There is no model runtime and no API key in Margin. If Claude Code is missing or signed out, Margin says so and names the fix.

**3. Sam works.**
- *Outreach, cover letter.* Claude's draft fills the page. Claude's words are a lighter ink until Sam changes them. Sam edits directly, or asks for a change ("shorter") and reviews each proposed change: keep, undo, or rewrite it himself. Sam can keep typing while a proposal waits. A proposal is tied to its "before" text: if Sam edits inside that text, the proposal is withdrawn and saved as "rewritten"; if he edits elsewhere, it is found again by its text, as highlights are.
- *Blog post, general.* Sam writes. Claude's items sit beside the paragraph they relate to. A phrase or blurb is pulled in as text. A point, question or connection is dropped in as a prompt, a marked line Sam writes over. Any item can be marked not useful.
- *Essay.* Sam writes. Up to five flags appear, each tied to a passage. Sam fixes the passage or marks the flag "not a problem".

**4. Finish.** One action ends the piece: "Copy to send" for outreach and cover letters, "Finish piece" for the rest. It copies the final text, saves the records below and shows a short receipt. A piece with prompts still in the text can't finish until they are written over or removed.

## What Margin saves

| Record | Fields | Types |
|---|---|---|
| Piece | writing type, brief, how it started (Sam or an agent), whether the setting was overridden, start and finish time | all |
| Agent run | what was asked, which skill version, Claude's untouched output | all |
| Proposed change | before, after, Claude's reason, outcome (kept, undone, rewritten), Sam's wording if rewritten | drafts |
| Held-back change | the change and the fact it would have dropped | drafts |
| Offered item | kind, text, passage it was tied to, outcome (pulled in, not useful, left alone) | materials |
| Flag | passage, message, the check it came from, outcome (text changed, "not a problem", left alone) | essays |
| Final | the text when finished, and where each word came from | all |

"Where each word came from" does not need per-keystroke tracking. For drafts it is a word-level comparison of the final text with Claude's last version, which `mcp/src/tools/drafts.ts` already computes as *still Claude's*. For materials, a pulled-in item carries a mark with its id, and at finish Margin checks whether the marked text is unchanged.

A before/after pair for the eval is then (brief, Claude's output, final). A check's score is how often its flags led to a change against how often Sam said "not a problem".

## What gets measured, and what the numbers can't say

- **Outreach and cover letters: pieces finished per week comes first.** *Still Claude's* comes second. It rises when the drafts improve and also when Sam edits less carefully, so it is read beside the pairs and never alone. Margin sees "copied", not "sent"; a later step can match the copied text against sent mail, and until then the receipt says "copied".
- **Blog and general: share of items used, and share of the final piece that traces to an item.** The second should stay low. If it climbs, the type has drifted into drafting. A point Sam absorbed without dropping it in is invisible to this count. That undercount is accepted; asking Sam to report it by hand is the kind of habit that already failed.
- **Essays: words from Claude must be zero.** The useful number is per check: right or wrong on Sam's essays. An earlier benchmark in this project found a plain Claude editor barely better than chance at predicting Sam's verdicts, which is why flags are capped at five and every "not a problem" is kept.

The word-level comparison has known errors. If Sam deletes a sentence and retypes the same words, they count as Claude's, which is right for "what share of what he sent did Claude write" and wrong for "what did he touch". If he moves a sentence, part of it counts as new.

None of these means much below about ten finished pieces of a type.

## Local fact check

Borrowed from Ink. When Claude proposes a change, Margin extracts names, numbers, dates, quoted strings and links from the text before and after, without a model. A change that drops one is held back and shown as a note ("This edit removed 2019, which is in your brief"), with a way to see it anyway. At finish the same check runs on the final text against the brief.

## Rules become checks

This follows ADR-011's note on order: the voice test decides what the skill contains. The spec assumes its likely outcome and changes if the test says otherwise.

- Claude reads one short skill per writing type. It does not read the rules file.
- Each correction becomes a yes/no check tied to the passage it was made on. The source is the corrections already in Sam's database, which stopped in March; new ones come from rewritten proposals and from flags. Checks run on Claude's output and on Sam's essays. Claude never reads them.
- Essay flags do not wait for checks. Until checks exist, a flag comes from Claude's own read and is labelled that way.
- A check that keeps being answered "not a problem" is retired. That answer is a manual step, and manual steps are what failed before. It is kept because it is also how Sam clears a flag from the page.

## Changes to existing code

- `useDiffReview` auto-accepts any change under 5% of the text (`AUTO_ACCEPT_THRESHOLD`). That suits a file edited outside Margin. It breaks ADR-011's rule that an agent's change is never applied silently, and a one-word change to a number is under 5%. Agent changes must skip it.
- The diff review makes the editor read-only while a review is open. In draft types Sam needs to keep typing with a proposal pending.
- Draft review's files under `~/.margin/drafts` become rows in SQLite, with the schema in the Rust migrations. This is a data-layer change under `docs/evals.md`.
- At 1280×720 the note card can cover the paragraph beside it (noted in ADR-008). Direction A depends on that being fixed. A's rule that one note is open at a time, with the rest as one-line stubs, is part of the fix.

## Cut

- A mode picker. The writing type sets the mode.
- A saved chat transcript. One ask line; the answer arrives as notes.
- Comments written into the Markdown file. A file that gets sent should not carry them. Notes stay in the database and export on request.
- A quiz for Learn mode, and any Learn work beyond the pending Mac build check. Nothing in this loop depends on it.
- New guard rules and new rule-manager features.
- New dashboards. One receipt per piece, one line per writing type.
- A queue of pieces inside Margin (direction D), apart from its finish action.
- Shared margins, a reading companion and a notes vault, as ADR-011 already says.

## Proposed order

Each step needs Sam's go-ahead. Estimates are guesses.

1. **Outreach slice** (about a week): brief block, run Claude Code, lighter ink, proposed changes without auto-accept, "Copy to send" with receipt, records saved. Stop here and use it for two weeks.
2. **Fact check** (a day or two).
3. **Essay flags** (a few days): reuses margin notes; depends on checks existing.
4. **Materials** (about a week): the newest interaction and the least evidence, so it goes last.

**Review point.** Two weeks after step 1 ships, count the outreach pieces that were copied out of Margin and then appear in Sam's sent mail (a read-only match, done by hand at the review, not built into the app). Copies alone don't count, because testing the build produces copies. Fewer than five means the harness has the problem draft review had, and steps 2 to 4 don't get built. Five is too few to say anything about draft quality; it only answers whether Sam uses it.

## Open questions

- Whether driving a Claude Code subscription from another app is acceptable for people other than Sam. Other tools do it; nobody here has checked the terms. It matters before a first outside user and not before.
- How long `claude -p` takes to return a first draft on Sam's Mac. If it is over about ten seconds, the start step needs a visible wait state.
- Whether an agent other than Claude Code (Codex) is worth supporting. ADR-011 mentions it; this spec assumes Claude only.
- with.md was listed as a model for comments stored in the file. An earlier check in this project found its comments live in its own database. Either way this spec keeps comments out of the file.

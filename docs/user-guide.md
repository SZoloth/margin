# Margin user guide

Margin is a Mac app for reading and annotating your own writing. What you flag becomes rules, and the rules stop your AI tools from writing the patterns you flagged.

## Install

1. Download the latest `.dmg` from [GitHub Releases](https://github.com/SZoloth/margin/releases/latest). Builds are for Apple Silicon Macs (M1 and later) on macOS 10.15 or newer.
2. Open the `.dmg` and drag Margin to Applications.
3. If macOS blocks the first launch, open System Settings → Privacy & Security and choose Open Anyway.

Margin checks for updates on its own. Settings → About shows your version and lets you check by hand.

## The loop

1. **Read.** Open a Markdown file with ⌘O. Draft something, or paste in what an AI wrote for you.
2. **Annotate.** Select text to highlight it. Add a note saying what's wrong, such as "too hedgy" or "I'd never say this". Notes default to corrections. Mark a passage you *like* as positive, so the system learns what to copy as well as what to avoid.
3. **Synthesize.** Open Settings → Writing rules. Corrections pile up under "to process". Choose **Synthesize**, paste the prompt it copies into Claude Code, and Claude proposes rules grounded in your corrections.
4. **Review.** New rules arrive as candidates. Accept the ones that sound like you, edit or reject the rest. Nothing is enforced until you accept it.
5. **Enforce.** Accepted rules are written to `~/.margin/writing-rules.md`, which Claude can read through Margin's connection. Turn on the writing guard (below) to block violations outright.
6. **Read the output and repeat.** Each pass makes the rules more precisely yours.

## Writing guard and what it touches

The writing guard is off by default. Turn it on in Settings → Integrations → Writing guard.

With it on, Margin edits files in `~/.claude` and `~/.codex` to add a hook that checks prose Claude Code or Codex writes against your rules, and rejects the write when it breaks one. With it off, Margin touches neither folder.

Turn it off again at any time. Your rules stay where they are.

Settings → Integrations also has a **Claude Desktop** switch that connects Claude Desktop to your library. Restart Claude Desktop after changing it.

## Your data

Everything stays on your Mac. Margin has no account and no server of its own. Its only network call is the update check.

- Library, highlights, notes and rules: `~/.margin/margin.db`
- Backups: `~/.margin/backups`. Margin takes one snapshot a day and one before each new version changes the database, and keeps the newest 7 of each. Settings → About → Backups shows the latest.
- Logs: `~/.margin/logs`. Errors and crashes are written here.

**Restore from a backup:** quit Margin, delete `margin.db-wal` and `margin.db-shm` from `~/.margin` if they exist, copy the backup file over `margin.db`, then reopen Margin.

## When something breaks

Settings → About → Diagnostics has **Show logs** and **Copy diagnostics**. The report holds your version, record counts, backup names and recent errors. It never includes your writing or your rules, and your home folder name is replaced with `~`. If you're sending a bug report, paste it in.

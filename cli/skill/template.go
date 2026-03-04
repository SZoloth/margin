package skill

import (
	"fmt"
	"os"
	"path/filepath"
)

const skillTemplate = `---
name: margin-cli
description: Margin reading & annotation CLI — highlights, margin notes, corrections, writing rules, and document search. Use instead of MCP tools for token efficiency.
---

# Margin CLI

CLI for the Margin reading and annotation app. Reads and writes to the Margin SQLite database at ~/.margin/margin.db.

## When to use

Use ` + "`margin`" + ` commands instead of the Margin MCP tools. They produce identical results with ~76%% lower token overhead.

## Commands

### Documents

` + "```bash" + `
margin docs list [--limit N]           # List documents, default 20, max 100
margin docs get <id>                   # Get document metadata
margin docs read <id>                  # Read document file content (text output)
margin docs search <query> [--limit N] # FTS5 search, default 20, max 50
` + "```" + `

### Annotations

` + "```bash" + `
margin annotations list <doc_id>       # Highlights + margin notes for a document
` + "```" + `

### Highlights

` + "```bash" + `
# Create by text search (finds text in document, auto-computes positions)
margin highlights create <doc_id> --text TEXT --color COLOR [--note TEXT]

# Create by position (explicit from/to)
margin highlights create <doc_id> --text TEXT --color COLOR --from N --to N

margin highlights delete <id>
margin highlights color <id> --color COLOR
` + "```" + `

**Valid colors:** yellow, green, blue, pink, purple, orange

### Margin Notes

` + "```bash" + `
margin notes create <highlight_id> --content TEXT
margin notes update <id> --content TEXT
margin notes delete <id>
` + "```" + `

### Corrections

` + "```bash" + `
margin corrections list [--doc ID] [--limit N]
margin corrections summary
margin corrections create <doc_id> --text TEXT --notes NOTE [--notes NOTE2] [--type TYPE] [--color COLOR]
margin corrections delete <highlight_id>
margin corrections set-type <highlight_id> --type TYPE
margin corrections set-polarity <highlight_id> --polarity POLARITY
margin corrections voice-signals [--polarity P] [--limit N]
` + "```" + `

**Valid polarities:** positive, corrective
**Valid writing types:** general, email, prd, blog, cover-letter, resume, slack, pitch, outreach

### Writing Rules

` + "```bash" + `
margin rules list [--type TYPE]
margin rules markdown [--type TYPE]     # Text output (markdown format)
margin rules create --text TEXT --type TYPE --category CAT --severity SEV \
  [--when T] [--why T] [--before T] [--after T] [--notes T] [--source T] [--signal-count N]
margin rules update <id> [--text T] [--severity S] [--type T] [--signal-count N] ...
margin rules delete <id>
` + "```" + `

**Valid severities:** must-fix, should-fix, nice-to-fix

### Export

` + "```bash" + `
margin export wait [--timeout N]       # Start HTTP bridge, wait for Margin app export
margin export profile                  # Regenerate ~/.margin/writing-rules.md + guard hook
` + "```" + `

### Utility

` + "```bash" + `
margin version
margin skill-install [--force]         # Install/update this skill file
` + "```" + `

## Output

- JSON to stdout (compact by default, ` + "`--pretty`" + ` for indented)
- Errors: ` + "`{\"error\":\"...\"}`" + ` to stderr, exit code 1
- Text commands (docs read, rules markdown): raw text, not JSON
- Global: ` + "`--db PATH`" + ` or ` + "`MARGIN_DB`" + ` env to override database path
`

// Install writes the skill file to ~/.claude/skills/margin-cli/SKILL.md.
func Install(force bool) error {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".claude", "skills", "margin-cli")
	path := filepath.Join(dir, "SKILL.md")

	if !force {
		if _, err := os.Stat(path); err == nil {
			return fmt.Errorf("skill file already exists at %s (use --force to overwrite)", path)
		}
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(path, []byte(skillTemplate), 0644)
}

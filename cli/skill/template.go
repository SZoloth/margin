package skill

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// cliReference is the LLM-agnostic CLI command reference used in all skill targets.
const cliReference = `# Margin CLI

CLI for the Margin reading and annotation app. Reads and writes to the Margin SQLite database at ~/.margin/margin.db.

## When to use

Use ` + "`margin`" + ` commands instead of the Margin MCP tools. They produce identical results with ~76% lower token overhead.

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
margin export profile --target codex   # Regenerate writing-rules.md + Codex AGENTS.md (no hook)
margin export codex                    # Regenerate ~/.codex/AGENTS.md with writing rules only
` + "```" + `

### Utility

` + "```bash" + `
margin version
margin skill-install [--force]                  # Install for Claude Code (default)
margin skill-install --target codex [--force]   # Install for OpenAI Codex
` + "```" + `

## Output

- JSON to stdout (compact by default, ` + "`--pretty`" + ` for indented)
- Errors: ` + "`{\"error\":\"...\"}`" + ` to stderr, exit code 1
- Text commands (docs read, rules markdown): raw text, not JSON
- Global: ` + "`--db PATH`" + ` or ` + "`MARGIN_DB`" + ` env to override database path
`

// skillTemplate is the Claude Code skill file format (with frontmatter).
const skillTemplate = `---
name: margin-cli
description: Margin reading & annotation CLI — highlights, margin notes, corrections, writing rules, and document search. Use instead of MCP tools for token efficiency.
---

` + cliReference

const codexBeginMarker = "<!-- BEGIN MARGIN CLI REFERENCE -->"
const codexEndMarker = "<!-- END MARGIN CLI REFERENCE -->"

// Install writes the skill file for the given target agent.
//
//   - target "claude" (default): writes to ~/.claude/skills/margin-cli/SKILL.md
//   - target "codex": merges CLI reference into ~/.codex/AGENTS.md using BEGIN/END markers
//
// Returns the path written and any error.
func Install(force bool, target string) (string, error) {
	switch target {
	case "codex":
		return installCodex(force)
	default:
		return installClaude(force)
	}
}

// installClaude writes the skill file to ~/.claude/skills/margin-cli/SKILL.md.
func installClaude(force bool) (string, error) {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".claude", "skills", "margin-cli")
	path := filepath.Join(dir, "SKILL.md")

	if !force {
		if _, err := os.Stat(path); err == nil {
			return "", fmt.Errorf("skill file already exists at %s (use --force to overwrite)", path)
		}
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	if err := os.WriteFile(path, []byte(skillTemplate), 0644); err != nil {
		return "", err
	}
	return path, nil
}

// installCodex merges the CLI reference into ~/.codex/AGENTS.md using BEGIN/END markers.
// If AGENTS.md already contains a managed section, only that section is replaced.
// User content outside the markers is preserved. If AGENTS.md does not exist, it is created.
// Does nothing (returns the target path) if ~/.codex does not exist — Codex is not installed.
func installCodex(force bool) (string, error) {
	home, _ := os.UserHomeDir()
	codexDir := filepath.Join(home, ".codex")
	agentsPath := filepath.Join(codexDir, "AGENTS.md")

	if _, err := os.Stat(codexDir); os.IsNotExist(err) {
		return agentsPath, fmt.Errorf("~/.codex directory does not exist — install OpenAI Codex CLI first")
	}

	managed := codexBeginMarker + "\n<!-- AUTO-GENERATED by `margin skill-install --target codex`. Do not edit this section manually. -->\n\n" + cliReference + "\n" + codexEndMarker + "\n"

	existing, readErr := os.ReadFile(agentsPath)
	var content string
	if readErr == nil {
		// File exists — check for managed section
		existingStr := string(existing)
		beginIdx := strings.Index(existingStr, codexBeginMarker)
		endIdx := strings.Index(existingStr, codexEndMarker)

		if beginIdx != -1 && endIdx != -1 && endIdx > beginIdx {
			if !force {
				return agentsPath, fmt.Errorf("margin CLI reference already exists in %s (use --force to overwrite)", agentsPath)
			}
			// Replace managed section
			endOfSection := endIdx + len(codexEndMarker)
			if endOfSection < len(existingStr) && existingStr[endOfSection] == '\n' {
				endOfSection++
			}
			before := strings.TrimRight(existingStr[:beginIdx], "\n")
			after := strings.TrimLeft(existingStr[endOfSection:], "\n")
			if before != "" {
				content = before + "\n\n" + managed
			} else {
				content = managed
			}
			if strings.TrimSpace(after) != "" {
				content += "\n" + after
			}
		} else {
			// Append to existing file
			trimmed := strings.TrimRight(existingStr, "\n")
			if trimmed != "" {
				content = trimmed + "\n\n" + managed
			} else {
				content = managed
			}
		}
	} else {
		// New file
		if err := os.MkdirAll(codexDir, 0755); err != nil {
			return "", fmt.Errorf("failed to create ~/.codex: %w", err)
		}
		content = managed
	}

	if err := os.WriteFile(agentsPath, []byte(content), 0644); err != nil {
		return "", err
	}
	return agentsPath, nil
}

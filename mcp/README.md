# Margin MCP Server

Model Context Protocol server for [Margin](../) — exposes reading, annotation, correction, and writing rule tools over stdio transport.

## Usage

```bash
cd mcp
pnpm install
pnpm build
```

Connect via any MCP-compatible client using stdio transport. The server reads from and writes to `~/.margin/margin.db`.

## Multi-LLM Support

The MCP server works with **any MCP-compatible client** — Claude Code, OpenAI Codex, or any agent framework that supports the Model Context Protocol.

### Enforcement architecture

Margin's writing quality enforcement differs by client:

| Client | Enforcement type | Artifact |
|--------|-----------------|---------|
| Claude Code | **Mechanical** — pre-tool hook blocks violations before writes | `~/.claude/hooks/writing_guard.py` |
| OpenAI Codex | **Prompt-level** — rules loaded as AGENTS.md context | `~/.codex/AGENTS.md` |
| Any MCP client | **Prompt-level** — rules available via `margin_get_writing_rules_markdown` | `~/.margin/writing-rules.md` |

The guard hook (`writing_guard.py`) is Claude Code-specific — it intercepts Write/Edit tool calls using Claude's hook protocol. There is no equivalent hook system in Codex or GPT. For those clients, writing rules are injected as prompt context and enforced by the model.

`~/.margin/writing-rules.md` is the universal artifact — a plain markdown file any agent can read or you can paste into any context.

### Generating agent-specific artifacts

```bash
# Claude Code (default): writes writing-rules.md + writing_guard.py
margin export profile

# Codex: writes writing-rules.md + AGENTS.md (no hook)
margin export profile --target codex

# Codex only (rules section of AGENTS.md)
margin export codex

# Install CLI reference into agent's instruction file
margin skill-install               # → ~/.claude/skills/margin-cli/SKILL.md
margin skill-install --target codex  # → ~/.codex/AGENTS.md
```

## Tools

The server exposes 31 tools across these categories:

- **Documents** — list, get, read, search (FTS5)
- **Annotations** — highlights and margin notes CRUD
- **Corrections** — writing corrections with auto-rule synthesis
- **Writing Rules** — rule CRUD, markdown export, voice signals
- **Thesis** — annotation cluster distillation and thesis persistence
- **Export** — `margin_wait_for_export` for receiving annotation exports from the app

## Resources

- `margin://documents` — recent documents
- `margin://documents/{id}/annotations` — annotations by document
- `margin://writing-rules` — markdown-formatted rules
- `margin://corrections/summary` — correction statistics
- `margin://latest-export` — most recent annotation export

## Token efficiency

The `margin` CLI provides identical functionality with ~76% lower token overhead than MCP tools. Use `margin skill-install` to install the CLI reference into your agent's context.

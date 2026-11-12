# just-bash — Virtual Bash for AI Agents

GitHub: [vercel-labs/just-bash](https://github.com/vercel-labs/just-bash)

## What it is

TypeScript virtual bash environment with in-memory filesystem. Sandboxed execution — no real disk/network access unless opted in. Built for AI agents.

## Why it matters for Margin

- **Runnable code blocks in documents** — browser-compatible bash runtime means annotations could include executable code snippets
- **OverlayFs** — read real project files, writes stay in memory. Safe "try it" environment for readers annotating codebases
- **Browser support** — core shell (parsing, execution, filesystem, built-in commands) works in browser environments. No Node.js required for the basics

## Key features

- In-memory, overlay (COW), read-write, and mountable filesystem options
- 60+ unix commands: grep, sed, awk, jq, sqlite3, etc.
- Optional Python, JS/TS, SQLite runtimes (WASM-based)
- Network access with URL prefix allowlists + header transforms
- Execution limits (loop iterations, recursion depth, command count)
- AST transform plugins for script instrumentation
- AI SDK tool integration via [bash-tool](https://github.com/vercel-labs/bash-tool)
- `Sandbox` API compatible with `@vercel/sandbox`

## Quick start

```bash
pnpm add just-bash
```

```typescript
import { Bash } from "just-bash";

const bash = new Bash();
await bash.exec('echo "Hello" > greeting.txt');
const result = await bash.exec("cat greeting.txt");
// result.stdout === "Hello\n"
```

## Relevant patterns

```typescript
// OverlayFs: read from disk, writes stay in memory
import { OverlayFs } from "just-bash/fs/overlay-fs";
const overlay = new OverlayFs({ root: "/path/to/project" });
const bash = new Bash({ fs: overlay, cwd: overlay.getMountPoint() });

// MountableFs: multi-mount architecture
import { MountableFs, InMemoryFs } from "just-bash";
const fs = new MountableFs({ base: new InMemoryFs() });
fs.mount("/mnt/docs", new OverlayFs({ root: "/path/to/docs", readOnly: true }));
```

# Security Review — Margin Desktop App

**Date:** 2026-03-16
**Reviewer:** Claude Code (automated + manual analysis)
**Scope:** Tauri v2 + React 19 + SQLite desktop app — IPC command exposure, filesystem access scope, CSP configuration, input validation, auth surfaces, dependency hygiene
**Build:** `b6e186a` on `main`

---

## Summary

Margin is a local-only, single-user desktop app — no server, no multi-user surface, no network authentication. The attack surface is narrow. The most significant finding is the **absent CSP**, which turns any future XSS (including from user-opened markdown files) into a full IPC exploit path. The filesystem scope is broader than necessary and compounds that risk. Everything else is low-to-informational.

| Finding | Severity | Area |
|---------|----------|------|
| CSP is null — webview has no Content Security Policy | High | CSP / IPC |
| Filesystem scope allows `$HOME/**` | Medium | FS scope |
| `read_file` / `save_file` accept arbitrary paths with no server-side validation | Medium | IPC / FS |
| `search_files_on_disk` partially sanitizes mdfind query — metacharacters leak through | Low | Input validation |
| `seed_rules` spawns `claude` binary from PATH with no integrity check | Low | IPC / shell |
| MCP bridge writes Claude Desktop config without path format validation | Low | Config hygiene |
| Updater pubkey in config, `npx tsx` in test run — no issues | Info | Informational |
| SQL queries use parameterized rusqlite — no injection vectors | Info | Informational |
| `sanitizeSnippet` allowlist approach is correct | Info | Informational |

---

## Finding 1 — CSP is null (High)

**File:** `src-tauri/tauri.conf.json:25`

```json
"security": {
  "csp": null
}
```

The webview runs with no Content Security Policy. Any XSS that reaches the webview — including via user-opened markdown content rendered by TipTap — can call `window.__TAURI__.invoke()` directly and execute any registered Tauri command: read or write arbitrary files within the broad FS scope (Finding 2), spawn the `claude` CLI (Finding 5), or exfiltrate clipboard contents.

Margin renders user-owned markdown files. TipTap sanitizes on input, but the document pipeline (file watcher reload, keep-local content fetch, paste) has multiple paths where HTML could reach the editor. The absence of a CSP means there is no second line of defense.

**Recommendation:** Set a strict CSP. The webview only needs to load local resources:

```json
"security": {
  "csp": "default-src 'self' tauri: asset: https://asset.localhost; script-src 'self'; connect-src 'self' http://127.0.0.1:8787 http://127.0.0.1:24784; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: asset: https://asset.localhost"
}
```

`unsafe-inline` for styles is acceptable here (TipTap uses inline styles for highlights). Inline scripts should not be needed.

---

## Finding 2 — Filesystem scope allows `$HOME/**` (Medium)

**File:** `src-tauri/capabilities/default.json:14-19`

```json
{
  "identifier": "fs:scope",
  "allow": [
    { "path": "$HOME/**" },
    { "path": "$DOCUMENT/**" },
    { "path": "$DESKTOP/**" },
    { "path": "$DOWNLOAD/**" }
  ]
}
```

`$HOME/**` subsumes the others and grants the app (and any webview code, if CSP is absent) read/write access to `~/.ssh/`, `~/.aws/`, `~/.gnupg/`, `~/Library/Keychains/`, `~/.margin/margin.db`, and any other sensitive file in the home tree.

In normal operation, file paths originate from the OS file picker dialog or from paths stored in SQLite — not from attacker-supplied input. The risk is conditional on Finding 1: a CSP bypass enables arbitrary `read_file` / `save_file` calls within this scope.

**Recommendation:** Constrain the scope to directories Margin actually uses:

```json
{ "path": "$DOCUMENT/**" },
{ "path": "$DESKTOP/**" },
{ "path": "$DOWNLOAD/**" },
{ "path": "$HOME/.margin/**" },
{ "path": "$HOME/Library/Application Support/Claude/claude_desktop_config.json" }
```

Remove `$HOME/**` entirely.

---

## Finding 3 — `read_file` / `save_file` accept arbitrary paths with no server-side validation (Medium)

**File:** `src-tauri/src/commands/files.rs:37-43`

```rust
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

pub async fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write file '{}': {}", path, e))
}
```

Both commands accept any path string and immediately call `std::fs` — there is no canonicalization, no prefix check, and no validation against the capabilities scope. Access control is delegated entirely to the Tauri plugin FS scope (`Finding 2`). Similarly, `list_markdown_files` accepts any directory string and traverses it recursively with no scope check.

In practice, path values come from the OS file dialog (`open_file_dialog`) or from `file_path` columns in SQLite (populated by prior dialog calls). There is no untrusted path source in the current frontend. However:
1. Any future IPC route, MCP tool, or deep-link that accepts a path string would inherit this gap.
2. If the CSP is absent (Finding 1), any XSS can supply an arbitrary path.

**Recommendation:** Add a path validation helper that canonicalizes and checks a prefix allowlist:

```rust
fn validate_path_in_scope(raw: &str) -> Result<std::path::PathBuf, String> {
    let canon = std::fs::canonicalize(raw)
        .map_err(|e| format!("Invalid path '{}': {}", raw, e))?;
    let home = dirs::home_dir().ok_or("Cannot determine home dir")?;
    let allowed_prefixes = [
        home.join("Documents"),
        home.join("Desktop"),
        home.join("Downloads"),
        home.join(".margin"),
    ];
    if allowed_prefixes.iter().any(|p| canon.starts_with(p)) {
        Ok(canon)
    } else {
        Err(format!("Path '{}' is outside allowed scope", raw))
    }
}
```

Apply before every `fs::read_to_string` / `fs::write` call in the command handlers.

---

## Finding 4 — `search_files_on_disk` partially sanitizes mdfind query (Low)

**File:** `src-tauri/src/commands/search.rs:40-52`

```rust
// Strip single quotes to prevent mdfind query injection
let safe_query = query.replace('\'', "");

let mdfind_query = format!(
    "(kMDItemFSName == '*.md' || kMDItemFSName == '*.markdown') && \
     (kMDItemDisplayName == '*{}*'cdw || kMDItemTextContent == '*{}*'cdw)",
    safe_query, safe_query
);

let output = Command::new("mdfind").arg(&mdfind_query).output()...
```

Only single quotes are stripped. A query containing `&&`, `||`, `!=`, `==`, or `*` can manipulate the Spotlight predicate structure. `mdfind` is not a shell — this is query injection into Spotlight's NSPredicate format, not OS command injection. Practical exploit potential is low (the attacker can only influence which files appear in search results), but the sanitization is incomplete and the comment overstates its protection.

**Recommendation:** Use a simple escape approach — strip or escape all Spotlight metacharacters (`'`, `"`, `*`, `(`, `)`, `&&`, `||`, `!=`, `==`):

```rust
let safe_query = query
    .replace('\'', "")
    .replace('"', "")
    .replace('*', "")
    .replace('(', "")
    .replace(')', "");
```

Or use mdfind's `-name` filter form which avoids building a predicate string entirely.

---

## Finding 5 — `seed_rules` spawns `claude` binary from PATH without integrity check (Low)

**File:** `src-tauri/src/commands/seed_rules.rs:179-185`

```rust
let mut child = Command::new("claude")
    .args(["--print", "--model", "sonnet"])
    .env_remove("CLAUDECODE")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| format!("Failed to start claude CLI: {}", e))?;
```

The command resolves `claude` from the user's `PATH` with no full-path requirement or binary hash check. If the user's shell environment is modified (by a malicious install script, a compromised `.zshrc` modification, or a `PATH`-hijacking package), a fake `claude` binary could receive the style-guide file content as stdin. The spawned process also inherits the desktop app's process environment.

This risk is limited in practice: the user must already be compromised at the shell level for this to matter, and the app is local-only. It is worth noting because the prompt includes the full text content of a user-selected file.

**Recommendation:** Resolve the CLI path explicitly at startup (similar to how `script_dir` is resolved in `dashboard.rs`) and validate that it points to the expected binary location. At minimum, document that `PATH` integrity is a prerequisite for this feature.

---

## Finding 6 — MCP bridge writes Claude Desktop config without path format validation (Low)

**File:** `src/lib/mcp-bridge.ts`

The `mcp-bridge.ts` module reads and writes `~/Library/Application Support/Claude/claude_desktop_config.json`. The MCP server path written into that config is derived from `import.meta.env.VITE_MCP_SERVER_PATH` (dev) or `resourceDir()` (production). In dev, an injected env var could point the MCP server entry at an arbitrary path.

For production builds, `resourceDir()` is app-controlled and safe. For dev builds with `VITE_MCP_SERVER_PATH`, the value is developer-supplied and not validated for format or extension.

**Recommendation:** Validate that the resolved MCP server path ends in `.js` and exists before writing it into the Claude Desktop config. Add a guard:

```ts
if (!serverPath.endsWith('.js') || !(await exists(serverPath))) {
  throw new Error(`Invalid MCP server path: ${serverPath}`);
}
```

---

## Informational / No Issue

**Updater pubkey in config:** The minisign public key in `tauri.conf.json` is the expected mechanism for Tauri's auto-updater signature verification. This is correct and intentional.

**`npx tsx` in test run:** `dashboard.rs` spawns `npx tsx adversarial-test.ts` with a hardcoded path derived from `CARGO_MANIFEST_DIR` (compile-time) or the app binary location. No user input reaches the script path or arguments. No injection risk.

**SQL queries:** All rusqlite calls use parameterized `rusqlite::params![]` bindings. No string interpolation into SQL. FTS5 queries are sanitized by `sanitize_fts_query()` before binding. No SQL injection vectors.

**`sanitizeSnippet` in Sidebar:** The allowlist approach (placeholder swap → HTML-escape → restore `<mark>`) is correct and minimal. No DOMPurify dependency is needed for a two-tag allowlist.

**keep-local HTTP client:** Connects only to `http://127.0.0.1:8787`. All query parameters are percent-encoded by the custom `urlencoding()` function (well-tested). No external HTTP calls.

**`osascript` calls:** Both usages (`open_file_dialog`, `open_style_guide_dialog`) pass a hardcoded string literal — no user input is interpolated into the AppleScript. No injection risk.

**`rename_file` path validation:** Correctly blocks `/` and `\` in new filenames, checks target existence before rename, and rolls back the filesystem operation on DB failure.

---

## Priority Order

1. **Set CSP** (Finding 1) — one config change, eliminates the XSS-to-IPC exploit chain entirely.
2. **Tighten FS scope** (Finding 2) — remove `$HOME/**` from capabilities, replace with specific directories.
3. **Add server-side path validation** in `read_file`, `save_file`, `list_markdown_files` (Finding 3) — defense-in-depth against the scope being too broad.
4. **Fix mdfind sanitization** (Finding 4) — strip additional metacharacters.
5. **MCP server path validation** (Finding 6) — small guard in `mcp-bridge.ts`.
6. **Document `claude` CLI PATH dependency** (Finding 5) — low risk, documentation change sufficient.

---

## Case Study Notes

This review demonstrates security-conscious product thinking in a Tauri desktop context:

- **Threat modeling is context-aware.** A local single-user app has a fundamentally different attack surface than a web app. The risks here are conditional (XSS → IPC escalation) rather than direct network exposure.
- **Layered defense.** The highest-value fix (CSP) is one line. Without it, the broad FS scope and missing path validation become a connected chain. With it, Findings 2 and 3 become belt-and-suspenders improvements.
- **Tauri v2 capability model.** The permission system is the right place for FS scope — but it requires the developer to be conservative rather than permissive. `$HOME/**` is the Tauri equivalent of wildcard CORS.
- **What's done well:** Parameterized SQL everywhere, proper HTML sanitization in search results, URL encoding in the keep-local client, path separator rejection in rename, rollback-on-DB-failure in the file rename operation.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const capabilities = JSON.parse(
  readFileSync(join(__dirname, "../../../src-tauri/capabilities/default.json"), "utf8"),
) as { permissions: (string | { identifier: string; allow?: { path: string }[] })[] };
const granted = capabilities.permissions.map((p) => (typeof p === "string" ? p : p.identifier));

describe("Tauri capabilities", () => {
  it("allow the file calls the Claude Desktop integration makes", () => {
    // mcp-bridge.ts reads, creates and writes claude_desktop_config.json.
    // Regression: without these the switch always failed with
    // "Could not update the Claude MCP integration".
    for (const permission of ["fs:allow-read-text-file", "fs:allow-write-text-file", "fs:allow-mkdir", "fs:allow-exists"]) {
      expect(granted).toContain(permission);
    }
  });

  // read_file/save_file are scoped in Rust; the fs plugin must not reopen
  // $HOME to a script in the webview. Only the Claude Desktop config is
  // read or written through it, and stat (metadata only) covers documents.
  it("keep fs plugin reads and writes to the Claude Desktop config", () => {
    expect(granted).not.toContain("fs:allow-read");
    expect(granted).not.toContain("fs:allow-write");
    expect(granted).not.toContain("fs:scope");
    const claudeDir = "$HOME/Library/Application Support/Claude";
    for (const permission of ["fs:allow-read-text-file", "fs:allow-write-text-file", "fs:allow-mkdir", "fs:allow-exists"]) {
      const entry = capabilities.permissions.find(
        (p) => typeof p !== "string" && p.identifier === permission,
      ) as { allow?: { path: string }[] } | undefined;
      const paths = entry?.allow?.map((a) => a.path) ?? [];
      expect(paths.length, permission).toBeGreaterThan(0);
      for (const path of paths) expect(path.startsWith(claudeDir), `${permission}: ${path}`).toBe(true);
    }
  });
});

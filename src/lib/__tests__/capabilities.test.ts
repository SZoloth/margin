import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const capabilities = JSON.parse(
  readFileSync(join(__dirname, "../../../src-tauri/capabilities/default.json"), "utf8"),
) as { permissions: (string | { identifier: string })[] };
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
});

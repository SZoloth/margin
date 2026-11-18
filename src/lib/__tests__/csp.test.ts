import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const conf = JSON.parse(
  readFileSync(join(__dirname, "../../../src-tauri/tauri.conf.json"), "utf8"),
) as { app: { security: Record<string, unknown> } };
const security = conf.app.security;

function directives(csp: unknown): Map<string, string[]> {
  expect(typeof csp).toBe("string");
  return new Map(
    (csp as string)
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...sources]): [string, string[]] => [name ?? "", sources]),
  );
}

describe("Tauri content security policy", () => {
  // The webview can call native commands, so an injected script is code
  // execution. The CSP is the barrier between a renderer bug and that.
  it("blocks scripts from anywhere but the app bundle", () => {
    const csp = directives(security.csp);
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("script-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("frame-src")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'none'"]);
  });

  it("only talks to the Tauri IPC, not to local HTTP servers", () => {
    const connect = directives(security.csp).get("connect-src") ?? [];
    expect(connect).toContain("ipc:");
    expect(connect).toContain("http://ipc.localhost");
    expect(connect.some((s) => s.includes("127.0.0.1") || s === "*" || s === "http:")).toBe(false);
  });

  it("still loads document images and inline editor styles", () => {
    const csp = directives(security.csp);
    expect(csp.get("img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]));
    // ProseMirror decorations set style attributes (rule-scan.ts). Tauri would
    // add nonces to style-src, which makes browsers ignore 'unsafe-inline'.
    expect(csp.get("style-src")).toContain("'unsafe-inline'");
    expect(security.dangerousDisableAssetCspModification).toEqual(["style-src"]);
  });

  it("dev keeps Vite's HMR socket and React refresh preamble working", () => {
    const dev = directives(security.devCsp);
    expect(dev.get("connect-src")).toEqual(expect.arrayContaining(["ws://localhost:1420"]));
    expect(dev.get("script-src")).toContain("'unsafe-inline'");
  });
});

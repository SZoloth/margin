/**
 * Type stacks are named once, in the --font-* tokens in globals.css. A family
 * named anywhere else drifts: "Inter" was referenced in four places but never
 * bundled, so those surfaces fell back to the system face.
 *
 * @vitest-environment node
 */
/// <reference types="node" />
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../..");
const TOKENS_FILE = path.join(SRC_ROOT, "styles", "globals.css");
const FONTS_FILE = path.join(SRC_ROOT, "styles", "fonts.css");

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__" && e.name !== "node_modules") out.push(...collect(full));
    } else if (/\.(tsx?|css)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const FAMILY_NAMES = /Newsreader|Instrument Sans|\bInter\b|JetBrains|SF Mono|Georgia/;

describe("font tokens", () => {
  it("defines serif, sans and mono stacks in globals.css", () => {
    const css = fs.readFileSync(TOKENS_FILE, "utf8");
    expect(css).toMatch(/--font-serif:\s*'Newsreader Variable'/);
    expect(css).toMatch(/--font-sans:\s*'Instrument Sans'/);
    expect(css).toMatch(/--font-mono:/);
  });

  it("loads the variable Newsreader so optical sizing works", () => {
    const css = fs.readFileSync(FONTS_FILE, "utf8");
    expect(css).toContain("@fontsource-variable/newsreader/opsz.css");
    expect(css).not.toContain("@fontsource/newsreader/");
  });

  it("names no font family outside the token definitions", () => {
    const offenders: string[] = [];
    for (const file of collect(SRC_ROOT)) {
      if (file === TOKENS_FILE || file === FONTS_FILE) continue;
      fs.readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/font/i.test(line) && FAMILY_NAMES.test(line)) {
            offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it("the reader honours the serif/sans setting", () => {
    const css = fs.readFileSync(path.join(SRC_ROOT, "styles", "typography.css"), "utf8");
    expect(css).toMatch(/\.reader-content\s*\{[^}]*font-family:\s*var\(--reader-font-family/);
  });
});

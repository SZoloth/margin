/// <reference types="node" />
/**
 * Structural dependency tests: enforce layer boundaries so agents can't introduce
 * architectural violations that compile but corrode the codebase.
 *
 * Layer order (lowest to highest):
 *   types  →  lib  →  hooks  →  components
 *
 * Each layer may import from layers below it and from external packages,
 * but never from layers above it.
 *
 * Uses Node.js fs to read source files directly — avoids Vite's module graph
 * which would eagerly process hundreds of files and blow past the worker START_TIMEOUT.
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

/** Recursively collect all .ts/.tsx files under a directory, excluding __tests__. */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      results.push(...collectSourceFiles(path.join(dir, entry.name)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/** Read source files as { filePath: content } map. */
function readSources(layerDir: string): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const file of collectSourceFiles(path.join(SRC_ROOT, layerDir))) {
    sources[file] = fs.readFileSync(file, "utf-8");
  }
  return sources;
}

/** Extract all `@/...` import paths from a source string. */
function extractInternalImports(source: string): string[] {
  const matches = source.matchAll(/from\s+["'](@\/[^"']+)["']/g);
  return Array.from(matches, (m) => m[1] as string);
}

/** Collect violations: files in `sources` whose imports start with any forbidden prefix. */
function collectViolations(
  sources: Record<string, string>,
  forbiddenPrefixes: string[],
): { file: string; forbidden: string }[] {
  const violations: { file: string; forbidden: string }[] = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const imp of extractInternalImports(source)) {
      for (const prefix of forbiddenPrefixes) {
        if (imp.startsWith(prefix)) {
          violations.push({ file, forbidden: imp });
        }
      }
    }
  }
  return violations;
}

function formatViolations(violations: { file: string; forbidden: string }[]): string {
  return violations.map((v) => `  ${v.file} → ${v.forbidden}`).join("\n");
}

describe("Layer boundary enforcement", () => {
  it("types/ does not import from lib, hooks, or components", () => {
    const violations = collectViolations(readSources("types"), [
      "@/lib",
      "@/hooks",
      "@/components",
    ]);
    if (violations.length > 0) {
      throw new Error(
        `types/ must not import from lib, hooks, or components:\n${formatViolations(violations)}`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("lib/ does not import from hooks or components", () => {
    const violations = collectViolations(readSources("lib"), ["@/hooks", "@/components"]);
    if (violations.length > 0) {
      throw new Error(
        `lib/ must not import from hooks or components:\n${formatViolations(violations)}`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("hooks/ does not import from components", () => {
    const violations = collectViolations(readSources("hooks"), ["@/components"]);
    if (violations.length > 0) {
      throw new Error(
        `hooks/ must not import from components:\n${formatViolations(violations)}`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("all layer directories contain source files (sanity check)", () => {
    expect(
      Object.keys(readSources("types")).length,
      "types/ must contain at least one source file",
    ).toBeGreaterThan(0);
    expect(
      Object.keys(readSources("lib")).length,
      "lib/ must contain at least one source file",
    ).toBeGreaterThan(0);
    expect(
      Object.keys(readSources("hooks")).length,
      "hooks/ must contain at least one source file",
    ).toBeGreaterThan(0);
    expect(
      Object.keys(readSources("components")).length,
      "components/ must contain at least one source file",
    ).toBeGreaterThan(0);
  });
});

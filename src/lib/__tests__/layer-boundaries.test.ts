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
 * Uses import.meta.glob to collect source files as raw strings — no Node.js
 * fs module needed, works with the project's jsdom + Vite test environment.
 */
import { describe, it, expect } from "vitest";

// Collect raw source for all non-test .ts/.tsx files in each layer.
// Paths are relative to this file: ../../{layer}/**
const typesSources = import.meta.glob("../../types/**/*.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const libSources = import.meta.glob(
  ["../../lib/**/*.{ts,tsx}", "!../../lib/**/__tests__/**"],
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

const hooksSources = import.meta.glob(
  ["../../hooks/**/*.{ts,tsx}", "!../../hooks/**/__tests__/**"],
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

const componentsSources = import.meta.glob(
  ["../../components/**/*.{ts,tsx}", "!../../components/**/__tests__/**"],
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

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
    const violations = collectViolations(typesSources, ["@/lib", "@/hooks", "@/components"]);
    if (violations.length > 0) {
      throw new Error(
        `types/ must not import from lib, hooks, or components:\n${formatViolations(violations)}`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("lib/ does not import from hooks or components", () => {
    const violations = collectViolations(libSources, ["@/hooks", "@/components"]);
    if (violations.length > 0) {
      throw new Error(
        `lib/ must not import from hooks or components:\n${formatViolations(violations)}`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("hooks/ does not import from components", () => {
    const violations = collectViolations(hooksSources, ["@/components"]);
    if (violations.length > 0) {
      throw new Error(
        `hooks/ must not import from components:\n${formatViolations(violations)}`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("all layer directories contain source files (sanity check)", () => {
    expect(
      Object.keys(typesSources).length,
      "types/ must contain at least one source file",
    ).toBeGreaterThan(0);
    expect(
      Object.keys(libSources).length,
      "lib/ must contain at least one source file",
    ).toBeGreaterThan(0);
    expect(
      Object.keys(hooksSources).length,
      "hooks/ must contain at least one source file",
    ).toBeGreaterThan(0);
    expect(
      Object.keys(componentsSources).length,
      "components/ must contain at least one source file",
    ).toBeGreaterThan(0);
  });
});

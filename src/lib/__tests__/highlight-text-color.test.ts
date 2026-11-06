/**
 * A <mark> defaults to the browser's highlight text color (black). Margin's
 * highlights only set a background, so in dark mode the marked phrase went
 * black on a faint wash. Every highlight color must keep the reader's text color.
 *
 * @vitest-environment node
 */
/// <reference types="node" />
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_CSS = path.resolve(__dirname, "../../styles/editor.css");

describe("highlight marks", () => {
  it("inherit the text color for every highlight color", () => {
    const css = fs.readFileSync(EDITOR_CSS, "utf8");
    for (const color of ["yellow", "green", "blue", "pink", "orange"]) {
      const rule = css.match(
        new RegExp(`\\.tiptap mark\\.highlight--${color}\\s*\\{([^}]*)\\}`),
      );
      expect(rule, color).not.toBeNull();
      expect(rule![1], color).toMatch(/color:\s*inherit/);
    }
  });
});

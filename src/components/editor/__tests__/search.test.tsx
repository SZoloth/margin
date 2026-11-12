import { describe, it, expect, beforeAll } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Reader } from "../Reader";
import type { Editor } from "@tiptap/core";
import { findAllMatches } from "../extensions/search";
import type { SearchStorage } from "../extensions/search";

const SAMPLE_DOC = `# Finding Nemo

Nemo is a clownfish. His father Marlin searches for Nemo across the ocean.

## Characters

- Nemo
- Marlin
- Dory

Just keep swimming, just keep swimming.`;

describe("Search extension", () => {
  let editor: Editor;

  // Single shared editor for all tests in this file. Uses waitFor() (same pattern
  // as Reader.test.tsx) instead of Promise+onEditorReady — waitFor() drives React's
  // async scheduler correctly in vmForks where the Promise pattern hangs on cold-start.
  beforeAll(async () => {
    let editorRef: Editor | null = null;
    render(
      <Reader
        content={SAMPLE_DOC}
        onUpdate={() => {}}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );
    await waitFor(() => {
      expect(editorRef).not.toBeNull();
    });
    editor = editorRef!;
  });

  describe("findAllMatches", () => {
    it("finds all occurrences case-insensitively", () => {
      const results = findAllMatches(editor.state.doc, "nemo");
      // "Nemo" appears in heading, first paragraph (x2), and character list
      expect(results.length).toBe(4);
      for (const r of results) {
        expect(r.to - r.from).toBe(4);
      }
    });

    it("returns empty array for no matches", () => {
      expect(findAllMatches(editor.state.doc, "pixar")).toEqual([]);
    });

    it("returns empty array for empty search term", () => {
      expect(findAllMatches(editor.state.doc, "")).toEqual([]);
    });

    it("finds multi-word phrases", () => {
      const results = findAllMatches(editor.state.doc, "just keep swimming");
      expect(results.length).toBe(2);
    });

    it("positions resolve to correct text", () => {
      const results = findAllMatches(editor.state.doc, "Marlin");
      expect(results.length).toBeGreaterThanOrEqual(1);

      const first = results[0]!;
      const slice = editor.state.doc.textBetween(first.from, first.to);
      expect(slice.toLowerCase()).toBe("marlin");
    });
  });

  describe("editor commands", () => {
    it("setSearchTerm populates storage results", () => {
      editor.commands.clearSearch();
      editor.commands.setSearchTerm("Nemo");
      const storage = editor.storage.search as SearchStorage;
      expect(storage.results.length).toBe(4);
      expect(storage.activeIndex).toBe(0);
      expect(storage.searchTerm).toBe("Nemo");
    });

    it("nextMatch cycles through results", () => {
      editor.commands.clearSearch();
      editor.commands.setSearchTerm("Nemo");
      const storage = editor.storage.search as SearchStorage;

      editor.commands.nextMatch();
      expect(storage.activeIndex).toBe(1);

      editor.commands.nextMatch();
      expect(storage.activeIndex).toBe(2);

      editor.commands.nextMatch();
      expect(storage.activeIndex).toBe(3);

      // Wraps around
      editor.commands.nextMatch();
      expect(storage.activeIndex).toBe(0);
    });

    it("prevMatch cycles backwards", () => {
      editor.commands.clearSearch();
      editor.commands.setSearchTerm("Nemo");
      const storage = editor.storage.search as SearchStorage;
      expect(storage.activeIndex).toBe(0);

      // Wraps to last
      editor.commands.prevMatch();
      expect(storage.activeIndex).toBe(3);

      editor.commands.prevMatch();
      expect(storage.activeIndex).toBe(2);
    });

    it("clearSearch resets storage", () => {
      editor.commands.setSearchTerm("Nemo");
      editor.commands.clearSearch();

      const storage = editor.storage.search as SearchStorage;
      expect(storage.results).toEqual([]);
      expect(storage.activeIndex).toBe(-1);
      expect(storage.searchTerm).toBe("");
    });

    it("nextMatch returns false when no results", () => {
      editor.commands.clearSearch();
      const result = editor.commands.nextMatch();
      expect(result).toBe(false);
    });
  });
});

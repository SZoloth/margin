import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Reader } from "../Reader";
import type { Editor } from "@tiptap/core";

const FM_DOC = `---
title: Test
author: Jane
tags: [a, b]
---

# Hello

Some body text.`;

const FULL_DOC = `---
title: The Marginal Annotator
author: Sam Zoloth
date: 2026-03-02
tags: [reading, annotations, design]
draft: true
---

# The Marginal Annotator

Reading is an act of dialogue.

## Why margins matter

The tradition of marginalia stretches back centuries.

> "Some books are to be tasted, others to be swallowed, and some few to be chewed and digested." — Francis Bacon

When we highlight a passage, we're marking a moment of friction.

## A short reading list

- *How to Read a Book* by Mortimer Adler
- *The Pleasures of Reading in an Age of Distraction* by Alan Jacobs
- *Proust and the Squid* by Maryanne Wolf

## Tasks

- [x] Build the reader
- [x] Add highlights
- [ ] Ship margin notes
- [ ] Export annotations

---

That final horizontal rule above should render as an hr.`;

const NO_FM_DOC = `# No front matter

Just a regular document.`;

describe("Front matter round-trip", () => {
  it("preserves front matter through getMarkdown()", async () => {
    let editorRef: Editor | null = null;

    render(
      <Reader
        content={FM_DOC}
        onUpdate={() => {}}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    const md = editorRef!.storage.markdown.getMarkdown() as string;
    console.log("=== initial getMarkdown ===");
    console.log(JSON.stringify(md.slice(0, 120)));

    // Should start with --- (no leading blank line)
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("title: Test");
    expect(md).toContain("author: Jane");
    expect(md).toContain("\n---\n");
    expect(md).toContain("# Hello");
  });

  it("preserves front matter after setContent (file open simulation)", async () => {
    let editorRef: Editor | null = null;
    const updates: string[] = [];

    const { rerender } = render(
      <Reader
        content="initial"
        onUpdate={(md) => updates.push(md)}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    // Simulate opening a file with front matter (triggers useEffect → setContent)
    rerender(
      <Reader
        content={FM_DOC}
        onUpdate={(md) => updates.push(md)}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    // Wait for editor to process the content change
    await waitFor(() => {
      const md = editorRef!.storage.markdown.getMarkdown() as string;
      expect(md).toContain("title: Test");
    });

    const md = editorRef!.storage.markdown.getMarkdown() as string;
    const json = editorRef!.getJSON();
    console.log("=== doc JSON (first 3 nodes) ===");
    console.log(JSON.stringify(json.content?.slice(0, 3), null, 2));
    console.log("=== after setContent getMarkdown ===");
    console.log(JSON.stringify(md.slice(0, 120)));

    // Should start with --- (no leading blank line)
    expect(md).toMatch(/^---\n/);
  });

  it("round-trips after simulated user edit", async () => {
    let editorRef: Editor | null = null;
    let lastMd = "";

    render(
      <Reader
        content={FM_DOC}
        onUpdate={(md) => { lastMd = md; }}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    const editor = editorRef!;

    // Simulate a user edit in the body — append text to the end
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, "Added text.");

    // Wait for onUpdate to fire
    await waitFor(() => {
      expect(lastMd).toContain("Added text.");
    });

    console.log("=== after edit getMarkdown (first 80 chars) ===");
    console.log(JSON.stringify(lastMd.slice(0, 80)));

    const json = editor.getJSON();
    console.log("=== doc JSON (first 3 nodes) ===");
    console.log(JSON.stringify(json.content?.slice(0, 3), null, 2));

    // The onUpdate output (what would be saved) should start with ---
    expect(lastMd).toMatch(/^---\n/);
    expect(lastMd).toContain("title: Test");
  });

  it("preserves front matter with full document including HR and task lists", async () => {
    let editorRef: Editor | null = null;

    render(
      <Reader
        content={FULL_DOC}
        onUpdate={() => {}}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    const md = editorRef!.storage.markdown.getMarkdown() as string;
    const json = editorRef!.getJSON();
    console.log("=== FULL DOC: first 5 node types ===");
    console.log(json.content?.slice(0, 5).map(n => n.type));
    console.log("=== FULL DOC: getMarkdown first 120 chars ===");
    console.log(JSON.stringify(md.slice(0, 120)));

    expect(md).toMatch(/^---\n/);
    expect(md).toContain("title: The Marginal Annotator");
    // The trailing --- should be an HR, not front matter
    expect(md).toContain("# The Marginal Annotator");
  });

  it("does not produce front matter for documents without it", async () => {
    let editorRef: Editor | null = null;

    render(
      <Reader
        content={NO_FM_DOC}
        onUpdate={() => {}}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    const md = editorRef!.storage.markdown.getMarkdown() as string;
    expect(md).toMatch(/^# No front matter/);
  });
});

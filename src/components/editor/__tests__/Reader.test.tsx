// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { Reader } from "../Reader";
import type { Editor } from "@tiptap/core";

describe("Reader — predictive text attributes", () => {
  it("renders a contenteditable element with autocorrect, autocapitalize, and spellcheck disabled", async () => {
    const { container } = render(
      <Reader content="" onUpdate={() => {}} isLoading={false} />,
    );

    // TipTap renders asynchronously — wait for the contenteditable div
    await waitFor(() => {
      const editable = container.querySelector("[contenteditable]");
      expect(editable).toBeTruthy();
    });

    const editable = container.querySelector("[contenteditable]")!;
    expect(editable.getAttribute("autocorrect")).toBe("off");
    expect(editable.getAttribute("autocapitalize")).toBe("off");
    expect(editable.getAttribute("spellcheck")).toBe("false");
  });
});

describe("Reader — cursor stability", () => {
  it("does not call setContent when content prop changes from editor typing", async () => {
    let editorRef: Editor | null = null;
    const onUpdate = vi.fn();

    const { rerender } = render(
      <Reader
        content="hello"
        onUpdate={onUpdate}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    // Wait for editor to initialize
    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    const editor = editorRef!;
    const setContentSpy = vi.spyOn(editor.commands, "setContent");

    // Simulate user typing — triggers onUpdate which calls the onUpdate prop
    await act(async () => {
      editor.commands.insertContent("world");
    });

    // onUpdate should have been called with new markdown
    expect(onUpdate).toHaveBeenCalled();
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
    const updatedContent = lastCall![0];

    // Re-render with the content that came back from the onUpdate prop
    // (simulates the React state round-trip: onUpdate → setContent → re-render)
    setContentSpy.mockClear();
    await act(async () => {
      rerender(
        <Reader
          content={updatedContent}
          onUpdate={onUpdate}
          isLoading={false}
          onEditorReady={(ed) => { editorRef = ed; }}
        />,
      );
    });

    // setContent should NOT have been called — we skip it during the React
    // state round-trip from the editor's own onUpdate.
    expect(setContentSpy).not.toHaveBeenCalled();

    setContentSpy.mockRestore();
  });

  it("applies external content changes (e.g. file open) to the editor", async () => {
    let editorRef: Editor | null = null;

    const { rerender } = render(
      <Reader
        content="original"
        onUpdate={() => {}}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    // Simulate an external content change (file open, tab switch, etc.)
    await act(async () => {
      rerender(
        <Reader
          content="completely different content"
          onUpdate={() => {}}
          isLoading={false}
          onEditorReady={(ed) => { editorRef = ed; }}
        />,
      );
    });

    // Editor should reflect the new external content
    const editor = editorRef!;
    await waitFor(() => {
      const editorMd = editor.storage.markdown.getMarkdown() as string;
      expect(editorMd).toContain("completely different content");
    });
  });

  it("applies external content changes even if a typing update happened first", async () => {
    let editorRef: Editor | null = null;
    const onUpdate = vi.fn();

    const { rerender } = render(
      <Reader
        content="hello"
        onUpdate={onUpdate}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    const editor = editorRef!;

    // Simulate user typing (sets internal "last emitted" ref)
    await act(async () => {
      editor.commands.insertContent(" world");
    });
    expect(onUpdate).toHaveBeenCalled();

    // Now simulate an external update arriving before the parent "typing" content
    // round-trip is applied. We still want the editor to take the external content.
    await act(async () => {
      rerender(
        <Reader
          content="EXTERNAL UPDATE"
          onUpdate={onUpdate}
          isLoading={false}
          onEditorReady={(ed) => { editorRef = ed; }}
        />,
      );
    });

    await waitFor(() => {
      const editorMd = editor.storage.markdown.getMarkdown() as string;
      expect(editorMd).toContain("EXTERNAL UPDATE");
    });
  });
});

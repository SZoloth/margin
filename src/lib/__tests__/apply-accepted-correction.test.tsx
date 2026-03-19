import { act, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { Reader } from "@/components/editor/Reader";
import { applyAcceptedCorrection } from "../apply-accepted-correction";

describe("applyAcceptedCorrection", () => {
  it("replaces the text inside the targeted highlight instead of the first duplicate match", async () => {
    let editorRef: Editor | null = null;

    render(
      <Reader
        content={`<p><mark data-color="yellow" data-highlight-id="h-1">duplicate phrase</mark> before <mark data-color="yellow" data-highlight-id="h-2">duplicate phrase</mark>.</p>`}
        onUpdate={() => {}}
        isLoading={false}
        onEditorReady={(editor) => {
          editorRef = editor;
        }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    await act(async () => {
      expect(
        applyAcceptedCorrection(
          editorRef!,
          "h-2",
          "duplicate phrase",
          "specific phrase",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      const html = editorRef!.getHTML();
      expect(html).toContain('data-highlight-id="h-1">duplicate phrase</mark>');
      expect(html).toContain('data-highlight-id="h-2">specific phrase</mark>');
    });
  });

  it("returns false and leaves the document unchanged when the highlight is missing", async () => {
    let editorRef: Editor | null = null;

    render(
      <Reader
        content={'<p><mark data-color="yellow" data-highlight-id="h-1">duplicate phrase</mark></p>'}
        onUpdate={() => {}}
        isLoading={false}
        onEditorReady={(editor) => {
          editorRef = editor;
        }}
      />,
    );

    await waitFor(() => {
      expect(editorRef).toBeTruthy();
    });

    const before = editorRef!.getHTML();

    await act(async () => {
      expect(
        applyAcceptedCorrection(
          editorRef!,
          "missing-highlight",
          "duplicate phrase",
          "specific phrase",
        ),
      ).toBe(false);
    });

    expect(editorRef!.getHTML()).toBe(before);
  });
});

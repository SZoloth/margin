import { describe, it, expect, beforeAll } from "vitest";
import { render, waitFor, renderHook, act } from "@testing-library/react";
import { Reader } from "@/components/editor/Reader";
import { useTableOfContents } from "@/hooks/useTableOfContents";
import type { Editor } from "@tiptap/core";

const DOC_WITH_HEADINGS = `# Title One

Intro paragraph.

## Section Two

Body text.`;

describe("useTableOfContents — external content set", () => {
  beforeAll(async () => {
    const { unmount } = render(<Reader content="" onUpdate={() => {}} isLoading={false} />);
    await waitFor(
      () => { if (!document.querySelector("[contenteditable]")) throw new Error("not ready"); },
      { timeout: 90_000 },
    );
    unmount();
  }, 90_000);

  it("extracts headings after setContent with emitUpdate=false (tab restore path)", async () => {
    let editorRef: Editor | null = null;

    render(
      <Reader
        content=""
        onUpdate={() => {}}
        isLoading={false}
        onEditorReady={(ed) => { editorRef = ed; }}
      />,
    );
    await waitFor(() => { expect(editorRef).toBeTruthy(); }, { timeout: 90_000 });

    const { result } = renderHook(() => useTableOfContents(editorRef, "doc-1"));

    // Let the hook's mount-time requestAnimationFrame extraction fire first,
    // against the still-empty editor — matching the real restore order, where
    // content arrives from the tab cache well after the first frame.
    await act(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });
    expect(result.current.headings.length).toBe(0);

    // Regression: restored tabs set content externally with emitUpdate=false,
    // which never fires "update" — the TOC stayed empty until the first edit.
    act(() => {
      editorRef!.commands.setContent(DOC_WITH_HEADINGS, false);
    });

    await waitFor(
      () => {
        expect(result.current.headings.length).toBe(2);
      },
      { timeout: 5_000 },
    );
    expect(result.current.headings[0]!.text).toBe("Title One");
    expect(result.current.headings[1]!.text).toBe("Section Two");
    expect(result.current.headings[1]!.level).toBe(2);
  }, 120_000);
});

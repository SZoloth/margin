import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHighlightShortcut } from "../useHighlightShortcut";

function press(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

describe("useHighlightShortcut", () => {
  it("fires on Cmd+Shift+H (macOS)", () => {
    const onChord = vi.fn();
    renderHook(() => useHighlightShortcut(onChord));

    press({ metaKey: true, shiftKey: true, code: "KeyH", key: "H" });
    expect(onChord).toHaveBeenCalledTimes(1);
  });

  it("fires on Ctrl+Shift+H (Windows/Linux)", () => {
    const onChord = vi.fn();
    renderHook(() => useHighlightShortcut(onChord));

    press({ ctrlKey: true, shiftKey: true, code: "KeyH", key: "H" });
    expect(onChord).toHaveBeenCalledTimes(1);
  });

  it("ignores H without shift, and other keys with the chord", () => {
    const onChord = vi.fn();
    renderHook(() => useHighlightShortcut(onChord));

    press({ metaKey: true, code: "KeyH", key: "h" }); // Cmd+H alone
    press({ metaKey: true, shiftKey: true, code: "KeyJ", key: "J" });
    press({ code: "KeyH", key: "h" }); // bare key
    expect(onChord).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    const onChord = vi.fn();
    const { unmount } = renderHook(() => useHighlightShortcut(onChord));
    unmount();

    press({ metaKey: true, shiftKey: true, code: "KeyH", key: "H" });
    expect(onChord).not.toHaveBeenCalled();
  });
});

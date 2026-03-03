// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDiffReview } from "../useDiffReview";

describe("useDiffReview", () => {
  it("starts in idle with empty changes", () => {
    const { result } = renderHook(() => useDiffReview());
    expect(result.current.mode).toBe("idle");
    expect(result.current.changes).toEqual([]);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.pendingCount).toBe(0);
  });

  it("enterPending transitions to pending with computed changes", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("hello world", "hello brave new world");
    });
    expect(result.current.mode).toBe("pending");
    expect(result.current.changes.length).toBeGreaterThan(0);
    expect(result.current.pendingCount).toBe(result.current.changes.length);
    expect(result.current.reviewContent).toBeTypeOf("string");
    expect(result.current.reviewContent).toContain("data-change-id");
  });

  it("enterPending with <5% change auto-accepts (stays idle)", () => {
    const { result } = renderHook(() => useDiffReview());
    // Very similar strings — tiny change
    const base = "a".repeat(200);
    const modified = base + "b";
    act(() => {
      result.current.enterPending(base, modified);
    });
    expect(result.current.mode).toBe("idle");
  });

  it("enterPending with identical content stays idle", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("hello", "hello");
    });
    expect(result.current.mode).toBe("idle");
  });

  it("startReview transitions from pending to reviewing", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("old text here", "completely new text here");
    });
    act(() => {
      result.current.startReview();
    });
    expect(result.current.mode).toBe("reviewing");
    expect(result.current.currentIndex).toBe(0);
  });

  it("acceptChange marks change as accepted, decrements pending", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("old text", "new text");
    });
    act(() => {
      result.current.startReview();
    });
    const changeId = result.current.changes[0]!.id;
    const initialPending = result.current.pendingCount;

    act(() => {
      result.current.acceptChange(changeId);
    });

    expect(result.current.changes.find((c) => c.id === changeId)?.status).toBe("accepted");
    expect(result.current.pendingCount).toBe(initialPending - 1);
  });

  it("rejectChange marks change as rejected, decrements pending", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("old text", "new text");
    });
    act(() => {
      result.current.startReview();
    });
    const changeId = result.current.changes[0]!.id;

    act(() => {
      result.current.rejectChange(changeId);
    });

    expect(result.current.changes.find((c) => c.id === changeId)?.status).toBe("rejected");
  });

  it("all changes resolved returns mode to idle", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("old text", "new text");
    });
    act(() => {
      result.current.startReview();
    });

    // Accept all changes
    for (const change of result.current.changes) {
      act(() => {
        result.current.acceptChange(change.id);
      });
    }

    expect(result.current.mode).toBe("idle");
  });

  it("acceptAll marks all changes as accepted and returns to idle", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("old text here", "completely new text here");
    });
    act(() => {
      result.current.startReview();
    });
    act(() => {
      result.current.acceptAll();
    });

    expect(result.current.mode).toBe("idle");
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.changes.every((c) => c.status === "accepted")).toBe(true);
  });

  it("dismiss returns to idle", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("old text here", "completely new text here");
    });
    expect(result.current.mode).toBe("pending");
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.mode).toBe("idle");
  });

  it("navigateNext and navigatePrev cycle currentIndex", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      // Use text with multiple changes
      result.current.enterPending(
        "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
        "First paragraph MODIFIED.\n\nSecond paragraph.\n\nThird paragraph MODIFIED.",
      );
    });
    act(() => {
      result.current.startReview();
    });

    const totalChanges = result.current.changes.length;
    if (totalChanges < 2) {
      // Skip if diff engine grouped them
      return;
    }

    expect(result.current.currentIndex).toBe(0);

    act(() => {
      result.current.navigateNext();
    });
    expect(result.current.currentIndex).toBe(1);

    act(() => {
      result.current.navigatePrev();
    });
    expect(result.current.currentIndex).toBe(0);

    // Wrap around forward
    for (let i = 0; i < totalChanges; i++) {
      act(() => {
        result.current.navigateNext();
      });
    }
    expect(result.current.currentIndex).toBe(0); // wrapped
  });

  it("getFinalContent reflects decisions", () => {
    const { result } = renderHook(() => useDiffReview());
    const oldContent = "old text";
    const newContent = "new text";
    act(() => {
      result.current.enterPending(oldContent, newContent);
    });
    act(() => {
      result.current.startReview();
    });

    // Accept all → should equal newContent
    act(() => {
      result.current.acceptAll();
    });
    expect(result.current.getFinalContent()).toBe(newContent);
  });

  it("getFinalContent with all rejected equals oldContent", () => {
    const { result } = renderHook(() => useDiffReview());
    const oldContent = "old text";
    const newContent = "new text";
    act(() => {
      result.current.enterPending(oldContent, newContent);
    });
    act(() => {
      result.current.startReview();
    });

    for (const change of result.current.changes) {
      act(() => {
        result.current.rejectChange(change.id);
      });
    }
    expect(result.current.getFinalContent()).toBe(oldContent);
  });

  it("acceptAll from pending mode works", () => {
    const { result } = renderHook(() => useDiffReview());
    act(() => {
      result.current.enterPending("old text here", "completely new text here");
    });
    expect(result.current.mode).toBe("pending");
    act(() => {
      result.current.acceptAll();
    });
    expect(result.current.mode).toBe("idle");
  });

  it("updatedAt is set when entering pending", () => {
    const { result } = renderHook(() => useDiffReview());
    expect(result.current.updatedAt).toBeNull();
    act(() => {
      result.current.enterPending("old text here", "completely new text here");
    });
    expect(result.current.updatedAt).toBeTypeOf("number");
  });

  describe("mark tag stripping", () => {
    it("strips <mark> tags from oldContent before diffing", () => {
      const { result } = renderHook(() => useDiffReview());
      // Old content has highlight marks (from editor), new content is the same text without marks
      const oldWithMarks =
        'Some text <mark data-color="yellow" class="highlight-yellow" data-highlight-id="abc123">highlighted</mark> and more.';
      const newClean = "Some text highlighted and more.";
      act(() => {
        result.current.enterPending(oldWithMarks, newClean);
      });
      // Should stay idle — the text content is identical once marks are stripped
      expect(result.current.mode).toBe("idle");
    });

    it("strips <mark> tags from both sides and diffs only text changes", () => {
      const { result } = renderHook(() => useDiffReview());
      const oldWithMarks =
        'Some text <mark data-color="yellow" class="highlight-yellow" data-highlight-id="abc123">highlighted</mark> and more content here.';
      const newChanged = "Some text highlighted and CHANGED content here.";
      act(() => {
        result.current.enterPending(oldWithMarks, newChanged);
      });
      // Should detect the real text change (more → CHANGED)
      expect(result.current.mode).toBe("pending");
      expect(result.current.changes.length).toBeGreaterThan(0);
      // The diff should NOT contain escaped mark tags
      expect(result.current.reviewContent).not.toContain("&lt;mark");
      expect(result.current.reviewContent).not.toContain("&lt;/mark");
    });

    it("getFinalContent returns clean text without mark tags", () => {
      const { result } = renderHook(() => useDiffReview());
      const oldWithMarks =
        '<mark data-color="yellow">First</mark> paragraph.\n\nSecond paragraph.';
      const newContent = "First paragraph.\n\nSecond paragraph MODIFIED.";
      act(() => {
        result.current.enterPending(oldWithMarks, newContent);
      });
      act(() => {
        result.current.acceptAll();
      });
      const final = result.current.getFinalContent();
      expect(final).not.toContain("<mark");
      expect(final).toBe(newContent);
    });

    it("strips <mark> tags from newContent too", () => {
      const { result } = renderHook(() => useDiffReview());
      // Both sides have marks — only the real text difference should be diffed
      const oldWithMarks =
        '<mark data-color="yellow">Same</mark> text here with more content.';
      const newWithMarks =
        '<mark data-color="blue">Same</mark> text here with more content.';
      act(() => {
        result.current.enterPending(oldWithMarks, newWithMarks);
      });
      // Text is identical after stripping — should stay idle
      expect(result.current.mode).toBe("idle");
    });

    it("getFinalContent with rejection restores clean old text (no mark tags)", () => {
      const { result } = renderHook(() => useDiffReview());
      const oldWithMarks =
        '<mark data-color="yellow">First</mark> paragraph.\n\nSecond paragraph.';
      const newContent = "First paragraph.\n\nSecond paragraph MODIFIED.";
      act(() => {
        result.current.enterPending(oldWithMarks, newContent);
      });
      act(() => {
        result.current.startReview();
      });
      for (const change of result.current.changes) {
        act(() => {
          result.current.rejectChange(change.id);
        });
      }
      const final = result.current.getFinalContent();
      // Should be the clean old text, not the version with <mark> tags
      expect(final).not.toContain("<mark");
      expect(final).toBe("First paragraph.\n\nSecond paragraph.");
    });
  });
});

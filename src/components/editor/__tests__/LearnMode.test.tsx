import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { LearnMode } from "../LearnMode";
import { applyInput, createSession, LEARN_PROGRESS_KEY, saveLearnProgress, toProgress } from "@/lib/learn-mode";

const WOODS = "I went to the woods.";

function setup(text = WOODS) {
  const onExit = vi.fn();
  const view = render(
    <LearnMode title="Walden" text={text} documentId="walden" passageKey="document" onExit={onExit} />,
  );
  return { onExit, ...view };
}

function typeKey(key: string) {
  fireEvent.keyDown(window, { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key });
}

afterEach(() => {
  cleanup();
  localStorage.removeItem(LEARN_PROGRESS_KEY);
});

describe("LearnMode", () => {
  it("brightens matched letters, underlines a miss, and does not block the next letter", () => {
    setup();
    for (const key of "I went to the Xo") typeKey(key);
    const missed = document.querySelector('[data-state="miss"]');
    expect(missed?.textContent).toBe("w");
    expect(document.body.textContent).toContain("I went to the woods.");
    const matches = document.querySelectorAll('[data-state="match"]');
    expect(matches.length).toBe("I went to the ".length + 1);
    expect(document.querySelector(".learn-title")?.textContent).toBe("Walden");
  });

  it("backspace clears a miss so it can be typed again", () => {
    setup("woods");
    typeKey("w");
    typeKey("X");
    expect(document.querySelector('[data-state="miss"]')).not.toBeNull();
    typeKey("Backspace");
    expect(document.querySelector('[data-state="miss"]')).toBeNull();
    typeKey("o");
    expect(document.querySelectorAll('[data-state="match"]')).toHaveLength(2);
  });

  it("Escape leaves at the source offset and writes progress locally", () => {
    const { onExit, unmount } = setup("woods");
    typeKey("w");
    typeKey("o");
    typeKey("Escape");
    expect(onExit).toHaveBeenCalledWith(2);
    unmount();
    const raw = localStorage.getItem(LEARN_PROGRESS_KEY);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw!) as { walden: { document: { mask: string; charactersTyped: number } } };
    expect(stored.walden.document.mask.startsWith("11")).toBe(true);
    expect(stored.walden.document.charactersTyped).toBe(2);
  });

  it("restores a saved mask for the same passage", () => {
    const session = applyInput(createSession("woods"), "wXo");
    saveLearnProgress("walden", toProgress(session, "document", 4000));
    setup("woods");
    expect(document.querySelectorAll('[data-state="match"]')).toHaveLength(2);
    expect(document.querySelector('[data-state="miss"]')?.textContent).toBe("o");
    expect(document.querySelector(".learn-stats")?.textContent).toContain("%");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  accuracyOf,
  applyInput,
  backspace,
  caretSourceIndex,
  createSession,
  deleteForward,
  encodeMask,
  formatElapsed,
  formatLearnStats,
  formatPage,
  frontierOf,
  LEARN_PAGE_CHARS,
  LEARN_PROGRESS_KEY,
  loadLearnProgress,
  moveCaret,
  moveCaretTo,
  moveToEnd,
  moveToParagraphStart,
  moveVertically,
  pageOf,
  saveLearnProgress,
  sourceHash,
  toProgress,
} from "../learn-mode";

// Words from Walden (Henry David Thoreau, 1854, public domain).
const WOODS = "I went to the woods because I wished to live deliberately.";
const SIMPLICITY = "“Simplicity, simplicity, simplicity!”";
const DASH = "I went to the woods — to front only the essential facts of life.";
const TWO = "I went to the woods.\nI wished to live deliberately.";

function type(text: string, input: string) {
  return applyInput(createSession(text), input);
}

function states(text: string, input: string): string {
  return type(text, input).cells.map((cell) => (cell === "match" ? "1" : cell === "miss" ? "0" : ".")).join("");
}

afterEach(() => {
  localStorage.removeItem(LEARN_PROGRESS_KEY);
});

describe("learn matching", () => {
  it("brightens a correctly typed sentence from Walden", () => {
    const session = type(WOODS, WOODS);
    expect(session.cells.every((cell) => cell === "match")).toBe(true);
    expect(session.caret).toBe(session.atoms.length);
    expect(session.typedCount).toBe(session.atoms.length);
    expect(session.correctCount).toBe(session.atoms.length);
  });

  it("lets a mistake through and keeps matching what follows", () => {
    // "woods" with the w mistyped, then the rest of the word, then the next word.
    const session = type(WOODS, "I went to the Xoods because");
    const mask = encodeMask(session.cells);
    const at = WOODS.indexOf("woods");
    expect(mask[at]).toBe("0");
    expect(mask.slice(at + 1, at + 5)).toBe("1111");
    expect(mask.slice(at + 5, at + 13)).toBe("11111111");
    expect(session.caret).toBe("I went to the Xoods because".length);
  });

  it("treats case as part of the text", () => {
    const session = type("Woods", "woods");
    expect(session.cells[0]).toBe("miss");
    expect(session.cells.slice(1).every((cell) => cell === "match")).toBe(true);
  });

  it("folds straight quotes onto curly ones", () => {
    const session = type(SIMPLICITY, '"Simplicity, simplicity, simplicity!"');
    expect(session.cells.every((cell) => cell === "match")).toBe(true);
    expect(session.caret).toBe(session.atoms.length);
  });

  it("folds a straight apostrophe onto a curly one", () => {
    const line = "life’s marrow";
    expect(states(line, "life's marrow").startsWith("111111")).toBe(true);
    expect(type(line, "life's marrow").cells.every((cell) => cell === "match")).toBe(true);
  });

  it("accepts a hyphen, a double hyphen, or an em dash for an em dash", () => {
    for (const typed of [
      "I went to the woods - to front only the essential facts of life.",
      "I went to the woods -- to front only the essential facts of life.",
      "I went to the woods --- to front only the essential facts of life.",
      "I went to the woods — to front only the essential facts of life.",
    ]) {
      const session = type(DASH, typed);
      expect(session.cells.every((cell) => cell === "match")).toBe(true);
      expect(session.caret).toBe(session.atoms.length);
    }
  });

  it("does not let a doubled hyphen swallow the next letter of a real hyphen", () => {
    const session = type("Spartan-like", "Spartan--like");
    const mask = encodeMask(session.cells);
    // Spartan, hyphen, then the extra hyphen misses the "l".
    expect(mask.startsWith("111111110")).toBe(true);
  });

  it("matches an ellipsis typed as three dots, one dot, or the glyph", () => {
    expect(type("lived…", "lived...").cells.every((cell) => cell === "match")).toBe(true);
    expect(type("lived…", "lived.").cells.every((cell) => cell === "match")).toBe(true);
    expect(type("lived...", "lived…").cells.every((cell) => cell === "match")).toBe(true);
    expect(type("not lived.", "not lived.").cells.every((cell) => cell === "match")).toBe(true);
  });

  it("matches a space to a non-breaking space", () => {
    const session = type("live\u00A0deliberately", "live deliberately");
    expect(session.cells.every((cell) => cell === "match")).toBe(true);
  });

  it("requires Enter for a paragraph break", () => {
    const session = type(TWO, "I went to the woods.\nI wished to live deliberately.");
    expect(session.cells.every((cell) => cell === "match")).toBe(true);
    const missed = type(TWO, "I went to the woods. I wished");
    const breakAt = createSession(TWO).atoms.findIndex((atom) => atom.kind === "break");
    expect(missed.cells[breakAt]).toBe("miss");
  });

  it("composes a decomposed letter into the precomposed one", () => {
    const session = type("René", "Rene\u0301");
    expect(session.cells.every((cell) => cell === "match")).toBe(true);
    expect(session.atoms).toHaveLength(4);
  });
});

describe("learn repair", () => {
  it("backspace undoes the last atom without forgetting that you typed it", () => {
    let session = type(WOODS, "I went to the X");
    const typed = session.typedCount;
    session = backspace(session);
    expect(session.caret).toBe("I went to the ".length);
    expect(session.cells[session.caret]).toBe("pending");
    expect(session.typedCount).toBe(typed);
    session = applyInput(session, "woods");
    const at = WOODS.indexOf("woods");
    expect(encodeMask(session.cells).slice(at, at + 5)).toBe("11111");
  });

  it("backspace peels an extra hyphen off an em dash before it clears the dash", () => {
    let session = type("day—night", "day--");
    expect(session.cells.every((cell, i) => (i < 4 ? cell === "match" : cell === "pending"))).toBe(true);
    session = backspace(session);
    // The second hyphen is gone; the dash is still matched and the caret has not moved.
    expect(session.caret).toBe(4);
    expect(session.cells[3]).toBe("match");
    session = backspace(session);
    expect(session.cells[3]).toBe("pending");
    expect(session.caret).toBe(3);
  });

  it("overwrites a miss in the middle and leaves the rest in place", () => {
    let session = type("woods", "wXods");
    expect(encodeMask(session.cells)).toBe("10111");
    session = moveCaretTo(session, 1);
    session = applyInput(session, "o");
    expect(encodeMask(session.cells)).toBe("11111");
    expect(session.caret).toBe(2);
    expect(session.typedCount).toBe(6);
    expect(session.correctCount).toBe(5);
  });

  it("will not move the caret into text you have not reached", () => {
    let session = type(WOODS, "I went");
    const frontier = frontierOf(session.cells);
    session = moveCaret(session, 8);
    expect(session.caret).toBe(frontier);
    session = moveCaretTo(session, 100);
    expect(session.caret).toBe(frontier);
    session = moveToEnd(session);
    expect(session.caret).toBe(frontier);
  });

  it("delete clears the atom under the caret", () => {
    let session = type("woods", "woods");
    session = moveCaretTo(session, 1);
    session = deleteForward(session);
    expect(session.cells[1]).toBe("pending");
    expect(session.caret).toBe(1);
    expect(encodeMask(session.cells)).toBe("1.111");
  });

  it("moves by paragraph", () => {
    let session = type(TWO, TWO);
    session = moveVertically(session, -1);
    const start = moveToParagraphStart(session);
    expect(start.caret).toBe(session.caret);
    const second = TWO.indexOf("\n") + 1;
    expect(caretSourceIndex(session)).toBe(second);
    session = moveVertically(session, -1);
    expect(session.caret).toBe(0);
  });
});

describe("learn progress", () => {
  it("saves the caret, the mask, the counts, and the time, then restores them", () => {
    let session = type(WOODS, "I went to the Xoods");
    session = moveCaretTo(session, WOODS.indexOf("woods"));
    const progress = toProgress(session, "document", 12_400, 1_700_000_000_000);
    saveLearnProgress("walden", progress);

    const loaded = loadLearnProgress("walden", "document", sourceHash(createSession(WOODS)));
    expect(loaded?.charactersTyped).toBe(session.typedCount);
    expect(loaded?.correctCount).toBe(session.correctCount);
    expect(loaded?.elapsedMs).toBe(12_400);
    expect(loaded?.mask).toContain("0");

    const restored = createSession(WOODS, loaded);
    expect(restored.caret).toBe(session.caret);
    expect(restored.cells).toEqual(session.cells);
    expect(restored.typedCount).toBe(session.typedCount);
    expect(accuracyOf(restored.typedCount, restored.correctCount)).toBeCloseTo(
      session.correctCount / session.typedCount,
    );
  });

  it("drops a mask when the passage text has changed", () => {
    const session = type(WOODS, "I went");
    saveLearnProgress("walden", toProgress(session, "document", 1000));
    const shortened = "I went to the woods.";
    const loaded = loadLearnProgress("walden", "document", sourceHash(createSession(shortened)));
    expect(loaded).toBeNull();
    expect(createSession(shortened, loaded).caret).toBe(0);
  });

  it("keeps passages and documents apart", () => {
    const woods = type("woods", "woods");
    const life = type("life", "life");
    saveLearnProgress("walden", toProgress(woods, "passage:woods", 500));
    saveLearnProgress("walden", toProgress(life, "passage:life", 800));
    saveLearnProgress("leaves", toProgress(woods, "passage:woods", 900));

    expect(loadLearnProgress("walden", "passage:life", sourceHash(createSession("life")))?.elapsedMs).toBe(800);
    expect(loadLearnProgress("walden", "passage:woods", sourceHash(createSession("woods")))?.elapsedMs).toBe(500);
    expect(loadLearnProgress("leaves", "passage:woods", sourceHash(createSession("woods")))?.elapsedMs).toBe(900);
    expect(loadLearnProgress("leaves", "passage:life", sourceHash(createSession("life")))).toBeNull();
  });

  it("ignores a corrupt store", () => {
    localStorage.setItem(LEARN_PROGRESS_KEY, "{");
    expect(loadLearnProgress("walden", "document", "x")).toBeNull();
    localStorage.setItem(LEARN_PROGRESS_KEY, JSON.stringify({ walden: { document: { mask: 4 } } }));
    expect(loadLearnProgress("walden", "document", "x")).toBeNull();
  });

  it("keeps a hole you stepped back through", () => {
    let session = type("woods", "woods");
    session = moveCaretTo(session, 3);
    session = backspace(session);
    expect(encodeMask(session.cells)).toBe("11.11");
    const restored = createSession("woods", toProgress(session, "document", 0));
    expect(restored.cells.map((cell) => (cell === "pending" ? "." : cell === "match" ? "1" : "0")).join("")).toBe(
      "11.11",
    );
    expect(restored.caret).toBe(2);
  });

  it("reports accuracy, time, and a page from the caret", () => {
    expect(accuracyOf(0, 0)).toBeNull();
    expect(accuracyOf(4, 3)).toBeCloseTo(0.75);
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(75_000)).toBe("1:15");
    expect(formatElapsed(3_661_000)).toBe("1:01:01");
    expect(formatLearnStats(0, 0, 400)).toBe("");
    expect(formatLearnStats(8, 7, 400)).toBe("88%");
    expect(formatLearnStats(8, 7, 1500)).toBe("88% · 0:01");

    const line = "I went to the woods. ";
    const repeats = Math.ceil((LEARN_PAGE_CHARS + 50) / line.length);
    const book = line.repeat(repeats);
    let session = createSession(book);
    session = applyInput(session, book.slice(0, LEARN_PAGE_CHARS + 10));
    const { page, pages } = pageOf(session);
    expect(pages).toBeGreaterThan(1);
    expect(page).toBe(2);
    expect(formatPage(page, pages)).toBe(`${page} / ${pages}`);
    expect(formatPage(1, 1)).toBe("1");
  });
});

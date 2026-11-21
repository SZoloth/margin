import { describe, it, expect, vi } from "vitest";
import { saveAndCloseTab } from "../save-and-close";
import type { TabCache } from "@/types/tab";

function cache(content: string, filePath: string | null): TabCache {
  return {
    document: null,
    content,
    filePath,
    isDirty: true,
    highlights: [],
    marginNotes: [],
    annotationsLoaded: false,
    scrollPosition: 0,
  };
}

function deps(overrides: Partial<Parameters<typeof saveAndCloseTab>[0]> = {}) {
  return {
    tabId: "t-1",
    activeTabId: "t-1",
    cached: undefined,
    saveActive: vi.fn().mockResolvedValue(true),
    saveFile: vi.fn().mockResolvedValue(true),
    close: vi.fn(),
    ...overrides,
  };
}

describe("saveAndCloseTab", () => {
  it("keeps the active tab open when its save fails", async () => {
    const d = deps({ saveActive: vi.fn().mockResolvedValue(false) });
    expect(await saveAndCloseTab(d)).toBe(false);
    expect(d.close).not.toHaveBeenCalled();
  });

  it("closes the active tab after a successful save", async () => {
    const d = deps();
    expect(await saveAndCloseTab(d)).toBe(true);
    expect(d.saveActive).toHaveBeenCalledTimes(1);
    expect(d.close).toHaveBeenCalledWith("t-1");
  });

  it("saves a background tab's own draft, not the active document", async () => {
    const d = deps({ tabId: "t-2", cached: cache("background draft", "/tmp/b.md") });
    expect(await saveAndCloseTab(d)).toBe(true);
    expect(d.saveActive).not.toHaveBeenCalled();
    expect(d.saveFile).toHaveBeenCalledWith("/tmp/b.md", "background draft");
    expect(d.close).toHaveBeenCalledWith("t-2");
  });

  it("keeps a background tab open when its write fails", async () => {
    const d = deps({
      tabId: "t-2",
      cached: cache("background draft", "/tmp/b.md"),
      saveFile: vi.fn().mockResolvedValue(false),
    });
    expect(await saveAndCloseTab(d)).toBe(false);
    expect(d.close).not.toHaveBeenCalled();
  });

  it("keeps a background tab open when its draft can't be found", async () => {
    const d = deps({ tabId: "t-2", cached: undefined });
    expect(await saveAndCloseTab(d)).toBe(false);
    expect(d.close).not.toHaveBeenCalled();
  });

  it("keeps a background article tab open: its text has nowhere to be written", async () => {
    const d = deps({ tabId: "t-2", cached: cache("edited article", null) });
    expect(await saveAndCloseTab(d)).toBe(false);
    expect(d.saveFile).not.toHaveBeenCalled();
    expect(d.close).not.toHaveBeenCalled();
  });
});

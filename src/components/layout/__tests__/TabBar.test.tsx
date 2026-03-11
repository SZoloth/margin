import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TabBar } from "../TabBar";
import type { Tab } from "@/types/tab";

// Mock HugeiconsIcon to avoid SVG rendering issues in tests
vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: ({ icon, ...props }: Record<string, unknown>) => (
    <span data-testid="icon" {...props} />
  ),
}));

vi.mock("@hugeicons/core-free-icons", () => ({
  Cancel01Icon: "Cancel01Icon",
  Add01Icon: "Add01Icon",
}));

const tabs: Tab[] = [
  { id: "1", title: "Doc A", isDirty: false, documentId: "d1", order: 0 },
  { id: "2", title: "Doc B", isDirty: true, documentId: "d2", order: 1 },
];

const defaultProps = {
  tabs,
  activeTabId: "1",
  onSelectTab: vi.fn(),
  onCloseTab: vi.fn(),
  onReorderTabs: vi.fn(),
  onNewTab: vi.fn(),
};

describe("TabBar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("applies tab-active class to the active tab", () => {
    render(<TabBar {...defaultProps} activeTabId="1" />);
    const tabElements = screen.getAllByRole("tab");
    expect(tabElements[0]?.classList.contains("tab-active")).toBe(true);
    expect(tabElements[1]?.classList.contains("tab-active")).toBe(false);
  });

  it("tab close button has tab-close class", () => {
    render(<TabBar {...defaultProps} />);
    const closeButtons = screen.getAllByRole("button", { name: /^Close / });
    for (const btn of closeButtons) {
      expect(btn.classList.contains("tab-close")).toBe(true);
    }
  });

  it("dirty indicator has tab-dirty class and role=status", () => {
    render(<TabBar {...defaultProps} />);
    const dirty = screen.getByRole("status", { name: "Unsaved changes" });
    expect(dirty.classList.contains("tab-dirty")).toBe(true);
  });

  it("new tab button has tab-new class", () => {
    render(<TabBar {...defaultProps} />);
    const newBtn = screen.getByRole("button", { name: "Open file in new tab" });
    expect(newBtn.classList.contains("tab-new")).toBe(true);
  });

  it("ArrowRight moves to the next tab", () => {
    const onSelectTab = vi.fn();
    render(<TabBar {...defaultProps} onSelectTab={onSelectTab} activeTabId="1" />);
    const activeTab = screen.getAllByRole("tab")[0]!;
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    expect(onSelectTab).toHaveBeenCalledWith("2");
  });

  it("ArrowLeft moves to the previous tab (wraps around)", () => {
    const onSelectTab = vi.fn();
    render(<TabBar {...defaultProps} onSelectTab={onSelectTab} activeTabId="1" />);
    const activeTab = screen.getAllByRole("tab")[0]!;
    fireEvent.keyDown(activeTab, { key: "ArrowLeft" });
    expect(onSelectTab).toHaveBeenCalledWith("2");
  });

  it("tab items have role=tab and aria-selected attributes", () => {
    render(<TabBar {...defaultProps} activeTabId="2" />);
    const tabElements = screen.getAllByRole("tab");
    expect(tabElements).toHaveLength(2);
    expect(tabElements[0]?.getAttribute("aria-selected")).toBe("false");
    expect(tabElements[1]?.getAttribute("aria-selected")).toBe("true");
  });
});

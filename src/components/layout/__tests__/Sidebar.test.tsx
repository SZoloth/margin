// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "../Sidebar";
import type { Document } from "@/types/document";
import type { Tab } from "@/types/tab";

const mockDoc: Document = {
  id: "doc1",
  title: "Test Doc",
  source: "file",
  file_path: "/test.md",
  keep_local_id: null,
  author: null,
  url: null,
  word_count: 0,
  last_opened_at: Date.now(),
  created_at: Date.now(),
};

const mockTab: Tab = {
  id: "tab1",
  documentId: "doc1",
  title: "Test Doc",
  isDirty: false,
  order: 0,
};

const defaultProps = {
  onOpenFile: vi.fn(),
  onSelectRecentDoc: vi.fn(),
  currentDoc: mockDoc,
  recentDocs: [mockDoc],
  searchQuery: "",
  onSearch: vi.fn(),
  searchResults: [],
  fileResults: [],
  isSearching: false,
  onOpenFilePath: vi.fn(),
  tabs: [mockTab],
};

describe("Sidebar", () => {
  describe("group headers", () => {
    it("renders with correct font size", () => {
      render(<Sidebar {...defaultProps} />);

      const header = screen.getByText("Today");
      expect(header.style.fontSize).toBe("11px");
    });

    it("renders with correct letter spacing", () => {
      render(<Sidebar {...defaultProps} />);

      const header = screen.getByText("Today");
      expect(header.style.letterSpacing).toBe("0.08em");
    });

    it("renders with text-secondary color", () => {
      render(<Sidebar {...defaultProps} />);

      const header = screen.getByText("Today");
      expect(header.style.color).toBe("var(--color-text-secondary)");
    });
  });

  describe("list items", () => {
    it("has py-2 padding class", () => {
      render(<Sidebar {...defaultProps} />);

      const item = screen.getByText("Test Doc").closest("button");
      expect(item?.className).toContain("py-2");
    });
  });

  describe("search input container", () => {
    it("has transition-colors and duration-150 classes", () => {
      render(<Sidebar {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText("Search documents...");
      const container = searchInput.closest("div.flex.items-center");
      expect(container?.className).toContain("transition-colors");
      expect(container?.className).toContain("duration-150");
    });
  });

  describe("open doc indicator", () => {
    it("renders dot when doc is in tabs", () => {
      render(<Sidebar {...defaultProps} />);

      const item = screen.getByText("Test Doc").closest("button");
      // The dot is a span inside the button, before the text
      const dot = item?.querySelector("span[style]");
      expect(dot).toBeTruthy();
      expect((dot as HTMLElement).style.borderRadius).toBe("50%");
    });

    it("does not render dot when doc is not in tabs", () => {
      render(<Sidebar {...defaultProps} tabs={[]} />);

      const item = screen.getByText("Test Doc").closest("button");
      // Should not have the indicator dot (a span with borderRadius 50%)
      const spans = item?.querySelectorAll("span");
      const dots = Array.from(spans ?? []).filter(
        (s) => s.style.borderRadius === "50%",
      );
      expect(dots).toHaveLength(0);
    });
  });
});

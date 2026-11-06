import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpSection } from "../HelpSection";

describe("HelpSection", () => {
  it("explains the loop before any setup", () => {
    render(<HelpSection />);
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings[0]).toBe("How Margin learns your style");
  });

  it("only points at things that ship", () => {
    render(<HelpSection />);
    expect(screen.queryByText(/margin-editor/)).toBeNull();
    expect(screen.queryByText(/MCP/)).toBeNull();
  });
});

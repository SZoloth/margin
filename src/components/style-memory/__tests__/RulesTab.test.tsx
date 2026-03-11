import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock tauri commands
vi.mock("@/lib/tauri-commands", () => ({
  getWritingRules: vi.fn(),
  updateWritingRule: vi.fn(),
  deleteWritingRule: vi.fn(),
  exportWritingRules: vi.fn(),
  markRulesReviewed: vi.fn().mockResolvedValue(1),
  markRulesUnreviewed: vi.fn().mockResolvedValue(1),
}));

import { RulesTab } from "../RulesTab";
import {
  getWritingRules,
  updateWritingRule,
  deleteWritingRule,
  exportWritingRules,
} from "@/lib/tauri-commands";

const baseRule = {
  id: "r1",
  ruleText: "Test rule",
  severity: "must-fix",
  category: "grammar",
  signalCount: 3,
  source: "synthesis",
  writingType: "general",
  whenToApply: null,
  why: null,
  exampleBefore: null,
  exampleAfter: null,
  notes: null,
  reviewedAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWritingRules).mockResolvedValue([baseRule]);
  vi.mocked(updateWritingRule).mockResolvedValue(undefined);
  vi.mocked(deleteWritingRule).mockResolvedValue(undefined);
  vi.mocked(exportWritingRules).mockResolvedValue({
    markdownPath: "~/.margin/writing-rules.md",
    hookPath: "~/.claude/hooks/writing_guard.py",
    ruleCount: 1,
  });
});

describe("RulesTab — SeverityBadge", () => {
  it("uses CSS var syntax instead of hardcoded hex colors", async () => {
    const { container } = render(
      <RulesTab onStatsChange={vi.fn()} />,
    );

    // Wait for async rule loading
    await waitFor(() => {
      const badge = container.querySelector("[data-severity-badge]");
      expect(badge).toBeTruthy();
    });

    const badge = container.querySelector("[data-severity-badge]") as HTMLElement;
    const style = badge.style;

    // Should use CSS vars, not hardcoded hex
    expect(style.background).toContain("var(--color-severity-must-fix-bg)");
    expect(style.color).toContain("var(--color-severity-must-fix-text)");
    expect(style.borderColor).toContain("var(--color-severity-must-fix-border)");
  });

  it("auto-exports profile artifacts after rule update", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);

    await screen.findByText("Test rule");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByDisplayValue("Test rule");
    await user.clear(input);
    await user.type(input, "Updated rule text");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateWritingRule).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(exportWritingRules).toHaveBeenCalledTimes(1);
    });
  });

  it("auto-exports profile artifacts after rule delete", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);

    await screen.findByText("Test rule");

    // Reset call count in case previous test's fire-and-forget leaked
    vi.mocked(exportWritingRules).mockClear();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(deleteWritingRule).toHaveBeenCalledWith("r1");
    });
    await waitFor(() => {
      expect(exportWritingRules).toHaveBeenCalledTimes(1);
    });
  });
});

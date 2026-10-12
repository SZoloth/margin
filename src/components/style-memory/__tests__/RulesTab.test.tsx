import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock tauri commands
vi.mock("@/lib/tauri-commands", () => ({
  getWritingRules: vi.fn(),
  updateWritingRule: vi.fn(),
  deleteWritingRule: vi.fn(),
  exportWritingRules: vi.fn(),
  markRulesReviewed: vi.fn().mockResolvedValue(1),
  markRulesUnreviewed: vi.fn().mockResolvedValue(1),
  getArchivedWritingRules: vi.fn().mockResolvedValue([]),
  unarchiveWritingRule: vi.fn().mockResolvedValue(undefined),
}));

import { RulesTab } from "../RulesTab";
import {
  getWritingRules,
  updateWritingRule,
  deleteWritingRule,
  exportWritingRules,
  unarchiveWritingRule,
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
  detectionPattern: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as const;

// RulesTab runs last in mustRunFirst, immediately before SettingsPage (earlyFirst).
// Its userEvent chains (2 clicks + 2 waitFor in the delete test) leave more stale
// async callbacks than the 3 global drain cycles clear. SettingsPage's act() then
// spin-waits on them, causing intermittent test failures under system load.
// Extra drain cycles here run after ALL RulesTab tests complete (before vi.resetModules
// and before SettingsPage loads), giving the jsdom queue a chance to fully flush.
afterAll(async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
});

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
    // Use fireEvent.change instead of user.clear()+user.type() to avoid userEvent
    // keyboard-event deadlock when stale rAF callbacks from preceding test files are
    // still pending in the jsdom queue (matches IntegrationsSection fix pattern).
    fireEvent.change(input, { target: { value: "Updated rule text" } });
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

    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(deleteWritingRule).toHaveBeenCalledWith("r1");
    });
    await waitFor(() => {
      expect(exportWritingRules).toHaveBeenCalledTimes(1);
    });
  });
});

describe("RulesTab — manager", () => {
  const second = {
    ...baseRule,
    id: "r2",
    ruleText: "Never open with a greeting",
    why: "Wastes the reader's first line",
    category: "openers",
    writingType: "email" as const,
    severity: "nice-to-fix" as const,
    signalCount: 5,
    detectionPattern: "^Hi ",
  };

  beforeEach(() => {
    vi.mocked(getWritingRules).mockResolvedValue([baseRule, second]);
  });

  it("searches across rule text and reasons, spanning reviewed state", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");

    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "first line");

    expect(screen.queryByText("Test rule")).toBeNull();
    expect(screen.getByText("Never open with a greeting")).toBeTruthy();
  });

  it("offers to clear filters when nothing matches", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");

    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "zzzz");
    expect(screen.getByText("No rules match these filters.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Test rule")).toBeTruthy();
  });

  it("filters by writing type", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");

    await user.selectOptions(screen.getByRole("combobox", { name: "Writing type" }), "email");
    expect(screen.queryByText("Test rule")).toBeNull();
    expect(screen.getByText("Never open with a greeting")).toBeTruthy();
  });

  it("marks rules with a detection pattern as mechanically blocked", async () => {
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");
    expect(screen.getByText("Blocked mechanically")).toBeTruthy();
    expect(screen.getByText("Advisory")).toBeTruthy();
  });

  it("archives in one step and restores from the undo notice", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");

    await user.click(screen.getAllByRole("button", { name: "Archive" })[0]!);
    const undo = await screen.findByRole("button", { name: "Undo" });
    await user.click(undo);

    await waitFor(() => expect(unarchiveWritingRule).toHaveBeenCalled());
  });

  it("archives the selected rules in bulk", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");

    await user.click(screen.getByRole("checkbox", { name: "Select rule: Test rule" }));
    await user.click(screen.getByRole("button", { name: "Archive selected" }));

    await waitFor(() => expect(deleteWritingRule).toHaveBeenCalledWith("r1"));
    expect(deleteWritingRule).toHaveBeenCalledTimes(1);
  });
});

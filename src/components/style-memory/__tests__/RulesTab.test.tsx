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
  seedRulesFromGuide: vi.fn(),
  openStyleGuideDialog: vi.fn(),
}));

import { RulesTab, isSuggested } from "../RulesTab";
import {
  getWritingRules,
  updateWritingRule,
  deleteWritingRule,
  exportWritingRules,
  markRulesReviewed,
  unarchiveWritingRule,
} from "@/lib/tauri-commands";

const baseRule = {
  id: "r1",
  ruleText: "Test rule",
  severity: "must-fix" as const,
  category: "grammar",
  signalCount: 3,
  source: "synthesis",
  writingType: "general" as const,
  whenToApply: null,
  why: null,
  exampleBefore: null,
  exampleAfter: null,
  notes: null,
  reviewedAt: null,
  detectionPattern: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const second = {
  ...baseRule,
  id: "r2",
  ruleText: "Never open with a greeting",
  why: "Wastes the reader's first line",
  category: "kill-words",
  writingType: "email" as const,
  severity: "nice-to-fix" as const,
  signalCount: 5,
  detectionPattern: "^Hi ",
  reviewedAt: 1,
};

const candidate = {
  ...baseRule,
  id: "c1",
  ruleText: "Cut throat-clearing openers",
  source: "synthesis-candidate",
  reviewedAt: null,
};

// RulesTab runs last in mustRunFirst, immediately before SettingsPage (earlyFirst).
// Its userEvent chains leave more stale async callbacks than the 3 global drain
// cycles clear. Extra drain cycles here run after ALL RulesTab tests complete.
afterAll(async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
});

/** A rule is one line until opened; open it before reaching for its actions. */
async function openRule(user: ReturnType<typeof userEvent.setup>, text: string) {
  const row = await screen.findByRole("button", { name: new RegExp(text) });
  if (row.getAttribute("aria-expanded") !== "true") await user.click(row);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWritingRules).mockResolvedValue([baseRule, second, candidate]);
  vi.mocked(updateWritingRule).mockResolvedValue(undefined);
  vi.mocked(deleteWritingRule).mockResolvedValue(undefined);
  vi.mocked(markRulesReviewed).mockResolvedValue(1);
  vi.mocked(exportWritingRules).mockResolvedValue({
    markdownPath: "~/.margin/writing-rules.md",
    hookPath: "~/.claude/hooks/writing_guard.py",
    ruleCount: 1,
  });
});

describe("isSuggested", () => {
  it("matches the CLI export gate: only unreviewed synthesis candidates wait", () => {
    expect(isSuggested({ source: "synthesis-candidate", reviewedAt: null })).toBe(true);
    expect(isSuggested({ source: "synthesis-candidate", reviewedAt: 5 })).toBe(false);
    // Seeded and manual rules are exported straight away, reviewed or not.
    expect(isSuggested({ source: "seed", reviewedAt: null })).toBe(false);
    expect(isSuggested({ source: "manual", reviewedAt: null })).toBe(false);
  });
});

describe("RulesTab — rules in effect", () => {
  it("uses CSS var syntax for severity instead of hardcoded hex colors", async () => {
    const { container } = render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");
    // Sorted by note count, so the must-fix rule isn't necessarily first.
    const badge = [...container.querySelectorAll<HTMLElement>("[data-severity-badge]")].find(
      (b) => b.textContent === "Must fix",
    )!;
    expect(badge.style.background).toContain("var(--color-severity-must-fix-bg)");
    expect(badge.style.color).toContain("var(--color-severity-must-fix-text)");
    expect(badge.style.borderColor).toContain("var(--color-severity-must-fix-border)");
    expect(badge.textContent).toBe("Must fix");
  });

  it("leaves suggestions out, and reports counts for both stages", async () => {
    const onStatsChange = vi.fn();
    render(<RulesTab onStatsChange={onStatsChange} />);
    await screen.findByText("Test rule");
    expect(screen.queryByText("Cut throat-clearing openers")).toBeNull();
    await waitFor(() => expect(onStatsChange).toHaveBeenLastCalledWith({ inEffect: 2, suggested: 1 }));
    // Never reports the pre-load empty list as zero.
    expect(onStatsChange).not.toHaveBeenCalledWith({ inEffect: 0, suggested: 0 });
  });

  it("names categories the way a writer would", async () => {
    render(<RulesTab onStatsChange={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /Words to cut/ })).toBeTruthy();
  });

  it("re-sends rules to Claude after an edit", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await openRule(user, "Test rule");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    // fireEvent.change avoids a userEvent keyboard deadlock seen under load.
    fireEvent.change(screen.getByDisplayValue("Test rule"), { target: { value: "Updated rule text" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateWritingRule).toHaveBeenCalled());
    await waitFor(() => expect(exportWritingRules).toHaveBeenCalledTimes(1));
  });

  it("archives in one step, re-sends rules, and restores from Undo", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await openRule(user, "Test rule");
    vi.mocked(exportWritingRules).mockClear();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(deleteWritingRule).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(exportWritingRules).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(unarchiveWritingRule).toHaveBeenCalledWith("r1"));
  });

  it("keeps each rule to one line until opened, one open at a time", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();

    await openRule(user, "Test rule");
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    await openRule(user, "Never open with a greeting");
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
  });

  it("says whether Claude is blocked or only guided", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await openRule(user, "Test rule");
    expect(screen.getByText("Guidance for Claude")).toBeTruthy();
    await openRule(user, "Never open with a greeting");
    expect(screen.getByText("Blocked automatically")).toBeTruthy();
  });

  it("searches rule text and reasons", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");
    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "first line");
    expect(screen.queryByText("Test rule")).toBeNull();
    expect(screen.getByText("Never open with a greeting")).toBeTruthy();
  });

  it("offers a way out when nothing matches", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");
    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "zzzz");
    expect(screen.getByText("No rules match")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(screen.getByText("Test rule")).toBeTruthy();
  });

  it("hides filters until asked, and counts the active ones", async () => {
    const user = userEvent.setup();
    render(<RulesTab onStatsChange={vi.fn()} />);
    await screen.findByText("Test rule");
    expect(screen.queryByRole("group", { name: "How strict" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Writing type" }), "email");
    expect(screen.queryByText("Test rule")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Must fix" }));
    expect(screen.getByRole("button", { name: "Filter · 2" })).toBeTruthy();
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

  it("teaches the first step when there are no rules", async () => {
    vi.mocked(getWritingRules).mockResolvedValue([candidate]);
    render(<RulesTab onStatsChange={vi.fn()} />);
    expect(await screen.findByText("No rules yet")).toBeTruthy();
    expect(screen.getByText("Start from a style guide")).toBeTruthy();
  });
});

describe("RulesTab — suggested", () => {
  it("shows only suggestions and says they do nothing until accepted", async () => {
    render(<RulesTab mode="suggested" onStatsChange={vi.fn()} />);
    await screen.findByText("Cut throat-clearing openers");
    expect(screen.queryByText("Test rule")).toBeNull();
    expect(screen.getByText(/Nothing here reaches Claude until you accept it/)).toBeTruthy();
  });

  it("accepting sends the rule to Claude", async () => {
    const user = userEvent.setup();
    render(<RulesTab mode="suggested" onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Accept: Cut throat-clearing openers" }));
    await waitFor(() => expect(markRulesReviewed).toHaveBeenCalledWith(["c1"]));
    await waitFor(() => expect(exportWritingRules).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Nothing to review")).toBeTruthy();
  });

  it("declining archives the suggestion and can be undone", async () => {
    const user = userEvent.setup();
    render(<RulesTab mode="suggested" onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Decline: Cut throat-clearing openers" }));
    await waitFor(() => expect(deleteWritingRule).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText(/Declined “Cut throat-clearing openers”/)).toBeTruthy();
  });

  it("accepts the selected suggestions in bulk", async () => {
    const user = userEvent.setup();
    render(<RulesTab mode="suggested" onStatsChange={vi.fn()} />);
    await screen.findByText("Cut throat-clearing openers");
    await user.click(screen.getByRole("checkbox", { name: "Select rule: Cut throat-clearing openers" }));
    await user.click(screen.getByRole("button", { name: "Accept selected" }));
    await waitFor(() => expect(markRulesReviewed).toHaveBeenCalledWith(["c1"]));
  });
});

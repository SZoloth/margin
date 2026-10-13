import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/tauri-commands", () => ({
  getWritingRules: vi.fn(),
  getCorrectionsFlat: vi.fn(),
  updateWritingRule: vi.fn(),
  deleteWritingRule: vi.fn(),
  exportWritingRules: vi.fn(),
  markRulesReviewed: vi.fn(),
  getArchivedWritingRules: vi.fn().mockResolvedValue([]),
  unarchiveWritingRule: vi.fn().mockResolvedValue(undefined),
  seedRulesFromGuide: vi.fn(),
  openStyleGuideDialog: vi.fn(),
}));

import { StyleGuide } from "../StyleGuide";
import {
  getWritingRules,
  getCorrectionsFlat,
  updateWritingRule,
  deleteWritingRule,
  exportWritingRules,
  markRulesReviewed,
  unarchiveWritingRule,
} from "@/lib/tauri-commands";

const base = {
  id: "r1",
  ruleText: "Cut leverage",
  severity: "must-fix" as const,
  category: "kill-words",
  signalCount: 2,
  source: "synthesis",
  writingType: "general" as const,
  whenToApply: null,
  why: "Corporate verb",
  exampleBefore: null,
  exampleAfter: null,
  notes: "synthesized-from:h1",
  reviewedAt: 1,
  detectionPattern: null,
  createdAt: 1,
  updatedAt: 1,
};
const preference = { ...base, id: "r2", ruleText: "State the claim first", severity: "nice-to-fix" as const, category: "structure", notes: null, source: "manual" };
const suggestion = { ...base, id: "s1", ruleText: "Never open with a greeting", severity: "should-fix" as const, category: "openers", writingType: "email" as const, source: "synthesis-candidate", reviewedAt: null, notes: null };

afterAll(async () => {
  for (let i = 0; i < 8; i++) await new Promise<void>((r) => setTimeout(r, 0));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWritingRules).mockResolvedValue([base, preference, suggestion]);
  vi.mocked(getCorrectionsFlat).mockResolvedValue([
    { highlightId: "h1", originalText: "teams leverage Margin", notes: ["Say use."], documentTitle: "Welcome", extendedContext: null, highlightColor: "yellow", writingType: null, polarity: "corrective", synthesizedAt: 1, createdAt: 1, suggestedEdit: null, acceptedAt: null },
  ]);
  vi.mocked(updateWritingRule).mockResolvedValue(undefined);
  vi.mocked(deleteWritingRule).mockResolvedValue(undefined);
  vi.mocked(markRulesReviewed).mockResolvedValue(1);
  vi.mocked(exportWritingRules).mockResolvedValue({ markdownPath: "", hookPath: "", ruleCount: 2 });
});

describe("StyleGuide", () => {
  it("reads as sentences under each kind of writing, led by how strict they are", async () => {
    render(<StyleGuide onStatsChange={vi.fn()} />);
    const general = await screen.findByRole("region", { name: "All writing" });
    expect(within(general).getByRole("button", { name: /Hard rule\s*Cut leverage/ })).toBeTruthy();
    expect(within(general).getByRole("button", { name: /Prefer\s*State the claim first/ })).toBeTruthy();
    const email = screen.getByRole("region", { name: "Email" });
    expect(within(email).getByRole("button", { name: /Suggested\s*Never open with a greeting/ })).toBeTruthy();
  });

  it("reports counts only after loading", async () => {
    const onStats = vi.fn();
    render(<StyleGuide onStatsChange={onStats} />);
    await waitFor(() => expect(onStats).toHaveBeenLastCalledWith({ inEffect: 2, suggested: 1 }));
    expect(onStats).not.toHaveBeenCalledWith({ inEffect: 0, suggested: 0 });
  });

  it("explains both kinds of rule before anything is selected", async () => {
    render(<StyleGuide onStatsChange={vi.fn()} />);
    const margin = await screen.findByRole("complementary", { name: "Rule details" });
    expect(within(margin).getByText(/Claude must not do this/)).toBeTruthy();
    expect(within(margin).getByText(/Claude leans this way/)).toBeTruthy();
  });

  it("shows the notes a rule came from in the margin", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /Cut leverage/ }));
    const margin = screen.getByRole("complementary", { name: "Rule details" });
    await waitFor(() => expect(within(margin).getByText("teams leverage Margin")).toBeTruthy());
    expect(within(margin).getByText("Say use.")).toBeTruthy();
    expect(within(margin).getByText(/Checked automatically/)).toBeTruthy();
  });

  it("switching to Preference keeps the rule but drops it from must-fix, and re-sends", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /Cut leverage/ }));
    await user.click(screen.getByRole("radio", { name: "Preference" }));
    await waitFor(() => expect(updateWritingRule).toHaveBeenCalledWith("r1", expect.objectContaining({ severity: "should-fix" })));
    await waitFor(() => expect(exportWritingRules).toHaveBeenCalled());
  });

  it("H flips strictness on the selected rule", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /State the claim first/ }));
    await user.keyboard("h");
    await waitFor(() => expect(updateWritingRule).toHaveBeenCalledWith("r2", expect.objectContaining({ severity: "must-fix" })));
  });

  it("accepts a suggestion inline and sends it to Claude", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Accept: Never open with a greeting" }));
    await waitFor(() => expect(markRulesReviewed).toHaveBeenCalledWith(["s1"]));
    await waitFor(() => expect(exportWritingRules).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Accept: Never open with a greeting" })).toBeNull();
  });

  it("A and D decide the selected suggestion from the keyboard", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /Suggested\s*Never open/ }));
    await user.keyboard("d");
    await waitFor(() => expect(deleteWritingRule).toHaveBeenCalledWith("s1"));
    expect(await screen.findByText(/Declined “Never open with a greeting”/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(unarchiveWritingRule).toHaveBeenCalledWith("s1"));
  });

  it("A and D do nothing to rules already in use", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /Cut leverage/ }));
    await user.keyboard("d");
    await user.keyboard("a");
    expect(deleteWritingRule).not.toHaveBeenCalled();
    expect(markRulesReviewed).not.toHaveBeenCalled();
  });

  it("accepts every suggestion at once", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Accept all" }));
    await waitFor(() => expect(markRulesReviewed).toHaveBeenCalledWith(["s1"]));
  });

  it("archives a rule from the margin with an Undo", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /State the claim first/ }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(deleteWritingRule).toHaveBeenCalledWith("r2"));
    expect(await screen.findByText(/Archived “State the claim first”/)).toBeTruthy();
  });

  it("filters to hard rules only", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await screen.findByRole("button", { name: /Cut leverage/ });
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Hard rules" }));
    expect(screen.queryByRole("button", { name: /State the claim first/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Never open/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Filter · 1" })).toBeTruthy();
  });

  it("offers a way out when search matches nothing", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await screen.findByRole("button", { name: /Cut leverage/ });
    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "zzzz");
    expect(screen.getByText("No rules match")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(screen.getByRole("button", { name: /Cut leverage/ })).toBeTruthy();
  });

  it("starts empty with a way to add a style guide", async () => {
    vi.mocked(getWritingRules).mockResolvedValue([]);
    render(<StyleGuide onStatsChange={vi.fn()} />);
    expect(await screen.findByText("Your style guide is empty")).toBeTruthy();
    expect(screen.getByText("Start from a style guide")).toBeTruthy();
  });

  it("Try your rules marks what the guard would catch", async () => {
    const user = userEvent.setup();
    render(<StyleGuide onStatsChange={vi.fn()} />);
    await screen.findByRole("button", { name: /Cut leverage/ });
    await user.click(screen.getByRole("button", { name: "Try your rules" }));
    const bench = screen.getByRole("region", { name: "Try your rules" });
    const draft = within(bench).getByRole("textbox", { name: "Draft to check" });
    await user.clear(draft);
    await user.type(draft, "We cut leverage here.");
    expect(within(bench).getByText(/Margin would stop this save/)).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock tauri commands
vi.mock("@/lib/tauri-commands", () => ({
  getWritingRules: vi.fn().mockResolvedValue([
    {
      id: "r1",
      ruleText: "Test rule",
      severity: "must-fix",
      category: "grammar",
      signalCount: 3,
      source: "synthesis",
      writingType: "prose",
      whenToApply: null,
      why: null,
      exampleBefore: null,
      exampleAfter: null,
      notes: null,
      reviewedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]),
  updateWritingRule: vi.fn(),
  deleteWritingRule: vi.fn(),
  exportWritingRules: vi.fn(),
  markRulesReviewed: vi.fn().mockResolvedValue(1),
  markRulesUnreviewed: vi.fn().mockResolvedValue(1),
}));

import { RulesTab } from "../RulesTab";

describe("RulesTab — SeverityBadge", () => {
  it("uses CSS var syntax instead of hardcoded hex colors", async () => {
    const { container } = render(
      <RulesTab onStatsChange={vi.fn()} />,
    );

    // Wait for async rule loading
    await vi.waitFor(() => {
      const badge = container.querySelector("[data-severity-badge]");
      expect(badge).toBeTruthy();
    });

    const badge = container.querySelector("[data-severity-badge]") as HTMLElement;
    const style = badge.style;

    // Should use CSS vars, not hardcoded hex
    expect(style.background).toContain("var(--color-severity-");
    expect(style.color).toContain("var(--color-severity-");
    expect(style.borderColor).toContain("var(--color-severity-");
  });
});

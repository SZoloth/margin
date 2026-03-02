// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsModal } from "../SettingsModal";
import type { Settings } from "@/hooks/useSettings";

const defaultSettings: Settings = {
  theme: "light",
  fontSize: "default",
  lineSpacing: "default",
  readerWidth: "default",
  defaultHighlightColor: "yellow",
  persistCorrections: false,
};

describe("SettingsModal — SegmentedControl ARIA", () => {
  it("renders SegmentedControl with role='radiogroup' and radio buttons with aria-checked", () => {
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={defaultSettings}
        setSetting={vi.fn()}
        onOpenCorrections={vi.fn()}
      />,
    );

    // Should have multiple radiogroups (Theme, Font size, Line spacing, Reader width)
    const radiogroups = screen.getAllByRole("radiogroup");
    expect(radiogroups.length).toBeGreaterThanOrEqual(1);

    // Each radiogroup should have radio buttons
    for (const group of radiogroups) {
      const radios = group.querySelectorAll("[role='radio']");
      expect(radios.length).toBeGreaterThanOrEqual(2);

      // Exactly one should be checked
      const checked = Array.from(radios).filter(
        (r) => r.getAttribute("aria-checked") === "true",
      );
      expect(checked.length).toBe(1);
    }
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WritingSection } from "../WritingSection";
import type { Settings } from "@/hooks/useSettings";

vi.mock("@/lib/tauri-commands", () => ({
  getCorrectionsCount: vi.fn().mockResolvedValue(5),
  getAllCorrections: vi.fn().mockResolvedValue([]),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

const defaultSettings: Settings = {
  theme: "system",
  fontSize: "default",
  lineSpacing: "default",
  readerWidth: "default",
  defaultHighlightColor: "yellow",
  persistCorrections: false,
};

describe("WritingSection", () => {
  const defaultProps = {
    settings: defaultSettings,
    setSetting: vi.fn(),
    onOpenCorrections: vi.fn(),
  };

  it("renders persist corrections toggle", () => {
    render(<WritingSection {...defaultProps} />);

    expect(screen.getByText("Remember corrections")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("renders style memory row with correction count", async () => {
    render(<WritingSection {...defaultProps} />);

    // Wait for async correction count to load
    expect(await screen.findByText(/5 corrections/)).toBeInTheDocument();
    expect(screen.getByText("Style Memory")).toBeInTheDocument();
  });

  it("calls setSetting for persistCorrections toggle", async () => {
    const setSetting = vi.fn();
    const user = userEvent.setup();

    render(<WritingSection {...defaultProps} setSetting={setSetting} />);

    await user.click(screen.getByRole("switch"));
    expect(setSetting).toHaveBeenCalledWith("persistCorrections", true);
  });
});

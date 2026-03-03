// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadingSection } from "../ReadingSection";
import { DEFAULT_SETTINGS } from "@/hooks/useSettings";

describe("ReadingSection", () => {
  const defaultProps = {
    settings: DEFAULT_SETTINGS,
    setSetting: vi.fn(),
  };

  it("renders theme segmented control with Light/Dark/System", () => {
    render(<ReadingSection {...defaultProps} />);

    const themeGroup = screen.getByRole("radiogroup", { name: "Theme" });
    expect(themeGroup).toBeInTheDocument();

    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("renders font size control with Small/Default/Large/XL", () => {
    render(<ReadingSection {...defaultProps} />);

    const fontGroup = screen.getByRole("radiogroup", { name: "Font size" });
    expect(fontGroup).toBeInTheDocument();

    expect(screen.getByText("Small")).toBeInTheDocument();
    // "Default" appears multiple times (font size, line spacing, etc.)
    expect(screen.getByText("Large")).toBeInTheDocument();
    expect(screen.getByText("X-Large")).toBeInTheDocument();
  });

  it("renders line spacing control", () => {
    render(<ReadingSection {...defaultProps} />);

    const spacingGroup = screen.getByRole("radiogroup", { name: "Line spacing" });
    expect(spacingGroup).toBeInTheDocument();

    expect(screen.getByText("Compact")).toBeInTheDocument();
    expect(screen.getByText("Relaxed")).toBeInTheDocument();
  });

  it("renders reader width control", () => {
    render(<ReadingSection {...defaultProps} />);

    const widthGroup = screen.getByRole("radiogroup", { name: "Reader width" });
    expect(widthGroup).toBeInTheDocument();

    expect(screen.getByText("Narrow")).toBeInTheDocument();
    expect(screen.getByText("Wide")).toBeInTheDocument();
  });

  it("renders highlight color picker with 5 colors", () => {
    render(<ReadingSection {...defaultProps} />);

    // Each color should be a button with an aria-label matching the color value
    expect(screen.getByLabelText("yellow")).toBeInTheDocument();
    expect(screen.getByLabelText("green")).toBeInTheDocument();
    expect(screen.getByLabelText("blue")).toBeInTheDocument();
    expect(screen.getByLabelText("pink")).toBeInTheDocument();
    expect(screen.getByLabelText("orange")).toBeInTheDocument();
  });

  it("calls setSetting when controls change", async () => {
    const setSetting = vi.fn();
    const user = userEvent.setup();

    render(<ReadingSection {...defaultProps} setSetting={setSetting} />);

    // Change theme
    await user.click(screen.getByText("Dark"));
    expect(setSetting).toHaveBeenCalledWith("theme", "dark");

    // Change highlight color
    await user.click(screen.getByLabelText("blue"));
    expect(setSetting).toHaveBeenCalledWith("defaultHighlightColor", "blue");
  });

  it("has inline preview card showing sample text", () => {
    render(<ReadingSection {...defaultProps} />);

    // Preview should contain some literary text
    const preview = screen.getByTestId("reading-preview");
    expect(preview).toBeInTheDocument();
    expect(preview.textContent).toBeTruthy();
  });
});

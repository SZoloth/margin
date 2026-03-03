// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorPicker } from "../ColorPicker";

const colors = [
  { value: "yellow", css: "var(--color-highlight-yellow)" },
  { value: "green", css: "var(--color-highlight-green)" },
  { value: "blue", css: "var(--color-highlight-blue)" },
];

describe("ColorPicker", () => {
  it("renders all color options", () => {
    render(
      <ColorPicker colors={colors} value="yellow" onChange={vi.fn()} />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
  });

  it("shows selected color with ring", () => {
    render(
      <ColorPicker colors={colors} value="green" onChange={vi.fn()} />,
    );

    const buttons = screen.getAllByRole("button");
    // Selected button (green, index 1) should have ring classes
    expect(buttons[1]!.className).toMatch(/ring-2/);
    // Non-selected should not
    expect(buttons[0]!.className).not.toMatch(/ring-2/);
  });

  it("calls onChange on click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ColorPicker colors={colors} value="yellow" onChange={onChange} />,
    );

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[2]!);
    expect(onChange).toHaveBeenCalledWith("blue");
  });

  it("each button has aria-label", () => {
    render(
      <ColorPicker colors={colors} value="yellow" onChange={vi.fn()} />,
    );

    const buttons = screen.getAllByRole("button");
    for (let i = 0; i < colors.length; i++) {
      expect(buttons[i]!).toHaveAttribute("aria-label", colors[i]!.value);
    }
  });
});

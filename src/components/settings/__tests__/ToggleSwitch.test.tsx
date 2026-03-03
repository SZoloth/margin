// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToggleSwitch } from "../ToggleSwitch";

describe("ToggleSwitch", () => {
  it("has role='switch' with aria-checked", () => {
    render(<ToggleSwitch checked={true} onChange={vi.fn()} />);

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("toggles on click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ToggleSwitch checked={false} onChange={onChange} />);

    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("supports aria-labelledby prop", () => {
    render(
      <ToggleSwitch
        checked={false}
        onChange={vi.fn()}
        ariaLabelledBy="my-label"
      />,
    );

    expect(screen.getByRole("switch")).toHaveAttribute(
      "aria-labelledby",
      "my-label",
    );
  });

  it("shows correct visual state for on/off", () => {
    const { rerender } = render(
      <ToggleSwitch checked={false} onChange={vi.fn()} />,
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    rerender(<ToggleSwitch checked={true} onChange={vi.fn()} />);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});

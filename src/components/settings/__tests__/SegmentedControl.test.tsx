import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "../SegmentedControl";

const options = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

describe("SegmentedControl", () => {
  it("renders all options with correct labels", () => {
    render(
      <SegmentedControl
        options={options}
        value="light"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("shows selected option with aria-checked='true'", () => {
    render(
      <SegmentedControl
        options={options}
        value="dark"
        onChange={vi.fn()}
      />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
    expect(radios[2]).toHaveAttribute("aria-checked", "false");
  });

  it("has role='radiogroup' with role='radio' children", () => {
    render(
      <SegmentedControl
        options={options}
        value="light"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("uses roving tabindex: only selected has tabIndex=0", () => {
    render(
      <SegmentedControl
        options={options}
        value="dark"
        onChange={vi.fn()}
      />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("tabindex", "-1");
    expect(radios[1]).toHaveAttribute("tabindex", "0");
    expect(radios[2]).toHaveAttribute("tabindex", "-1");
  });

  it("arrow keys cycle through options", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SegmentedControl
        options={options}
        value="light"
        onChange={onChange}
      />,
    );

    const radios = screen.getAllByRole("radio");
    radios[0]!.focus();

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("dark");

    onChange.mockClear();
    await user.keyboard("{ArrowLeft}");
    // ArrowLeft from "light" (index 0) wraps to "system" (last)
    expect(onChange).toHaveBeenCalledWith("system");
  });

  it("Home/End jump to first/last option", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SegmentedControl
        options={options}
        value="dark"
        onChange={onChange}
      />,
    );

    const radios = screen.getAllByRole("radio");
    radios[1]!.focus();

    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenCalledWith("light");

    onChange.mockClear();
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenCalledWith("system");
  });

  it("calls onChange when selection changes via click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SegmentedControl
        options={options}
        value="light"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText("Dark"));
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("renders with ariaLabel on the group", () => {
    render(
      <SegmentedControl
        options={options}
        value="light"
        onChange={vi.fn()}
        ariaLabel="Theme selector"
      />,
    );

    expect(screen.getByRole("radiogroup")).toHaveAttribute(
      "aria-label",
      "Theme selector",
    );
  });
});

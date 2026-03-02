// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DiffNavChip } from "../DiffNavChip";

describe("DiffNavChip", () => {
  afterEach(cleanup);

  it("renders 0 of 0 and disables nav when empty", () => {
    render(
      <DiffNavChip
        currentIndex={0}
        totalCount={0}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByText("0 of 0")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous change" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next change" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders 1 of 1 and disables nav when only one change exists", () => {
    render(
      <DiffNavChip
        currentIndex={0}
        totalCount={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByText("1 of 1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous change" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next change" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("clamps the display index when currentIndex is out of range", () => {
    render(
      <DiffNavChip
        currentIndex={10}
        totalCount={5}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByText("5 of 5")).toBeTruthy();
  });

  it("only triggers keyboard navigation when multiple changes exist", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();

    const { rerender } = render(
      <DiffNavChip
        currentIndex={0}
        totalCount={1}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );

    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "[" });
    expect(onNext).toHaveBeenCalledTimes(0);
    expect(onPrev).toHaveBeenCalledTimes(0);

    rerender(
      <DiffNavChip
        currentIndex={0}
        totalCount={2}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );

    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "[" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { RuleCaughtChip } from "../RuleCaughtChip";

afterEach(cleanup);

describe("RuleCaughtChip", () => {
  it("counts a new rule's catches outside the view and goes to them", () => {
    const onGo = vi.fn();
    render(<RuleCaughtChip count={1} direction="below" onGo={onGo} />);
    fireEvent.click(screen.getByRole("button", { name: "Caught 1 more below" }));
    expect(onGo).toHaveBeenCalled();
  });

  it("says above when the catches are above", () => {
    render(<RuleCaughtChip count={3} direction="above" onGo={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toBe("Caught 3 more above");
  });
});

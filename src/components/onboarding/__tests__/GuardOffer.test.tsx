import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act, screen } from "@testing-library/react";
import { GuardOffer } from "../GuardOffer";

afterEach(cleanup);

describe("GuardOffer", () => {
  it("names the rule and what turning the guard on changes on disk", () => {
    render(<GuardOffer phrase="leverage" onEnable={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("“leverage”");
    expect(screen.getByRole("status").textContent).toContain("~/.claude/hooks");
  });

  it("turns the guard on and confirms only after it succeeded", async () => {
    let resolve!: () => void;
    const onEnable = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<GuardOffer phrase="leverage" onEnable={onEnable} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on Writing guard" }));
    expect(onEnable).toHaveBeenCalled();
    expect(screen.queryByText(/Writing guard is on/)).toBeNull();
    await act(async () => resolve());
    expect(screen.getByText(/Writing guard is on/)).toBeTruthy();
  });

  it("reports a failure instead of claiming success", async () => {
    const onEnable = vi.fn().mockRejectedValue(new Error("permission denied"));
    render(<GuardOffer phrase="leverage" onEnable={onEnable} onDismiss={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Turn on Writing guard" }));
    });
    expect(screen.getByText(/permission denied/)).toBeTruthy();
    expect(screen.queryByText(/Writing guard is on/)).toBeNull();
  });

  it("can be declined", () => {
    const onDismiss = vi.fn();
    render(<GuardOffer phrase="leverage" onEnable={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

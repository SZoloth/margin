import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { WelcomeBar } from "../WelcomeBar";

afterEach(cleanup);

describe("WelcomeBar", () => {
  // It's dismissed by the reader's first selection. If it took up space, the
  // document would jump mid-drag and the selection would land on other words.
  it("floats over the page instead of taking space in the layout", () => {
    render(<WelcomeBar visible onDismiss={vi.fn()} />);
    const bar = screen.getByText(/Select a phrase/);
    expect(bar.style.position).toBe("fixed");
    expect(bar.style.pointerEvents).toBe("none");
  });
});

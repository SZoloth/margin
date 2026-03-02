// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DiffBanner } from "../DiffBanner";

describe("DiffBanner", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders a review label when not reviewing", () => {
    render(
      <DiffBanner
        changeCount={2}
        pendingCount={0}
        updatedAt={null}
        onAcceptAll={vi.fn()}
        onReview={vi.fn()}
        onDismiss={vi.fn()}
        isReviewing={false}
      />,
    );

    expect(screen.getByText("2 changes to review")).toBeTruthy();
    const acceptAll = screen.getByRole("button", { name: "Accept all" }) as HTMLButtonElement;
    expect(acceptAll.disabled).toBe(false);
  });

  it("renders a remaining label when reviewing with pending changes", () => {
    render(
      <DiffBanner
        changeCount={5}
        pendingCount={1}
        updatedAt={null}
        onAcceptAll={vi.fn()}
        onReview={vi.fn()}
        onDismiss={vi.fn()}
        isReviewing={true}
      />,
    );

    expect(screen.getByText("1 change remaining")).toBeTruthy();
    const acceptAll = screen.getByRole("button", { name: "Accept all" }) as HTMLButtonElement;
    expect(acceptAll.disabled).toBe(false);
  });

  it("renders an all-reviewed label and disables Accept all when none remain", () => {
    render(
      <DiffBanner
        changeCount={5}
        pendingCount={0}
        updatedAt={null}
        onAcceptAll={vi.fn()}
        onReview={vi.fn()}
        onDismiss={vi.fn()}
        isReviewing={true}
      />,
    );

    expect(screen.getByText("All changes reviewed")).toBeTruthy();
    const acceptAll = screen.getByRole("button", { name: "Accept all" }) as HTMLButtonElement;
    expect(acceptAll.disabled).toBe(true);
  });

  it("includes an Updated timestamp when updatedAt is set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));

    render(
      <DiffBanner
        changeCount={1}
        pendingCount={0}
        updatedAt={Date.now() - 60_000}
        onAcceptAll={vi.fn()}
        onReview={vi.fn()}
        onDismiss={vi.fn()}
        isReviewing={false}
      />,
    );

    expect(screen.getByText("Updated 1m ago")).toBeTruthy();
  });
});

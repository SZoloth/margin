import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnboarding } from "../useOnboarding";

describe("useOnboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never times out while a first-time user is still working", () => {
    // Regression: a 30-second fallback completed onboarding mid-task.
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.step).toBe("welcome");
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(result.current.step).toBe("welcome");
    expect(localStorage.getItem("margin-onboarding-complete")).toBeNull();
  });

  it("completes and remembers it", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.complete());
    expect(result.current.step).toBe("complete");
    expect(localStorage.getItem("margin-onboarding-complete")).not.toBeNull();
  });
});

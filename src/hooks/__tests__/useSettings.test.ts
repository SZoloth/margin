// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettings } from "../useSettings";

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn((_: string, fn: (e: MediaQueryListEvent) => void) => listeners.push(fn)),
    removeEventListener: vi.fn((_: string, fn: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    dispatchEvent: () => true,
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return {
    mql,
    listeners,
    setMatches: (m: boolean) => {
      mql.matches = m;
    },
  };
}

const DEFAULTS = {
  theme: "system",
  persistCorrections: false,
  fontSize: "default",
  lineSpacing: "default",
  readerWidth: "default",
  defaultHighlightColor: "yellow",
};

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.cssText = "";
    vi.restoreAllMocks();
    // Default matchMedia to light system theme
    mockMatchMedia(false);
  });

  // --- Loading ---

  describe("loading", () => {
    it("loads defaults when localStorage is empty", () => {
      const { result } = renderHook(() => useSettings());
      expect(result.current.settings).toEqual(DEFAULTS);
    });

    it("merges partial stored settings with defaults", () => {
      localStorage.setItem("margin-settings", JSON.stringify({ theme: "dark" }));
      const { result } = renderHook(() => useSettings());
      expect(result.current.settings.theme).toBe("dark");
      expect(result.current.settings.fontSize).toBe("default");
      expect(result.current.settings.defaultHighlightColor).toBe("yellow");
    });

    it("falls back to defaults on corrupt JSON", () => {
      localStorage.setItem("margin-settings", "not json{{");
      const { result } = renderHook(() => useSettings());
      expect(result.current.settings).toEqual(DEFAULTS);
    });
  });

  // --- Migration ---

  describe("migration", () => {
    it("migrates old margin-theme key", () => {
      localStorage.setItem("margin-theme", "dark");
      const { result } = renderHook(() => useSettings());

      expect(result.current.settings.theme).toBe("dark");
      expect(localStorage.getItem("margin-theme")).toBeNull();

      const stored = JSON.parse(localStorage.getItem("margin-settings")!);
      expect(stored.theme).toBe("dark");
    });
  });

  // --- DOM application ---

  describe("DOM application", () => {
    it("sets data-theme attribute on document.documentElement", () => {
      localStorage.setItem("margin-settings", JSON.stringify({ theme: "dark" }));
      renderHook(() => useSettings());
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("sets CSS variables for fontSize", () => {
      localStorage.setItem("margin-settings", JSON.stringify({ fontSize: "large" }));
      renderHook(() => useSettings());

      const fontSize = document.documentElement.style.getPropertyValue("--reader-font-size");
      expect(fontSize).toBe("1.25rem");
      expect(fontSize).not.toBe("1.125rem"); // Not the default value
    });
  });

  // --- Theme resolution ---

  describe("theme resolution", () => {
    it("system theme resolves to dark when matchMedia matches", () => {
      mockMatchMedia(true);
      localStorage.setItem("margin-settings", JSON.stringify({ theme: "system" }));
      renderHook(() => useSettings());
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("system theme resolves to light when matchMedia does not match", () => {
      mockMatchMedia(false);
      localStorage.setItem("margin-settings", JSON.stringify({ theme: "system" }));
      renderHook(() => useSettings());
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  // --- setSetting ---

  describe("setSetting", () => {
    it("updates state, persists to localStorage, and applies to DOM", () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.setSetting("theme", "dark");
      });

      expect(result.current.settings.theme).toBe("dark");

      const stored = JSON.parse(localStorage.getItem("margin-settings")!);
      expect(stored.theme).toBe("dark");

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  // --- resetSettings ---

  describe("resetSettings", () => {
    it("resets all settings to defaults", () => {
      mockMatchMedia(false);
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.setSetting("theme", "dark");
      });
      expect(result.current.settings.theme).toBe("dark");

      act(() => {
        result.current.resetSettings();
      });

      expect(result.current.settings).toEqual(DEFAULTS);

      const stored = JSON.parse(localStorage.getItem("margin-settings")!);
      expect(stored).toEqual(DEFAULTS);

      // System theme with matchMedia(false) resolves to light
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  // --- System theme listener ---

  describe("system theme listener", () => {
    it("fires on system preference change when theme is system", () => {
      const { listeners, setMatches } = mockMatchMedia(false);
      localStorage.setItem("margin-settings", JSON.stringify({ theme: "system" }));

      renderHook(() => useSettings());
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(listeners.length).toBe(1);

      // Simulate system theme change to dark
      setMatches(true);
      act(() => {
        listeners.forEach((fn) =>
          fn({ matches: true } as MediaQueryListEvent),
        );
      });

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("does not add listener when theme is explicit", () => {
      const { mql } = mockMatchMedia(false);
      localStorage.setItem("margin-settings", JSON.stringify({ theme: "dark" }));

      renderHook(() => useSettings());

      // addEventListener is called once during mount for the initial matchMedia query,
      // but the useEffect should not add a listener since theme !== "system"
      // The effect returns early, so no addEventListener call from the effect
      // matchMedia() is still called for resolveTheme, but addEventListener should not be
      expect(mql.addEventListener).not.toHaveBeenCalled();
    });

    it("removes listener when theme changes from system to explicit", () => {
      const { mql, listeners } = mockMatchMedia(false);
      localStorage.setItem("margin-settings", JSON.stringify({ theme: "system" }));

      const { result } = renderHook(() => useSettings());
      expect(listeners.length).toBe(1);

      act(() => {
        result.current.setSetting("theme", "dark");
      });

      // useEffect cleanup should have removed the listener
      expect(mql.removeEventListener).toHaveBeenCalled();
      expect(listeners.length).toBe(0);
    });
  });
});

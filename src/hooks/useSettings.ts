import { useState, useEffect, useCallback } from "react";

export interface Settings {
  theme: "light" | "dark" | "system";
  autosave: boolean;
  persistCorrections: boolean;
  fontSize: "small" | "default" | "large" | "xl";
  lineSpacing: "compact" | "default" | "relaxed";
  readerWidth: "narrow" | "default" | "wide";
  defaultHighlightColor: "yellow" | "green" | "blue" | "pink" | "orange";
}

const DEFAULTS: Settings = {
  theme: "system",
  autosave: false,
  persistCorrections: false,
  fontSize: "default",
  lineSpacing: "default",
  readerWidth: "default",
  defaultHighlightColor: "yellow",
};

const STORAGE_KEY = "margin-settings";

const FONT_SIZE_MAP: Record<Settings["fontSize"], string> = {
  small: "1rem",
  default: "1.125rem",
  large: "1.25rem",
  xl: "1.375rem",
};

const LINE_SPACING_MAP: Record<Settings["lineSpacing"], string> = {
  compact: "1.5",
  default: "1.72",
  relaxed: "1.9",
};

const READER_WIDTH_MAP: Record<Settings["readerWidth"], string> = {
  narrow: "55ch",
  default: "65ch",
  wide: "75ch",
};

type ResolvedTheme = "light" | "dark";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(theme: Settings["theme"]): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Corrupt storage — use defaults
  }

  // Migrate from old theme-only key
  const oldTheme = localStorage.getItem("margin-theme");
  if (oldTheme === "light" || oldTheme === "dark" || oldTheme === "system") {
    const migrated: Settings = { ...DEFAULTS, theme: oldTheme };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    localStorage.removeItem("margin-theme");
    return migrated;
  }

  return DEFAULTS;
}

function applyToDOM(settings: Settings) {
  const root = document.documentElement;

  // Theme
  root.setAttribute("data-theme", resolveTheme(settings.theme));

  // Reader typography
  root.style.setProperty("--reader-font-size", FONT_SIZE_MAP[settings.fontSize]);
  root.style.setProperty("--reader-line-height", LINE_SPACING_MAP[settings.lineSpacing]);
  root.style.setProperty("--reader-max-width", READER_WIDTH_MAP[settings.readerWidth]);
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Apply on mount
  useEffect(() => {
    applyToDOM(settings);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (settings.theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.setAttribute("data-theme", getSystemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      applyToDOM(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
    setSettings(DEFAULTS);
    applyToDOM(DEFAULTS);
  }, []);

  return { settings, setSetting, resetSettings } as const;
}

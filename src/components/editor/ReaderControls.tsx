import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Settings } from "@/hooks/useSettings";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { SegmentedControl } from "@/components/settings/SegmentedControl";
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_SPACING_OPTIONS,
  READER_WIDTH_OPTIONS,
} from "@/components/settings/ReadingSection";

interface ReaderControlsProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const rowLabel: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--color-text-tertiary)",
  fontFamily: "'Instrument Sans', system-ui, sans-serif",
};

/**
 * In-reader typography controls ("Aa"). Mirrors the Reading settings section
 * through the same persisted settings keys — one source of truth, two surfaces.
 */
export function ReaderControls({ settings, setSetting }: ReaderControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isMounted, isVisible } = useAnimatedPresence(isOpen, 150);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setIsOpen(true);
  };

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        aria-label="Reading settings"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Reading settings"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 28,
          padding: "0 8px",
          border: "1px solid var(--color-border)",
          backgroundColor: isOpen ? "var(--active-bg)" : "transparent",
          color: "var(--color-text-secondary)",
          borderRadius: 6,
          cursor: "pointer",
          flexShrink: 0,
          fontSize: 13,
          fontFamily: "'Newsreader', Georgia, serif",
          lineHeight: 1,
        }}
      >
        Aa
      </button>

      {isMounted && anchor &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Reading settings"
            style={{
              position: "fixed",
              top: anchor.top,
              right: anchor.right,
              zIndex: 600,
              backgroundColor: "var(--color-page)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              padding: "14px 16px",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "scale(1) translateY(0)" : "scale(0.97) translateY(-4px)",
              transformOrigin: "top right",
              transition: isVisible
                ? "opacity 150ms var(--ease-entrance), transform 150ms var(--ease-entrance)"
                : "opacity 120ms var(--ease-exit), transform 120ms var(--ease-exit)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={rowLabel}>Typeface</span>
              <SegmentedControl
                options={FONT_FAMILY_OPTIONS}
                value={settings.fontFamily}
                onChange={(v) => setSetting("fontFamily", v)}
                ariaLabel="Typeface"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={rowLabel}>Size</span>
              <SegmentedControl
                options={FONT_SIZE_OPTIONS}
                value={settings.fontSize}
                onChange={(v) => setSetting("fontSize", v)}
                ariaLabel="Font size"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={rowLabel}>Spacing</span>
              <SegmentedControl
                options={LINE_SPACING_OPTIONS}
                value={settings.lineSpacing}
                onChange={(v) => setSetting("lineSpacing", v)}
                ariaLabel="Line spacing"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={rowLabel}>Width</span>
              <SegmentedControl
                options={READER_WIDTH_OPTIONS}
                value={settings.readerWidth}
                onChange={(v) => setSetting("readerWidth", v)}
                ariaLabel="Reader width"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

import { useEffect, useRef } from "react";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";

interface WelcomeBarProps {
  visible: boolean;
  onDismiss: () => void;
}

export function WelcomeBar({ visible, onDismiss }: WelcomeBarProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presence = useAnimatedPresence(visible, 300);

  // Auto-dismiss after 8s
  useEffect(() => {
    if (!visible) return;
    timerRef.current = setTimeout(onDismiss, 8_000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, onDismiss]);

  // Dismiss on first text selection
  useEffect(() => {
    if (!visible) return;
    const handleSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) {
        onDismiss();
      }
    };
    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, [visible, onDismiss]);

  if (!presence.isMounted) return null;

  return (
    <div
      style={{
        textAlign: "center",
        padding: "8px 16px",
        fontSize: "var(--text-sm)",
        fontFamily: "'Instrument Sans', system-ui, sans-serif",
        color: "var(--color-text-secondary)",
        opacity: presence.isVisible ? 1 : 0,
        transition: presence.isVisible
          ? "opacity 500ms var(--ease-entrance)"
          : "opacity 300ms var(--ease-exit)",
      }}
    >
      Welcome to Margin. Select any text to highlight it.
    </div>
  );
}

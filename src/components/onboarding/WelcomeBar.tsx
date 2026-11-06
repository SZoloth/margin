import { useEffect } from "react";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";

interface WelcomeBarProps {
  visible: boolean;
  onDismiss: () => void;
}

export function WelcomeBar({ visible, onDismiss }: WelcomeBarProps) {
  const presence = useAnimatedPresence(visible, 300);

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
      // Fixed, not in the layout: the first selection dismisses it, and if it
      // took space the page would jump mid-drag and select the wrong words.
      style={{
        position: "fixed",
        left: "50%",
        bottom: 28,
        transform: "translateX(-50%)",
        zIndex: 40,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        textAlign: "center",
        padding: "7px 14px",
        borderRadius: 999,
        backgroundColor: "var(--color-page)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-sm)",
        fontSize: "var(--text-sm)",
        fontFamily: "var(--font-sans)",
        color: "var(--color-text-secondary)",
        opacity: presence.isVisible ? 1 : 0,
        transition: presence.isVisible
          ? "opacity 500ms var(--ease-entrance)"
          : "opacity 300ms var(--ease-exit)",
      }}
    >
      Select a phrase in this draft that you’d never write.
    </div>
  );
}

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
      style={{
        textAlign: "center",
        padding: "8px 16px",
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

import { useEffect, useRef } from "react";

/**
 * Cmd/Ctrl+Shift+H — highlight chord. Single-chord toggle semantics live in
 * the callback (apply when the selection isn't fully highlighted, remove
 * when it is) — this hook only owns the keybinding.
 */
export function useHighlightShortcut(onChord: () => void) {
  const onChordRef = useRef(onChord);
  onChordRef.current = onChord;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyH") {
        e.preventDefault();
        onChordRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

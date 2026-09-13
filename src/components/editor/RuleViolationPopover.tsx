import { useEffect, useRef } from "react";
import type { WritingRule } from "@/lib/tauri-commands";

interface Props {
  rule: WritingRule;
  rect: DOMRect;
  onClose: () => void;
}

/**
 * Read-only surface for a resurfaced rule: what fired, why it exists,
 * what to write instead. Corrections coming back in the reader.
 */
export function RuleViolationPopover({ rule, rect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(rect.left, window.innerWidth - 300),
    top: rect.bottom + 8,
    zIndex: 60,
  };

  return (
    <div ref={ref} className="rule-violation-popover" style={style} role="dialog" aria-label="Writing rule">
      <div className={`rule-violation-popover-severity rule-violation-popover-severity--${rule.severity}`}>
        {rule.severity === "must-fix" ? "Must fix" : rule.severity === "should-fix" ? "Should fix" : "Nice to fix"}
      </div>
      <div className="rule-violation-popover-text">{rule.ruleText}</div>
      {rule.why && <div className="rule-violation-popover-why">{rule.why}</div>}
      {rule.exampleAfter && (
        <div className="rule-violation-popover-suggestion">→ {rule.exampleAfter}</div>
      )}
    </div>
  );
}

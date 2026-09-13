import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { WritingRule } from "@/lib/tauri-commands";

interface Props {
  rule: WritingRule;
  /** Snapshot at click time — used until the first remeasure. */
  rect: DOMRect;
  /** The decoration span, for re-measuring position on scroll/resize. */
  anchorEl: HTMLElement | null;
  /** Doc range of the flagged text (for apply-the-fix). */
  from: number;
  to: number;
  /** The text actually underlined (may differ from ruleText for regex rules). */
  matched: string;
  onApply?: (from: number, to: number, replacement: string) => void;
  onClose: () => void;
}

const SEVERITY_LABEL: Record<string, string> = {
  "must-fix": "Must fix",
  "should-fix": "Should fix",
  "nice-to-fix": "Nice to fix",
};

function categoryLabel(category: string): string {
  return category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Surface for a resurfaced rule: what fired, why it exists, and a one-click
 * fix. Corrections coming back in the reader.
 *
 * Lives in the margin lane like the highlight thread — marginalia never
 * covers its subject. On narrow viewports it drops to a bottom sheet.
 */
export function RuleViolationPopover({
  rule,
  rect,
  anchorEl,
  from,
  to,
  matched,
  onApply,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [liveRect, setLiveRect] = useState<DOMRect>(rect);
  const [laneX, setLaneX] = useState<number | null>(null);
  const [popoverH, setPopoverH] = useState(120);
  const isMobile = window.innerWidth < 768;

  // PM rebuilds decoration spans on routine selection/doc changes — the
  // clicked element is a snapshot. Track the match by its index among this
  // rule's violations and adopt the rebuilt span instead of closing.
  const [anchor, setAnchor] = useState<HTMLElement | null>(anchorEl);
  const pmEl = anchor?.closest(".ProseMirror") ?? null;
  const matchIndexRef = useRef(0);
  useLayoutEffect(() => {
    if (!anchorEl || !pmEl) return;
    const all = pmEl.querySelectorAll(
      `.rule-violation[data-rule-id="${CSS.escape(rule.id)}"]`,
    );
    matchIndexRef.current = [...all].indexOf(anchorEl);
  }, [anchorEl, pmEl, rule.id]);

  const adoptOrClose = () => {
    if (!pmEl) {
      onClose();
      return;
    }
    const all = pmEl.querySelectorAll<HTMLElement>(
      `.rule-violation[data-rule-id="${CSS.escape(rule.id)}"]`,
    );
    const next = all[matchIndexRef.current];
    if (next && next.textContent === matched) {
      setAnchor(next);
    } else {
      onClose();
    }
  };

  // Measure before paint so the card never flashes at the in-text fallback.
  useLayoutEffect(() => {
    const col = document.querySelector(".reader-content-column");
    if (col) setLaneX(col.getBoundingClientRect().right + 24);
    if (ref.current) setPopoverH(ref.current.offsetHeight);
  }, []);

  useEffect(() => setLiveRect(rect), [rect]);

  // The open-state wash lives on the decoration itself (data-open set via
  // setRuleScanOpen) — mutating PM-managed DOM here would fight the view.

  // Re-measure the anchor on scroll/resize — a fixed-position card against
  // a scrolling document needs a live rect or it orphans instantly. If the
  // decoration span is gone (edit or re-scan), the rule no longer applies
  // to what's on screen — close.
  useEffect(() => {
    let rafId = 0;
    const remeasure = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (anchor && !anchor.isConnected) {
          adoptOrClose();
          return;
        }
        if (anchor) {
          const rects = anchor.getClientRects();
          setLiveRect(rects[rects.length - 1] ?? anchor.getBoundingClientRect());
        }
        const col = document.querySelector(".reader-content-column");
        if (col) setLaneX(col.getBoundingClientRect().right + 24);
        if (ref.current) setPopoverH(ref.current.offsetHeight);
      });
    };
    remeasure();
    window.addEventListener("scroll", remeasure, { capture: true, passive: true });
    window.addEventListener("resize", remeasure);
    return () => {
      window.removeEventListener("scroll", remeasure, { capture: true });
      window.removeEventListener("resize", remeasure);
      cancelAnimationFrame(rafId);
    };
  }, [anchor]);

  // The decoration can be rebuilt without a scroll event (re-scan after an
  // edit, PM selection sync) — watch for the anchor leaving the DOM.
  useEffect(() => {
    if (!anchor?.isConnected || !pmEl) return;
    const obs = new MutationObserver(() => {
      if (!anchor.isConnected) adoptOrClose();
    });
    obs.observe(pmEl, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [anchor, pmEl]);

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

  const sevColor =
    rule.severity === "must-fix"
      ? "var(--color-danger)"
      : rule.severity === "nice-to-fix"
        ? "var(--color-text-tertiary)"
        : "var(--color-warning)";

  if (isMobile) {
    return createPortal(
      <div
        ref={ref}
        className="thread-popover rule-violation-popover rule-violation-popover--mobile"
        role="dialog"
        aria-label="Writing rule"
      >
        <div className="thread-top">
          <button
            type="button"
            className="thread-icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
          </button>
        </div>
        <RuleCardBody rule={rule} matched={matched} from={from} to={to} onApply={onApply} />
      </div>,
      document.body,
    );
  }

  const popoverWidth = 300;
  const laneFits = laneX !== null && laneX + popoverWidth <= window.innerWidth - 8;
  const left = laneFits
    ? laneX
    : Math.min(liveRect.right + 12, window.innerWidth - popoverWidth - 8);
  const top = Math.max(8, Math.min(liveRect.top, window.innerHeight - popoverH - 8));
  const popoverLeft = Math.max(8, left);
  const connectorWidth = popoverLeft - liveRect.right;

  // Hairline in the leading just below the underlined text — same geometry
  // as the highlight thread, but two-tone: whisper-quiet while it passes
  // under live text, full strength once it reaches the margin gutter.
  const lineY = liveRect.bottom + 3;
  const cardBottom = top + popoverH;
  const lineHitsCard = lineY >= top && lineY <= cardBottom;
  const gutterX = laneX !== null ? laneX - 24 : liveRect.right;
  const underTextWidth = Math.max(0, Math.min(gutterX, popoverLeft) - liveRect.right);
  const inLaneLeft = liveRect.right + underTextWidth;
  const inLaneWidth = Math.max(0, popoverLeft - inLaneLeft);

  return createPortal(
    <>
      {connectorWidth >= 8 && underTextWidth > 0 && (
        <div
          aria-hidden="true"
          className="thread-anchor-line"
          style={{
            top: lineY,
            left: liveRect.right,
            width: underTextWidth,
            background: `color-mix(in srgb, ${sevColor} 14%, transparent)`,
          }}
        />
      )}
      {connectorWidth >= 8 && inLaneWidth > 0 && (
        <div
          aria-hidden="true"
          className="thread-anchor-line"
          style={{
            top: lineY,
            left: inLaneLeft,
            width: inLaneWidth,
            background: `color-mix(in srgb, ${sevColor} 38%, transparent)`,
          }}
        />
      )}
      {connectorWidth >= 8 && !lineHitsCard && (
        <div
          aria-hidden="true"
          className="thread-anchor-line thread-anchor-line--vertical"
          style={{
            top: Math.min(lineY, cardBottom),
            left: popoverLeft,
            height: Math.abs(lineY - cardBottom),
            background: `color-mix(in srgb, ${sevColor} 38%, transparent)`,
          }}
        />
      )}
      <div
        ref={ref}
        className="thread-popover rule-violation-popover"
        role="dialog"
        aria-label="Writing rule"
        style={{
          left: popoverLeft,
          top,
          transformOrigin: `0 ${Math.max(10, lineY - top)}px`,
        }}
      >
        <div className="thread-top">
          <button
            type="button"
            className="thread-icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
          </button>
        </div>
        <RuleCardBody rule={rule} matched={matched} from={from} to={to} onApply={onApply} />
      </div>
    </>,
    document.body,
  );
}

function RuleCardBody({
  rule,
  matched,
  from,
  to,
  onApply,
}: {
  rule: WritingRule;
  matched: string;
  from: number;
  to: number;
  onApply?: (from: number, to: number, replacement: string) => void;
}) {
  // For literal rules ruleText IS the flagged word — echo the matched text
  // instead. For pattern rules ruleText is a description worth keeping.
  const isLiteralEcho =
    rule.ruleText.trim().toLowerCase() === matched.trim().toLowerCase();
  return (
    <div className="rule-violation-popover-body">
      <div className="rule-violation-popover-head">
        <span
          className={`rule-violation-popover-severity rule-violation-popover-severity--${rule.severity}`}
        >
          {SEVERITY_LABEL[rule.severity] ?? rule.severity}
        </span>
        <span className="rule-violation-popover-category">{categoryLabel(rule.category)}</span>
      </div>
      <div className="rule-violation-popover-text">“{matched}”</div>
      {!isLiteralEcho && (
        <div className="rule-violation-popover-why">{rule.ruleText}</div>
      )}
      {rule.why && <div className="rule-violation-popover-why">{rule.why}</div>}
      {rule.exampleAfter &&
        (onApply ? (
          <button
            type="button"
            className="rule-violation-apply"
            onClick={() => onApply(from, to, rule.exampleAfter ?? "")}
          >
            Replace with “{rule.exampleAfter}”
          </button>
        ) : (
          <div className="rule-violation-popover-suggestion">
            Try: “{rule.exampleAfter}”
          </div>
        ))}
    </div>
  );
}

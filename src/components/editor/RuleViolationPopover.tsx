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
  /** Every range this rule matches in the doc — powers "N of M". */
  allRanges: { from: number; to: number }[];
  /** The text actually underlined (may differ from ruleText for regex rules). */
  matched: string;
  onApply?: (from: number, to: number, replacement: string) => void;
  onApplyAll?: (replacement: string) => void;
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
 * covers its subject. When the lane can't fit the card (narrow viewports)
 * it drops to a bottom sheet instead of floating over prose.
 */
export function RuleViolationPopover({
  rule,
  rect,
  anchorEl,
  from,
  to,
  allRanges,
  matched,
  onApply,
  onApplyAll,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [liveRect, setLiveRect] = useState<DOMRect>(rect);
  const [laneX, setLaneX] = useState<number | null>(null);
  const [popoverH, setPopoverH] = useState(120);
  const [closing, setClosing] = useState(false);
  // Occasional interaction → small exit animation budget (~150ms).
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 140);
  };
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  // A different match opened while the close animation was still running —
  // the same component instance receives new props, so reset the flag.
  useEffect(() => setClosing(false), [from, to]);

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
      requestClose();
      return;
    }
    const all = pmEl.querySelectorAll<HTMLElement>(
      `.rule-violation[data-rule-id="${CSS.escape(rule.id)}"]`,
    );
    const next = all[matchIndexRef.current];
    if (next && next.textContent === matched) {
      setAnchor(next);
    } else {
      requestClose();
    }
  };

  // Measure before paint so the card never flashes at the wrong spot.
  useLayoutEffect(() => {
    const col = document.querySelector(".reader-content-column");
    if (col) setLaneX(col.getBoundingClientRect().right + 24);
    if (ref.current) setPopoverH(ref.current.offsetHeight);
  }, []);

  useEffect(() => setLiveRect(rect), [rect]);

  // Re-measure the anchor on scroll/resize — a fixed-position card against
  // a scrolling document needs a live rect or it orphans instantly. If the
  // decoration span is gone (edit or re-scan), the rule no longer applies
  // to what's on screen — close. Same when the anchor scrolls off-screen.
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
          const r = anchor.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) {
            requestClose();
            return;
          }
          setLiveRect(r);
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
        requestClose();
      }
    }
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) requestClose();
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  // Focus trap + restore — same discipline as the highlight thread.
  const previousFocusRef = useRef<Element | null>(null);
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const first = ref.current?.querySelector<HTMLElement>(
      ".rule-violation-apply, .thread-icon-btn",
    );
    first?.focus({ preventScroll: true });
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const popover = ref.current;
    if (!popover) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = popover.querySelectorAll<HTMLElement>(
        'button, textarea, input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    popover.addEventListener("keydown", handleTab);
    return () => popover.removeEventListener("keydown", handleTab);
  }, []);

  const sevColor =
    rule.severity === "must-fix"
      ? "var(--color-danger)"
      : rule.severity === "nice-to-fix"
        ? "var(--color-text-tertiary)"
        : "var(--color-warning)";

  const ariaLabel = `${SEVERITY_LABEL[rule.severity] ?? rule.severity}: “${matched}”`;
  const popoverWidth = 300;
  const laneFits = laneX !== null && laneX + popoverWidth <= window.innerWidth - 8;
  // Marginalia never covers its subject — when the lane can't fit the card
  // it drops to the sheet rather than floating over prose.
  const useSheet = window.innerWidth < 768 || !laneFits;

  if (useSheet) {
    return createPortal(
      <div
        ref={ref}
        className={`thread-popover rule-violation-popover rule-violation-popover--mobile${closing ? " rule-violation-popover--closing" : ""}`}
        role="dialog"
        aria-label={ariaLabel}
      >
        <div className="thread-top">
          <button
            type="button"
            className="thread-icon-btn"
            onClick={requestClose}
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
          </button>
        </div>
        <RuleCardBody
          rule={rule}
          matched={matched}
          from={from}
          to={to}
          total={allRanges.length}
          onApply={onApply}
          onApplyAll={onApplyAll}
        />
      </div>,
      document.body,
    );
  }

  const left = laneFits ? laneX : window.innerWidth - popoverWidth - 8;
  const top = Math.max(8, Math.min(liveRect.top, window.innerHeight - popoverH - 8));
  const popoverLeft = Math.max(8, left);
  const connectorWidth = popoverLeft - liveRect.right;

  // Hairline sits in the mid-leading below the text line — far enough from
  // underline height that it can't read as underlining innocent words.
  // A short drop-tick at the anchor's right edge keeps the tie explicit.
  const lineY = liveRect.bottom + 9;
  const cardBottom = top + popoverH;
  const lineHitsCard = lineY >= top && lineY <= cardBottom;
  const gutterX = laneX !== null ? laneX - 24 : liveRect.right;
  const underTextWidth = Math.max(0, Math.min(gutterX, popoverLeft) - liveRect.right);
  const inLaneLeft = liveRect.right + underTextWidth;
  const inLaneWidth = Math.max(0, popoverLeft - inLaneLeft);

  return createPortal(
    <>
      {connectorWidth >= 8 && (
        <div
          aria-hidden="true"
          className="thread-anchor-line thread-anchor-line--vertical"
          style={{
            top: liveRect.bottom,
            left: liveRect.right - 1,
            height: 9,
            background: `color-mix(in srgb, ${sevColor} 38%, transparent)`,
          }}
        />
      )}
      {connectorWidth >= 8 && underTextWidth > 0 && (
        <div
          aria-hidden="true"
          className="thread-anchor-line"
          style={{
            top: lineY,
            left: liveRect.right,
            width: underTextWidth,
            background: `color-mix(in srgb, ${sevColor} 7%, transparent)`,
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
        className={`thread-popover rule-violation-popover${closing ? " rule-violation-popover--closing" : ""}`}
        role="dialog"
        aria-label={ariaLabel}
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
            onClick={requestClose}
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
          </button>
        </div>
        <RuleCardBody
          rule={rule}
          matched={matched}
          from={from}
          to={to}
          total={allRanges.length}
          onApply={onApply}
          onApplyAll={onApplyAll}
        />
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
  total,
  onApply,
  onApplyAll,
}: {
  rule: WritingRule;
  matched: string;
  from: number;
  to: number;
  total: number;
  onApply?: (from: number, to: number, replacement: string) => void;
  onApplyAll?: (replacement: string) => void;
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
        <span className="rule-violation-popover-category">
          {categoryLabel(rule.category)}
          {total > 1 ? ` · ${total} in doc` : ""}
        </span>
      </div>
      <div className="rule-violation-popover-text">“{matched}”</div>
      {!isLiteralEcho && (
        <div className="rule-violation-popover-pattern">{rule.ruleText}</div>
      )}
      {rule.why && <div className="rule-violation-popover-why">{rule.why}</div>}
      {rule.exampleAfter && (
        <div className="rule-violation-actions">
          {onApply ? (
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
          )}
          {onApply && onApplyAll && total > 1 && (
            <button
              type="button"
              className="rule-violation-apply rule-violation-apply--all"
              onClick={() => onApplyAll(rule.exampleAfter ?? "")}
            >
              All {total}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

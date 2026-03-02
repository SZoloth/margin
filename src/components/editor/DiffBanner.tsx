import { useState, useEffect } from "react";

interface DiffBannerProps {
  changeCount: number;
  pendingCount: number;
  updatedAt: number | null;
  onAcceptAll: () => void;
  onReview: () => void;
  onDismiss: () => void;
  isReviewing: boolean;
}

function relativeTime(timestamp: number | null): string {
  if (!timestamp) return "";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function DiffBanner({
  changeCount,
  pendingCount,
  updatedAt,
  onAcceptAll,
  onReview,
  onDismiss,
  isReviewing,
}: DiffBannerProps) {
  // Re-render periodically so the relative timestamp stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!updatedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [updatedAt]);

  const canAcceptAll = isReviewing ? pendingCount > 0 : changeCount > 0;
  const label = isReviewing
    ? (pendingCount > 0
      ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} remaining`
      : "All changes reviewed")
    : (changeCount > 0
      ? `${changeCount} change${changeCount === 1 ? "" : "s"} to review`
      : "No changes to review");

  return (
    <div className="diff-banner">
      <div className="diff-banner__accent" aria-hidden="true" />
      <span className="diff-banner__count">
        {label}
      </span>
      {updatedAt && (
        <span className="diff-banner__time">
          Updated {relativeTime(updatedAt)}
        </span>
      )}
      <div className="diff-banner__actions">
        <button
          type="button"
          className="diff-banner__btn diff-banner__btn--accent"
          onClick={onAcceptAll}
          disabled={!canAcceptAll}
        >
          Accept all
        </button>
        {!isReviewing && (
          <button
            type="button"
            className="diff-banner__btn diff-banner__btn--primary"
            onClick={onReview}
          >
            Review
          </button>
        )}
        <button
          type="button"
          className="diff-banner__btn diff-banner__btn--icon"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

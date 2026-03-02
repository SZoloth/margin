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

  const label = changeCount === 1 ? "1 change" : `${changeCount} changes`;
  const pendingLabel = isReviewing && pendingCount > 0
    ? ` (${pendingCount} remaining)`
    : "";

  return (
    <div className="diff-banner">
      <span className="diff-banner__count">
        {label}{pendingLabel}
      </span>
      {updatedAt && (
        <span className="diff-banner__time">
          {relativeTime(updatedAt)}
        </span>
      )}
      <div className="diff-banner__actions">
        {!isReviewing && (
          <button
            type="button"
            className="diff-banner__btn"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        )}
        {!isReviewing && (
          <button
            type="button"
            className="diff-banner__btn"
            onClick={onReview}
          >
            Review
          </button>
        )}
        <button
          type="button"
          className="diff-banner__btn diff-banner__btn--primary"
          onClick={onAcceptAll}
        >
          Accept all
        </button>
      </div>
    </div>
  );
}

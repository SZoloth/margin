import type { KeepLocalItem } from "@/types/keep-local";

interface SidebarKeepLocalProps {
  items: KeepLocalItem[];
  isOnline: boolean;
  isLoading: boolean;
  onSelectItem: (item: KeepLocalItem, newTab: boolean) => void;
}

export function SidebarKeepLocal({
  items,
  isOnline,
  isLoading,
  onSelectItem,
}: SidebarKeepLocalProps) {
  if (!isOnline) {
    return (
      <div
        className="px-3 py-6 text-center text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Server offline
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="px-3 py-6 text-center text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Loading...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="px-3 py-6 text-center text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        No articles found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={(e) => onSelectItem(item, e.metaKey)}
          disabled={!item.contentAvailable}
          className={item.contentAvailable ? "interactive-item" : ""}
          style={{
            display: "block",
            width: "100%",
            padding: "6px 12px",
            border: "none",
            backgroundColor: "transparent",
            cursor: item.contentAvailable ? "pointer" : "default",
            textAlign: "left",
            opacity: item.contentAvailable ? 1 : 0.5,
          }}
        >
          <div
            className="text-sm font-medium truncate"
            style={{ color: "var(--color-text-primary)", marginBottom: 2 }}
          >
            {item.title || "Untitled"}
          </div>
          <div
            className="flex gap-2"
            style={{ fontSize: 11, color: "var(--color-text-secondary)" }}
          >
            {item.author && <span>{item.author}</span>}
            {item.domain && <span>{item.domain}</span>}
            {item.wordCount > 0 && (
              <span>{item.wordCount.toLocaleString()} words</span>
            )}
            {!item.contentAvailable && <span>No content</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

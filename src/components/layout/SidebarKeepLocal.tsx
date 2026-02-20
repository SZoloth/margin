import type { KeepLocalItem } from "@/types/keep-local";

interface SidebarKeepLocalProps {
  items: KeepLocalItem[];
  isOnline: boolean;
  isLoading: boolean;
  query: string;
  onSearch: (q: string) => void;
  onSelectItem: (item: KeepLocalItem) => void;
}

export function SidebarKeepLocal({
  items,
  isOnline,
  isLoading,
  query,
  onSearch,
  onSelectItem,
}: SidebarKeepLocalProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: isOnline ? "#22c55e" : "#ef4444",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "0.02em",
          }}
        >
          keep-local
        </span>
      </div>

      {/* Search */}
      {isOnline && (
        <div style={{ padding: "8px 12px" }}>
          <input
            type="text"
            placeholder="Search articles..."
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              backgroundColor: "transparent",
              color: "var(--color-text-primary)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!isOnline && (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              color: "var(--color-text-secondary)",
              fontSize: 13,
            }}
          >
            Server offline
          </div>
        )}

        {isOnline && isLoading && (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              color: "var(--color-text-secondary)",
              fontSize: 13,
            }}
          >
            Loading...
          </div>
        )}

        {isOnline && !isLoading && items.length === 0 && (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              color: "var(--color-text-secondary)",
              fontSize: 13,
            }}
          >
            No articles found
          </div>
        )}

        {isOnline &&
          !isLoading &&
          items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectItem(item)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                border: "none",
                borderBottom: "1px solid var(--color-border)",
                backgroundColor: "transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "background-color 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--color-sidebar, rgba(128,128,128,0.1))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 2,
                }}
              >
                {item.title || "Untitled"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                  display: "flex",
                  gap: 8,
                }}
              >
                {item.author && <span>{item.author}</span>}
                {item.domain && <span>{item.domain}</span>}
                {item.wordCount > 0 && (
                  <span>{item.wordCount.toLocaleString()} words</span>
                )}
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}

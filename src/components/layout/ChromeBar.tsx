import { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Add01Icon } from "@hugeicons/core-free-icons";
import type { Tab } from "@/types/tab";

interface ChromeBarProps {
  isVisible: boolean;
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
  onNewTab: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function ChromeBar({
  isVisible,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  onNewTab,
  onMouseEnter,
  onMouseLeave,
}: ChromeBarProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      onReorderTabs(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex, onReorderTabs]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (activeIndex === -1) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = tabs[(activeIndex + 1) % tabs.length];
      if (next) onSelectTab(next.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = tabs[(activeIndex - 1 + tabs.length) % tabs.length];
      if (prev) onSelectTab(prev.id);
    }
  }, [tabs, activeTabId, onSelectTab]);

  return (
    <div
      style={{
        maxHeight: isVisible ? 70 : 0,
        overflow: "hidden",
        flexShrink: 0,
        transition: isVisible
          ? "max-height 200ms var(--ease-entrance)"
          : "max-height 150ms var(--ease-exit)",
        backgroundColor: "var(--color-sidebar)",
        borderBottom: isVisible ? "1px solid var(--color-border)" : "none",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Titlebar row — 28px — contains traffic lights (macOS) and drag region */}
      <div
        data-tauri-drag-region
        style={{
          height: 28,
          paddingLeft: 80,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-secondary)",
            fontFamily: "'Instrument Sans', system-ui, sans-serif",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          Margin
        </span>
      </div>

      {/* Tab row — 42px */}
      <div
        data-tauri-drag-region
        style={{
          height: 42,
          display: "flex",
          alignItems: "center",
          paddingLeft: 12,
          paddingRight: 12,
          gap: 4,
        }}
      >
        {tabs.length <= 1 ? (
          // Single-tab: pill label + + button
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 12px",
                height: 28,
                borderRadius: 6,
                backgroundColor: "rgba(0,0,0,0.06)",
                color: "var(--color-text-primary)",
                fontSize: "var(--text-base)",
                fontWeight: 500,
                fontFamily: "'Instrument Sans', system-ui, sans-serif",
                maxWidth: 220,
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeTab?.title ?? "New Tab"}
              </span>
              {activeTab?.isDirty && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    backgroundColor: "var(--color-text-secondary)",
                    flexShrink: 0,
                  }}
                />
              )}
            </div>

            <button
              type="button"
              onClick={onNewTab}
              aria-label="Open file in new tab"
              title="Open file (⌘O)"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                border: "1px solid var(--color-border)",
                backgroundColor: "transparent",
                color: "var(--color-text-secondary)",
                borderRadius: 6,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <HugeiconsIcon icon={Add01Icon} size={13} color="currentColor" strokeWidth={2} />
            </button>
          </>
        ) : (
          // Multi-tab: inline tabs + + button
          <>
            <div
              role="tablist"
              aria-label="Open documents"
              style={{
                display: "flex",
                alignItems: "stretch",
                minWidth: 0,
                overflow: "hidden",
                gap: 2,
              }}
            >
              {tabs.map((tab, index) => {
                const isActive = tab.id === activeTabId;
                const isDragging = index === dragIndex;
                const isDropTarget = index === dropIndex && dragIndex !== null && dropIndex !== dragIndex;
                return (
                  <div
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => onSelectTab(tab.id)}
                    onKeyDown={handleTabKeyDown}
                    onAuxClick={(e) => {
                      if (e.button === 1) { e.preventDefault(); onCloseTab(tab.id); }
                    }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "0 10px",
                      height: 30,
                      borderRadius: 5,
                      maxWidth: 160,
                      minWidth: 0,
                      cursor: "pointer",
                      color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      fontSize: "var(--text-base)",
                      fontWeight: 500,
                      fontFamily: "'Instrument Sans', system-ui, sans-serif",
                      backgroundColor: isActive ? "rgba(0,0,0,0.07)" : "transparent",
                      border: isActive ? "1px solid var(--color-border)" : "1px solid transparent",
                      opacity: isDragging ? 0.4 : 1,
                      borderLeft: isDropTarget ? "2px solid var(--color-text-secondary)" : undefined,
                      transition: "background-color 120ms ease, color 120ms ease",
                      flexShrink: 0,
                    }}
                    className="chrome-tab-item"
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {tab.title ?? "Untitled"}
                    </span>
                    {tab.isDirty && (
                      <span
                        className="chrome-tab-dirty"
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          backgroundColor: "var(--color-text-secondary)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <button
                      type="button"
                      className="chrome-tab-close"
                      tabIndex={-1}
                      onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                      aria-label={`Close ${tab.title}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 18,
                        height: 18,
                        border: "none",
                        background: "none",
                        color: "var(--color-text-secondary)",
                        borderRadius: 4,
                        cursor: "pointer",
                        flexShrink: 0,
                        opacity: 0,
                        transition: "opacity 120ms ease",
                        padding: 0,
                      }}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={11} color="currentColor" strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onNewTab}
              aria-label="Open file in new tab"
              title="Open file (⌘O)"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                border: "1px solid var(--color-border)",
                backgroundColor: "transparent",
                color: "var(--color-text-secondary)",
                borderRadius: 6,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <HugeiconsIcon icon={Add01Icon} size={13} color="currentColor" strokeWidth={2} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Add01Icon } from "@hugeicons/core-free-icons";
import type { Tab } from "@/types/tab";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
  onNewTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  onNewTab,
}: TabBarProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Required for Firefox
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = tabs[0];
      if (first) onSelectTab(first.id);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = tabs[tabs.length - 1];
      if (last) onSelectTab(last.id);
    }
  }, [tabs, activeTabId, onSelectTab]);

  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar" ref={scrollRef}>
      <div className="tab-bar-inner" role="tablist" aria-label="Open documents">
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
              className={`tab-item${isActive ? " tab-active" : ""}${isDragging ? " tab-dragging" : ""}${isDropTarget ? " tab-drop-target" : ""}`}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={handleKeyDown}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <span className="tab-title">{tab.title || "Untitled"}</span>
              {tab.isDirty && (
                <span className="tab-dirty" title="Unsaved changes" role="status" aria-label="Unsaved changes" />
              )}
              <button
                type="button"
                className="tab-close"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                aria-label={`Close ${tab.title}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} color="currentColor" strokeWidth={2} />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="tab-new"
          onClick={onNewTab}
          aria-label="Open file in new tab"
          title="Open file (⌘O)"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} color="currentColor" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import type { Document } from "@/types/document";
import type { Tab } from "@/types/tab";

interface PaletteAction {
  id: string;
  label: string;
  sublabel?: string;
  group: "tabs" | "recent" | "actions";
  onSelect: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: Tab[];
  activeTabId: string | null;
  recentDocs: Document[];
  onSelectTab: (id: string) => void;
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document) => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  tabs,
  activeTabId,
  recentDocs,
  onSelectTab,
  onOpenFile,
  onSelectRecentDoc,
  onOpenSettings,
  onToggleSidebar,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const buildActions = useCallback((): PaletteAction[] => {
    const actions: PaletteAction[] = [];

    // Tabs (other than active)
    for (const tab of tabs) {
      if (tab.id === activeTabId) continue;
      actions.push({
        id: `tab:${tab.id}`,
        label: tab.title || "Untitled",
        sublabel: "Switch tab",
        group: "tabs",
        onSelect: () => { onSelectTab(tab.id); onClose(); },
      });
    }

    // Recent docs not already open
    const openDocIds = new Set(tabs.map((t) => t.documentId).filter(Boolean));
    for (const doc of recentDocs.slice(0, 8)) {
      if (openDocIds.has(doc.id)) continue;
      actions.push({
        id: `doc:${doc.id}`,
        label: doc.title || "Untitled",
        sublabel: doc.file_path?.split("/").pop() ?? "Recent",
        group: "recent",
        onSelect: () => { onSelectRecentDoc(doc); onClose(); },
      });
    }

    // Fixed actions
    actions.push(
      {
        id: "open-file",
        label: "Open file…",
        sublabel: "⌘O",
        group: "actions",
        onSelect: () => { onOpenFile(); onClose(); },
      },
      {
        id: "toggle-sidebar",
        label: "Toggle sidebar",
        sublabel: "⌘\\",
        group: "actions",
        onSelect: () => { onToggleSidebar(); onClose(); },
      },
      {
        id: "settings",
        label: "Open settings",
        sublabel: "⌘,",
        group: "actions",
        onSelect: () => { onOpenSettings(); onClose(); },
      },
    );

    return actions;
  }, [tabs, activeTabId, recentDocs, onSelectTab, onOpenFile, onSelectRecentDoc, onOpenSettings, onToggleSidebar, onClose]);

  const filtered = buildActions().filter((a) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return a.label.toLowerCase().includes(q) || (a.sublabel ?? "").toLowerCase().includes(q);
  });

  // Clamp active index when list changes
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[activeIndex]?.onSelect();
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [filtered, activeIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="cmd-palette-backdrop"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      <div
        className="cmd-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmd-palette-input-row">
          <input
            ref={inputRef}
            className="cmd-palette-input"
            placeholder="Search tabs, docs, actions…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="cmd-palette-list" role="listbox">
          {filtered.length === 0 && (
            <div className="cmd-palette-empty">No results</div>
          )}
          {filtered.map((action, i) => (
            <button
              key={action.id}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={`cmd-palette-item${i === activeIndex ? " cmd-palette-item-active" : ""}`}
              onClick={action.onSelect}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="cmd-palette-item-label">{action.label}</span>
              {action.sublabel && (
                <span className="cmd-palette-item-sublabel">{action.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

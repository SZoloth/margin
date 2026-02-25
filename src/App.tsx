import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import type { Editor } from "@tiptap/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AppShell } from "@/components/layout/AppShell";

const Reader = lazy(() => import("@/components/editor/Reader"));
import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import { HighlightThread } from "@/components/editor/HighlightThread";
import { ExportAnnotationsPopover } from "@/components/editor/ExportAnnotationsPopover";
import { useDocument } from "@/hooks/useDocument";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useKeepLocal } from "@/hooks/useKeepLocal";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { useSearch } from "@/hooks/useSearch";
import { useTabs } from "@/hooks/useTabs";
import { useTableOfContents } from "@/hooks/useTableOfContents";
import { useSettings } from "@/hooks/useSettings";
import { SettingsModal } from "@/components/layout/SettingsModal";
import { TableOfContents } from "@/components/layout/TableOfContents";
import type { SnapshotData } from "@/hooks/useTabs";
import { createAnchor } from "@/lib/text-anchoring";
import { formatAnnotationsMarkdown, getExtendedContext } from "@/lib/export-annotations";
import { readFile, drainPendingOpenFiles } from "@/lib/tauri-commands";
import { listen } from "@tauri-apps/api/event";

import type { KeepLocalItem } from "@/types/keep-local";
import type { Document } from "@/types/document";
import type { CorrectionInput } from "@/types/annotations";
import type { ExportResult } from "@/types/export";
import { UndoToast } from "@/components/ui/UndoToast";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { MarginIndicators } from "@/components/editor/MarginIndicators";
import type { UndoAction } from "@/components/ui/UndoToast";

/**
 * Walk a ProseMirror doc tree and find the TipTap positions for a text substring.
 * Unlike flat-string indexOf, this accounts for block node boundaries that add
 * positional offsets not present in the text content.
 */
function findTextInDoc(
  doc: import("@tiptap/pm/model").Node,
  search: string,
): { from: number; to: number } | null {
  // Collect text segments with their TipTap start positions
  const segments: Array<{ text: string; pos: number }> = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      segments.push({ text: node.text, pos });
    }
  });

  if (segments.length === 0) return null;

  // Build a flat string and a mapping from flat offset → TipTap position
  let flat = "";
  const offsetToPos: Array<{ flatStart: number; tiptapStart: number; length: number }> = [];
  for (const seg of segments) {
    offsetToPos.push({ flatStart: flat.length, tiptapStart: seg.pos, length: seg.text.length });
    flat += seg.text;
  }

  const idx = flat.indexOf(search);
  if (idx === -1) return null;

  const fromFlat = idx;
  const toFlat = idx + search.length;

  // Convert flat offsets to TipTap positions
  let from = -1;
  let to = -1;
  for (const map of offsetToPos) {
    const segEnd = map.flatStart + map.length;
    if (from === -1 && fromFlat >= map.flatStart && fromFlat < segEnd) {
      from = map.tiptapStart + (fromFlat - map.flatStart);
    }
    if (toFlat >= map.flatStart && toFlat <= segEnd) {
      to = map.tiptapStart + (toFlat - map.flatStart);
      break;
    }
  }

  if (from === -1 || to === -1) return null;
  return { from, to };
}

export default function App() {
  const { settings, setSetting } = useSettings();
  const doc = useDocument(settings.autosave);
  const annotations = useAnnotations(doc.refreshRecentDocs);
  const keepLocal = useKeepLocal();
  const search = useSearch();
  const [editor, setEditor] = useState<Editor | null>(null);
  const toc = useTableOfContents(editor, doc.currentDoc?.id);
  const [showSettings, setShowSettings] = useState(false);
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [focusHighlightId, setFocusHighlightId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [autoFocusNew, setAutoFocusNew] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const undoIdRef = useRef(0);
  const highlightThread = useAnimatedPresence(!!focusHighlightId, 200);
  const lastHighlightRef = useRef<{ highlight: import("@/types/annotations").Highlight; notes: import("@/types/annotations").MarginNote[]; anchorRect: DOMRect | null } | null>(null);

  // Keep last valid highlight data for exit animation
  if (focusHighlightId && annotations.isLoaded) {
    const highlight = annotations.highlights.find((h) => h.id === focusHighlightId);
    if (highlight) {
      const notes = annotations.marginNotes.filter((n) => n.highlight_id === focusHighlightId);
      lastHighlightRef.current = { highlight, notes, anchorRect };
    }
  }

  // Snapshot function for useTabs — captures current active tab state
  const snapshotFn = useCallback((): SnapshotData => {
    const scrollContainer = document.querySelector("[data-scroll-container]");
    return {
      document: doc.currentDoc,
      content: doc.content,
      filePath: doc.filePath,
      isDirty: doc.isDirty,
      highlights: annotations.highlights,
      marginNotes: annotations.marginNotes,
      annotationsLoaded: annotations.isLoaded,
      scrollPosition: scrollContainer?.scrollTop ?? 0,
    };
  }, [doc.currentDoc, doc.content, doc.filePath, doc.isDirty, annotations.highlights, annotations.marginNotes, annotations.isLoaded]);

  const tabsHook = useTabs(snapshotFn);
  const unsavedDialog = useAnimatedPresence(!!tabsHook.pendingCloseTabId, 200);

  // Listen for Cmd+O from useTabs keyboard shortcut
  useEffect(() => {
    const handler = () => { void doc.openFile(); };
    window.addEventListener("margin:open-file-for-tab", handler);
    return () => window.removeEventListener("margin:open-file-for-tab", handler);
  }, [doc.openFile]);

  // Track whether next doc open should create a new tab vs replace active
  const openAsNewTabRef = useRef(true);

  // When a document is opened via useDocument, register it as a tab
  const prevDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!doc.currentDoc || doc.currentDoc.id === prevDocIdRef.current) return;
    // Don't open tabs until tab system is ready (to avoid duplication during restore)
    if (!tabsHook.isReady) return;
    prevDocIdRef.current = doc.currentDoc.id;
    if (openAsNewTabRef.current) {
      tabsHook.openTab(doc.currentDoc, doc.content, doc.filePath);
    } else {
      tabsHook.openInActiveTab(doc.currentDoc, doc.content, doc.filePath);
    }
    // Reset to default (new tab) after each use
    openAsNewTabRef.current = true;
  }, [doc.currentDoc?.id, tabsHook.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // When activeTabId changes, restore the cached tab state
  const prevActiveTabIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tabsHook.activeTabId || tabsHook.activeTabId === prevActiveTabIdRef.current) return;
    prevActiveTabIdRef.current = tabsHook.activeTabId;

    const cache = tabsHook.getCachedTab(tabsHook.activeTabId);

    if (!cache) {
      // Tab was restored from persistence but never loaded (no cache).
      // Find the document and load it from disk.
      const tab = tabsHook.tabs.find((t) => t.id === tabsHook.activeTabId);
      if (tab?.documentId) {
        const recentDoc = doc.recentDocs.find((d) => d.id === tab.documentId);
        if (recentDoc) {
          // Pre-set so the doc-change effect doesn't create a duplicate tab
          prevDocIdRef.current = recentDoc.id;
          openAsNewTabRef.current = false;
          if (recentDoc.source === "file" && recentDoc.file_path) {
            void doc.openRecentDocument(recentDoc);
          } else if (recentDoc.source === "keep-local" && recentDoc.keep_local_id) {
            void keepLocal.getContent(recentDoc.keep_local_id).then((markdown) => {
              void doc.openKeepLocalArticle(recentDoc, markdown);
            }).catch(console.error);
          }
        }
      }
      // Close any open highlight thread
      setFocusHighlightId(null);
      setAnchorRect(null);
      setAutoFocusNew(false);
      return;
    }

    // Pre-set prevDocIdRef so the doc-change effect doesn't re-register this as a new tab
    if (cache.document) {
      prevDocIdRef.current = cache.document.id;
    }

    doc.restoreFromCache(cache.document, cache.content, cache.filePath, false);

    if (cache.annotationsLoaded) {
      annotations.restoreFromCache(cache.highlights, cache.marginNotes);
    }

    // Reset highlight mark restoration so marks re-apply for new doc
    lastRestoredDocId.current = null;

    // Restore scroll position after content renders
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector("[data-scroll-container]");
      if (scrollContainer && cache.scrollPosition) {
        scrollContainer.scrollTop = cache.scrollPosition;
      }
    });

    // Close any open highlight thread
    setFocusHighlightId(null);
    setAnchorRect(null);
    setAutoFocusNew(false);
  }, [tabsHook.activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync dirty state to tab — only if the current doc matches the active tab
  useEffect(() => {
    const activeTab = tabsHook.tabs.find((t) => t.id === tabsHook.activeTabId);
    if (activeTab && doc.currentDoc && activeTab.documentId === doc.currentDoc.id) {
      tabsHook.updateActiveTabDirty(doc.isDirty);
    }
  }, [doc.isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync title to tab — only if the current doc matches the active tab
  useEffect(() => {
    if (!doc.currentDoc?.title) return;
    const activeTab = tabsHook.tabs.find((t) => t.id === tabsHook.activeTabId);
    if (activeTab && activeTab.documentId === doc.currentDoc.id) {
      tabsHook.updateActiveTabTitle(doc.currentDoc.title);
    }
  }, [doc.currentDoc?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // When no active tab but tabs restored, load the active tab's content from disk
  useEffect(() => {
    if (!tabsHook.isReady || tabsHook.tabs.length === 0) return;
    if (doc.currentDoc) return; // Already have content loaded

    const activeTab = tabsHook.tabs.find((t) => t.id === tabsHook.activeTabId);
    if (!activeTab) return;

    const cache = tabsHook.getCachedTab(activeTab.id);
    if (cache?.document) {
      // Pre-set prevDocIdRef so the doc-change effect doesn't create a duplicate tab
      prevDocIdRef.current = cache.document.id;

      if (cache.document.source === "file" && cache.document.file_path) {
        void doc.openRecentDocument(cache.document);
      } else if (cache.document.source === "keep-local" && cache.document.keep_local_id) {
        void keepLocal.getContent(cache.document.keep_local_id).then((markdown) => {
          void doc.openKeepLocalArticle(cache.document!, markdown);
        }).catch(console.error);
      }
    }
  }, [tabsHook.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load annotations when document changes
  useEffect(() => {
    if (doc.currentDoc) {
      void annotations.loadAnnotations(doc.currentDoc.id);
    }
  }, [doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Index document for search when opened
  useEffect(() => {
    if (doc.currentDoc && doc.content) {
      void search.indexDocument(
        doc.currentDoc.id,
        doc.currentDoc.title ?? "Untitled",
        doc.content
      );
    }
  }, [doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs to avoid stale closures in callbacks
  const currentDocRef = useRef(doc.currentDoc);
  currentDocRef.current = doc.currentDoc;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const highlightsRef = useRef(annotations.highlights);
  highlightsRef.current = annotations.highlights;
  const marginNotesRef = useRef(annotations.marginNotes);
  marginNotesRef.current = annotations.marginNotes;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const persistCorrectionsRef = useRef(settings.persistCorrections);
  persistCorrectionsRef.current = settings.persistCorrections;
  const setContentExternalRef = useRef(doc.setContentExternal);
  setContentExternalRef.current = doc.setContentExternal;
  const isRestoringMarksRef = useRef(false);

  // Restore highlight marks in the editor when annotations load for a document.
  const lastRestoredDocId = useRef<string | null>(null);
  // Track docs where orphan recovery has already run to prevent duplicates on tab revisit
  const recoveredDocIds = useRef(new Set<string>());
  useEffect(() => {
    if (!editor || !annotations.isLoaded || !doc.currentDoc) return;
    if (lastRestoredDocId.current === doc.currentDoc.id) return;
    lastRestoredDocId.current = doc.currentDoc.id;

    // If DB has no highlights but the editor DOM has <mark> tags (from HTML baked
    // into the file), re-create DB records so clicks and notes work again.
    if (annotations.highlights.length === 0) {
      // Guard against re-entry on tab switch — only recover orphans once per doc
      if (recoveredDocIds.current.has(doc.currentDoc.id)) return;
      recoveredDocIds.current.add(doc.currentDoc.id);
      // Wait for DOM to render before checking for orphan marks
      requestAnimationFrame(() => {
        const domMarks = editor.view.dom.querySelectorAll("mark[data-color]");
        if (domMarks.length === 0) return;
        const recoverOrphans = async () => {
          const docId = doc.currentDoc!.id;
          const { state: s } = editor;
          const markT = s.schema.marks.highlight;
          if (!markT) return;
          const { tr: recoverTr } = s;
          const fullText = s.doc.textBetween(0, s.doc.content.size, "\n");

          for (const domMark of domMarks) {
            const el = domMark as HTMLElement;
            const text = el.textContent ?? "";
            if (!text) continue;
            const color = el.dataset.color ?? "yellow";

            let from: number;
            let to: number;
            try {
              from = editor.view.posAtDOM(el, 0);
              to = from + text.length;
            } catch {
              continue;
            }

            const prefix = fullText.substring(Math.max(0, from - 50), from);
            const suffix = fullText.substring(to, Math.min(fullText.length, to + 50));

            try {
              const highlight = await annotations.createHighlight({
                documentId: docId,
                color,
                textContent: text,
                fromPos: from,
                toPos: to,
                prefixContext: prefix,
                suffixContext: suffix,
              });
              // Stamp the mark with the new ID
              recoverTr.addMark(from, to, markT.create({ color, highlightId: highlight.id }));
            } catch (err) {
              console.error("Failed to recover orphan highlight:", err);
            }
          }

          if (recoverTr.steps.length > 0) {
            recoverTr.setMeta("addToHistory", false);
            isRestoringMarksRef.current = true;
            try {
              editor.view.dispatch(recoverTr);
            } finally {
              isRestoringMarksRef.current = false;
            }
          }
        };
        void recoverOrphans();
      });
      return;
    }

    const { state } = editor;
    const { tr } = state;
    const markType = state.schema.marks.highlight;
    if (!markType) return;

    for (const h of annotations.highlights) {
      try {
        const textAtPos = state.doc.textBetween(h.from_pos, h.to_pos, "\n");
        if (textAtPos === h.text_content) {
          tr.addMark(h.from_pos, h.to_pos, markType.create({ color: h.color, highlightId: h.id }));
          continue;
        }
      } catch {
        // Positions out of range
      }

      const found = findTextInDoc(state.doc, h.text_content);
      if (found) {
        try {
          tr.addMark(found.from, found.to, markType.create({ color: h.color, highlightId: h.id }));
        } catch {
          // Position out of range
        }
      }
    }

    if (tr.steps.length > 0) {
      tr.setMeta("addToHistory", false);
      isRestoringMarksRef.current = true;
      try {
        editor.view.dispatch(tr);
      } finally {
        isRestoringMarksRef.current = false;
      }

    }
  }, [editor, annotations.isLoaded, annotations.highlights, doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap onUpdate to suppress dirty state during mark restoration
  const handleEditorUpdate = useCallback((md: string) => {
    if (isRestoringMarksRef.current) return;
    doc.setContent(md);
  }, [doc.setContent]);

  const handleFileChanged = useCallback(async (path: string) => {
    const currentDoc = currentDocRef.current;
    if (!currentDoc || currentDoc.file_path !== path) return;
    try {
      const newContent = await readFile(path);
      setContentExternalRef.current(newContent);
    } catch (err) {
      console.error("Failed to reload file:", err);
    }
  }, []);

  useFileWatcher(doc.filePath, handleFileChanged);

  // Handle files opened via macOS "Open With" / double-click
  const openFilePathRef = useRef(doc.openFilePath);
  openFilePathRef.current = doc.openFilePath;

  useEffect(() => {
    drainPendingOpenFiles().then((paths) => {
      const lastPath = paths[paths.length - 1];
      if (lastPath) {
        void openFilePathRef.current(lastPath);
      }
    }).catch(console.error);

    const unlisten = listen<string>("open-file", (event) => {
      void openFilePathRef.current(event.payload);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  // Resolve a highlight from event detail: prefer ID, fall back to text-matching
  const resolveHighlight = useCallback((detail: { highlightId?: string; text?: string }) => {
    if (detail.highlightId) {
      return highlightsRef.current.find((h) => h.id === detail.highlightId) ?? null;
    }
    if (detail.text) {
      return highlightsRef.current.find((h) => h.text_content === detail.text) ?? null;
    }
    return null;
  }, []);

  // Handle highlight click → open thread popover
  useEffect(() => {
    const handleHighlightClick = (e: Event) => {
      const { element, highlightId, text } = (e as CustomEvent).detail;
      if (!element) return;
      const match = resolveHighlight({ highlightId, text });
      if (match) {
        setAnchorRect((element as HTMLElement).getBoundingClientRect());
        setFocusHighlightId(match.id);
        setAutoFocusNew(false);
      }
    };

    const handleHighlightDelete = async (e: Event) => {
      const { element, highlightId, text } = (e as CustomEvent).detail;
      if (!element || !editor) return;
      const el = element as HTMLElement;
      const match = resolveHighlight({ highlightId, text });
      if (!match) return;

      let markFrom: number;
      let markTo: number;
      try {
        markFrom = editor.view.posAtDOM(el, 0);
        markTo = markFrom + (el.textContent?.length ?? 0);
      } catch {
        markFrom = -1;
        markTo = -1;
      }

      await annotations.deleteHighlight(match.id);

      const { state } = editor;
      const { tr } = state;
      const markType = state.schema.marks.highlight;
      if (!markType) return;

      if (markFrom >= 0 && markTo >= 0) {
        tr.removeMark(markFrom, markTo, markType);
      } else {
        state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          const hlMark = node.marks.find(
            (m) => m.type.name === "highlight" && m.attrs.highlightId === match.id,
          );
          if (hlMark) {
            tr.removeMark(pos, pos + node.nodeSize, hlMark);
          }
        });
      }

      if (tr.steps.length > 0) {
        editor.view.dispatch(tr);
      }
    };

    window.addEventListener("margin:highlight-click", handleHighlightClick);
    window.addEventListener("margin:highlight-delete", handleHighlightDelete);
    return () => {
      window.removeEventListener("margin:highlight-click", handleHighlightClick);
      window.removeEventListener("margin:highlight-delete", handleHighlightDelete);
    };
  }, [editor, annotations, resolveHighlight]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    if (!editor) return;

    const highlight = annotations.highlights.find((h) => h.id === id);
    if (!highlight) return;

    // Delete immediately
    await annotations.deleteHighlight(id);

    setFocusHighlightId(null);
    setAnchorRect(null);

    // Remove mark from editor
    const { state } = editor;
    const { tr } = state;
    const markType = state.schema.marks.highlight;
    if (markType) {
      state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        const hlMark = node.marks.find(
          (m) => m.type.name === "highlight" && m.attrs.highlightId === id,
        );
        if (hlMark) {
          tr.removeMark(pos, pos + node.nodeSize, hlMark);
        }
      });
      if (tr.steps.length > 0) {
        editor.view.dispatch(tr);
      }
    }

    // Show undo toast
    const actionId = String(++undoIdRef.current);
    setUndoAction({
      id: actionId,
      message: "Highlight deleted",
      onUndo: async () => {
        // Re-create the highlight — use refs to avoid stale closures
        try {
          const currentEditor = editorRef.current;
          const restored = await annotationsRef.current.createHighlight({
            documentId: highlight.document_id,
            color: highlight.color,
            textContent: highlight.text_content,
            fromPos: highlight.from_pos,
            toPos: highlight.to_pos,
            prefixContext: highlight.prefix_context,
            suffixContext: highlight.suffix_context,
          });
          // Re-apply mark in editor
          if (currentEditor) {
            const restoreMarkType = currentEditor.state.schema.marks.highlight;
            if (restoreMarkType) {
              const restoreTr = currentEditor.state.tr;
              restoreTr.addMark(
                highlight.from_pos,
                highlight.to_pos,
                restoreMarkType.create({ color: highlight.color, highlightId: restored.id }),
              );
              currentEditor.view.dispatch(restoreTr);
            }
          }
          // Re-open the thread
          setFocusHighlightId(restored.id);
        } catch (err) {
          console.error("Failed to undo highlight delete:", err);
        }
        setUndoAction(null);
      },
      onCommit: () => setUndoAction(null),
    });
  }, [editor, annotations]);

  const handleEditorReady = useCallback((ed: Editor) => {
    setEditor(ed);
  }, []);

  const handleHighlight = useCallback(
    async (color?: string) => {
      const resolvedColor = color ?? settings.defaultHighlightColor;
      if (!editor || !doc.currentDoc) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;

      const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
      const selectedText = editor.state.doc.textBetween(from, to, "\n");
      const anchor = createAnchor(fullText, from, to);

      try {
        const highlight = await annotations.createHighlight({
          documentId: doc.currentDoc.id,
          color: resolvedColor,
          textContent: selectedText,
          fromPos: from,
          toPos: to,
          prefixContext: anchor.prefix,
          suffixContext: anchor.suffix,
        });

        const markType = editor.state.schema.marks.highlight;
        if (markType) {
          const tr = editor.state.tr.addMark(
            from, to,
            markType.create({ color: resolvedColor, highlightId: highlight.id }),
          );
          tr.setMeta("addToHistory", false);
          editor.view.dispatch(tr);
        }
      } catch (err) {
        console.error("Failed to save highlight:", err, "documentId:", doc.currentDoc.id);
      }
    },
    [editor, doc.currentDoc, annotations, settings.defaultHighlightColor],
  );

  const handleNote = useCallback(async () => {
    if (!editor || !doc.currentDoc) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    const anchor = createAnchor(fullText, from, to);

    try {
      const highlight = await annotations.createHighlight({
        documentId: doc.currentDoc.id,
        color: settings.defaultHighlightColor,
        textContent: selectedText,
        fromPos: from,
        toPos: to,
        prefixContext: anchor.prefix,
        suffixContext: anchor.suffix,
      });

      const markType = editor.state.schema.marks.highlight;
      if (markType) {
        const tr = editor.state.tr.addMark(
          from, to,
          markType.create({ color: settings.defaultHighlightColor, highlightId: highlight.id }),
        );
        tr.setMeta("addToHistory", false);
        editor.view.dispatch(tr);
      }

      requestAnimationFrame(() => {
        const mark = editor.view.dom.querySelector(
          `mark[data-highlight-id="${highlight.id}"]`,
        );
        if (mark) {
          setAnchorRect(mark.getBoundingClientRect());
        }
        setFocusHighlightId(highlight.id);
        setAutoFocusNew(true);
      });
    } catch (err) {
      console.error("Failed to save highlight for note:", err);
    }
  }, [editor, doc.currentDoc, annotations]);

  // Export annotations: Cmd+Shift+E
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "e") {
        e.preventDefault();
        if (doc.currentDoc && annotations.isLoaded) {
          setShowExportPopover(true);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doc.currentDoc, annotations.isLoaded]);

  const handleExportAnnotations = useCallback(
    async (): Promise<ExportResult> => {
      if (!editor || !doc.currentDoc) {
        return { highlightCount: 0, noteCount: 0, snippets: [], correctionsSaved: false, correctionsFile: "" };
      }

      const highlights = highlightsRef.current;
      const marginNotes = marginNotesRef.current;
      const currentDoc = doc.currentDoc;

      const markdown = await formatAnnotationsMarkdown({
        document: currentDoc,
        editor,
        highlights,
        marginNotes,
      });

      await writeText(markdown);

      const snippets = highlights.slice(0, 3).map((h) =>
        h.text_content.length > 60 ? h.text_content.slice(0, 57) + "..." : h.text_content,
      );

      let correctionsSaved = false;
      let correctionsFile = "";

      if (persistCorrectionsRef.current && highlights.length > 0 && marginNotes.length > 0) {
        const notesByHighlight = new Map<string, string[]>();
        for (const note of marginNotes) {
          const existing = notesByHighlight.get(note.highlight_id) ?? [];
          existing.push(note.content);
          notesByHighlight.set(note.highlight_id, existing);
        }

        const correctionInputs: CorrectionInput[] = [];
        for (const h of highlights) {
          const notes = notesByHighlight.get(h.id);
          if (!notes || notes.length === 0) continue;

          correctionInputs.push({
            highlight_id: h.id,
            original_text: h.text_content,
            prefix_context: h.prefix_context,
            suffix_context: h.suffix_context,
            extended_context: getExtendedContext(editor, h.from_pos, h.to_pos),
            notes,
            highlight_color: h.color,
          });
        }

        if (correctionInputs.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          correctionsFile = `corrections-${today}.jsonl`;
          const { persistCorrections } = await import("@/lib/tauri-commands");
          try {
            await persistCorrections(
              correctionInputs,
              currentDoc.id,
              currentDoc.title ?? null,
              currentDoc.source,
              currentDoc.file_path ?? null,
              today,
            );
            correctionsSaved = true;
          } catch (err) {
            console.error("Failed to persist corrections:", err);
          }
        }
      }

      return {
        highlightCount: highlights.length,
        noteCount: marginNotes.length,
        snippets,
        correctionsSaved,
        correctionsFile,
      };
    },
    [editor, doc.currentDoc],
  );

  // Open a recent document from the sidebar (now goes through tabs)
  const handleSelectRecentDoc = useCallback(
    async (recentDoc: Document, newTab: boolean) => {
      openAsNewTabRef.current = newTab;

      // If already the current doc, just let the tab system handle dedup
      if (doc.currentDoc?.id === recentDoc.id) {
        // Still route through tabs for dedup/focus behavior
        if (newTab) {
          tabsHook.openTab(recentDoc, doc.content, doc.filePath);
        } else {
          tabsHook.openInActiveTab(recentDoc, doc.content, doc.filePath);
        }
        return;
      }

      // Snapshot current tab BEFORE changing the document —
      // after openRecentDocument, live state will reflect the new doc
      tabsHook.snapshotActive();

      if (recentDoc.source === "file") {
        await doc.openRecentDocument(recentDoc);
      } else if (recentDoc.source === "keep-local" && recentDoc.keep_local_id) {
        try {
          const markdown = await keepLocal.getContent(recentDoc.keep_local_id);
          await doc.openKeepLocalArticle(recentDoc, markdown);
        } catch (err) {
          console.error("Failed to reopen keep-local article:", err);
        }
      }
    },
    [doc, keepLocal, tabsHook]
  );

  // Open a keep-local article
  const handleSelectKeepLocalItem = useCallback(
    async (item: KeepLocalItem, newTab: boolean) => {
      openAsNewTabRef.current = newTab;
      tabsHook.snapshotActive();
      try {
        const markdown = await keepLocal.getContent(item.id);
        const now = Date.now();

        const docRecord: Document = {
          id: crypto.randomUUID(),
          source: "keep-local",
          file_path: null,
          keep_local_id: item.id,
          title: item.title ?? "Untitled",
          author: item.author ?? null,
          url: item.url,
          word_count: item.wordCount,
          last_opened_at: now,
          created_at: now,
        };

        await doc.openKeepLocalArticle(docRecord, markdown);
        if (doc.currentDoc) {
          void search.indexDocument(doc.currentDoc.id, doc.currentDoc.title ?? "Untitled", markdown);
        }
      } catch (err) {
        console.error("Failed to open keep-local article:", err);
      }
    },
    [keepLocal, doc, search]
  );

  return (
    <AppShell
      onOpenSettings={() => setShowSettings(true)}
      currentDoc={doc.currentDoc}
      recentDocs={doc.recentDocs}
      onOpenFile={doc.openFile}
      onSelectRecentDoc={handleSelectRecentDoc}
      isDirty={doc.isDirty}
      keepLocal={keepLocal}
      onSelectKeepLocalItem={handleSelectKeepLocalItem}
      search={search}
      hasAnnotations={annotations.isLoaded && annotations.highlights.length > 0}
      onExport={() => setShowExportPopover(true)}
      onOpenFilePath={(path: string, newTab: boolean) => {
        openAsNewTabRef.current = newTab;
        tabsHook.snapshotActive();
        void doc.openFilePath(path);
      }}
      onRenameFile={async (targetDoc, newName) => {
        try {
          await doc.renameDocFile(targetDoc, newName);
        } catch (err) {
          // Error already logged in the hook
        }
      }}
      tabs={tabsHook.tabs}
      activeTabId={tabsHook.activeTabId}
      onSelectTab={tabsHook.switchTab}
      onCloseTab={tabsHook.closeTab}
      onReorderTabs={tabsHook.reorderTabs}
      onNewTab={doc.openFile}
      tocElement={
        doc.currentDoc && toc.headings.length > 0 ? (
          <TableOfContents
            headings={toc.headings}
            activeHeadingId={toc.activeHeadingId}
            onScrollToHeading={toc.scrollToHeading}
          />
        ) : undefined
      }
      marginIndicators={
        editor && annotations.isLoaded ? (
          <MarginIndicators
            editor={editor}
            highlights={annotations.highlights}
            marginNotes={annotations.marginNotes}
            onClickHighlight={(highlightId, rect) => {
              setFocusHighlightId(highlightId);
              setAnchorRect(rect);
              setAutoFocusNew(false);
            }}
          />
        ) : undefined
      }
    >
      <Suspense fallback={<div className="reader-content" style={{ opacity: 0.3 }} />}>
        <Reader
          content={doc.content}
          onUpdate={handleEditorUpdate}
          isLoading={doc.isLoading}
          onEditorReady={handleEditorReady}
        />
      </Suspense>

      <FloatingToolbar
        editor={editor}
        onHighlight={handleHighlight}
        onNote={handleNote}
        defaultColor={settings.defaultHighlightColor}
      />

      {highlightThread.isMounted && lastHighlightRef.current && (() => {
        const { highlight, notes, anchorRect: rect } = lastHighlightRef.current;
        return (
          <HighlightThread
            highlight={highlight}
            notes={notes}
            onAddNote={(...args) => { const p = annotations.createMarginNote(...args); doc.triggerAutosave(); return p; }}
            onUpdateNote={(...args) => { const p = annotations.updateMarginNote(...args); doc.triggerAutosave(); return p; }}
            onDeleteNote={(...args) => { const p = annotations.deleteMarginNote(...args); doc.triggerAutosave(); return p; }}
            onDeleteHighlight={handleDeleteHighlight}
            onClose={() => {
              setFocusHighlightId(null);
              setAnchorRect(null);
              setAutoFocusNew(false);
            }}
            anchorRect={rect}
            autoFocusNew={autoFocusNew}
            isVisible={highlightThread.isVisible}
          />
        );
      })()}

      <ExportAnnotationsPopover
        isOpen={showExportPopover}
        onExport={handleExportAnnotations}
        onClose={() => setShowExportPopover(false)}
        persistCorrections={settings.persistCorrections}
        onOpenSettings={() => setShowSettings(true)}
      />

      <UndoToast action={undoAction} />

      {/* Unsaved changes dialog */}
      {unsavedDialog.isMounted && (() => {
        const tab = tabsHook.tabs.find((t) => t.id === tabsHook.pendingCloseTabId);
        if (!tab) return null;
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              onClick={tabsHook.cancelCloseTab}
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                opacity: unsavedDialog.isVisible ? 1 : 0,
                transition: `opacity ${unsavedDialog.isVisible ? "200ms var(--ease-entrance)" : "150ms var(--ease-exit)"}`,
              }}
            />
            <div
              role="dialog"
              aria-label="Unsaved changes"
              style={{
                position: "relative",
                backgroundColor: "var(--color-page)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "20px 24px",
                minWidth: "min(340px, calc(100vw - 32px))",
                maxWidth: "min(400px, calc(100vw - 32px))",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                opacity: unsavedDialog.isVisible ? 1 : 0,
                transform: unsavedDialog.isVisible ? "scale(1) translateY(0)" : "scale(0.97) translateY(4px)",
                transition: unsavedDialog.isVisible
                  ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
                  : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
              }}
            >
              <button
                onClick={tabsHook.cancelCloseTab}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "2px 6px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                ×
              </button>
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    marginBottom: 6,
                  }}
                >
                  Unsaved changes
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  "{tab.title}" has unsaved changes.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => tabsHook.forceCloseTab(tabsHook.pendingCloseTabId!)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    background: "none",
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Close without saving
                </button>
                <button
                  onClick={async () => {
                    await doc.saveCurrentFile();
                    tabsHook.forceCloseTab(tabsHook.pendingCloseTabId!);
                  }}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Save and close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        setSetting={setSetting}
      />
    </AppShell>
  );
}

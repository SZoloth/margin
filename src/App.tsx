import { useState, useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AppShell } from "@/components/layout/AppShell";
import { Reader } from "@/components/editor/Reader";
import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import { HighlightThread } from "@/components/editor/HighlightThread";
import { ExportAnnotationsPopover } from "@/components/editor/ExportAnnotationsPopover";
import { useDocument } from "@/hooks/useDocument";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useKeepLocal } from "@/hooks/useKeepLocal";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { useSearch } from "@/hooks/useSearch";
import { createAnchor } from "@/lib/text-anchoring";
import { formatAnnotationsMarkdown, getExtendedContext } from "@/lib/export-annotations";
import { readFile, drainPendingOpenFiles, persistCorrections } from "@/lib/tauri-commands";
import { listen } from "@tauri-apps/api/event";

import type { KeepLocalItem } from "@/types/keep-local";
import type { Document } from "@/types/document";
import type { CorrectionInput } from "@/types/annotations";

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
  const doc = useDocument();
  const annotations = useAnnotations();
  const keepLocal = useKeepLocal();
  const search = useSearch();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [focusHighlightId, setFocusHighlightId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [autoFocusNew, setAutoFocusNew] = useState(false);

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
  const highlightsRef = useRef(annotations.highlights);
  highlightsRef.current = annotations.highlights;
  const marginNotesRef = useRef(annotations.marginNotes);
  marginNotesRef.current = annotations.marginNotes;
  const setContentExternalRef = useRef(doc.setContentExternal);
  setContentExternalRef.current = doc.setContentExternal;
  const isRestoringMarksRef = useRef(false);

  // Restore highlight marks in the editor when annotations load for a document.
  // Marks are ephemeral TipTap state — they're lost when the editor content resets.
  // This re-applies them from the persisted annotation data.
  const lastRestoredDocId = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || !annotations.isLoaded || !doc.currentDoc) return;
    if (lastRestoredDocId.current === doc.currentDoc.id) return;
    lastRestoredDocId.current = doc.currentDoc.id;

    if (annotations.highlights.length === 0) return;

    const { state } = editor;
    const { tr } = state;
    const markType = state.schema.marks.highlight;
    if (!markType) return;

    for (const h of annotations.highlights) {
      // Try stored TipTap positions first — works when document hasn't changed
      try {
        const textAtPos = state.doc.textBetween(h.from_pos, h.to_pos, "\n");
        if (textAtPos === h.text_content) {
          tr.addMark(h.from_pos, h.to_pos, markType.create({ color: h.color }));
          continue;
        }
      } catch {
        // Positions out of range — document changed
      }

      // Fall back to doc-tree search for correct TipTap positions
      const found = findTextInDoc(state.doc, h.text_content);
      if (found) {
        try {
          tr.addMark(found.from, found.to, markType.create({ color: h.color }));
        } catch {
          // Position out of range — skip
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
    // Drain any files queued before the frontend was ready
    drainPendingOpenFiles().then((paths) => {
      const lastPath = paths[paths.length - 1];
      if (lastPath) {
        void openFilePathRef.current(lastPath);
      }
    }).catch(console.error);

    // Listen for files opened while the app is running
    const unlisten = listen<string>("open-file", (event) => {
      void openFilePathRef.current(event.payload);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  // Find the highlight record that matches a clicked mark element.
  // Matches by text content — stored positions may be stale after edits.
  const findHighlightAtElement = useCallback((element: HTMLElement) => {
    const text = element.textContent ?? "";
    return annotations.highlights.find((h) => h.text_content === text) ?? null;
  }, [annotations.highlights]);

  // Handle highlight click → open thread popover
  useEffect(() => {
    const handleHighlightClick = (e: Event) => {
      const { element } = (e as CustomEvent).detail;
      if (!element) return;
      const match = findHighlightAtElement(element as HTMLElement);
      if (match) {
        setAnchorRect((element as HTMLElement).getBoundingClientRect());
        setFocusHighlightId(match.id);
        setAutoFocusNew(false);
      }
    };

    const handleHighlightDelete = async (e: Event) => {
      const { element } = (e as CustomEvent).detail;
      if (!element || !editor) return;
      const el = element as HTMLElement;
      const match = findHighlightAtElement(el);
      if (!match) return;

      // Capture actual mark positions from DOM before async delete
      let markFrom: number;
      let markTo: number;
      try {
        markFrom = editor.view.posAtDOM(el, 0);
        markTo = markFrom + (el.textContent?.length ?? 0);
      } catch {
        // Element detached — fall back to doc tree walk
        markFrom = -1;
        markTo = -1;
      }

      await annotations.deleteHighlight(match.id);

      // Remove the mark from the editor
      const { state } = editor;
      const { tr } = state;
      const markType = state.schema.marks.highlight;
      if (!markType) return;

      if (markFrom >= 0 && markTo >= 0) {
        tr.removeMark(markFrom, markTo, markType);
      } else {
        // Fallback: walk doc tree to find the mark by text + color
        state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          const hlMark = node.marks.find(
            (m) => m.type.name === "highlight" && m.attrs.color === match.color,
          );
          if (hlMark && node.text === match.text_content) {
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
  }, [editor, annotations.highlights, findHighlightAtElement]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    if (!editor) return;

    const highlight = annotations.highlights.find((h) => h.id === id);
    await annotations.deleteHighlight(id);

    setFocusHighlightId(null);
    setAnchorRect(null);

    if (highlight) {
      // Walk doc tree to find and remove marks matching this highlight
      const { state } = editor;
      const { tr } = state;
      const markType = state.schema.marks.highlight;
      if (markType) {
        state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          const hlMark = node.marks.find(
            (m) => m.type.name === "highlight" && m.attrs.color === highlight.color,
          );
          if (hlMark && node.text === highlight.text_content) {
            tr.removeMark(pos, pos + node.nodeSize, hlMark);
          }
        });
        if (tr.steps.length > 0) {
          editor.view.dispatch(tr);
        }
      }
    }
  }, [editor, annotations]);

  const handleEditorReady = useCallback((ed: Editor) => {
    setEditor(ed);
  }, []);

  const handleHighlight = useCallback(
    async () => {
      if (!editor || !doc.currentDoc) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;

      const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
      const selectedText = editor.state.doc.textBetween(from, to, "\n");
      const anchor = createAnchor(fullText, from, to);

      editor.chain().focus().setHighlight({ color: "yellow" }).run();

      try {
        await annotations.createHighlight({
          documentId: doc.currentDoc.id,
          color: "yellow",
          textContent: selectedText,
          fromPos: from,
          toPos: to,
          prefixContext: anchor.prefix,
          suffixContext: anchor.suffix,
        });
      } catch (err) {
        console.error("Failed to save highlight:", err, "documentId:", doc.currentDoc.id);
      }
    },
    [editor, doc.currentDoc, annotations],
  );

  const handleNote = useCallback(async () => {
    if (!editor || !doc.currentDoc) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    const anchor = createAnchor(fullText, from, to);

    editor.chain().focus().setHighlight({ color: "yellow" }).run();

    try {
      const highlight = await annotations.createHighlight({
        documentId: doc.currentDoc.id,
        color: "yellow",
        textContent: selectedText,
        fromPos: from,
        toPos: to,
        prefixContext: anchor.prefix,
        suffixContext: anchor.suffix,
      });

      // Find the mark element in the editor DOM to anchor the popover
      requestAnimationFrame(() => {
        const marks = editor.view.dom.querySelectorAll("mark[data-color]");
        for (const mark of marks) {
          if (mark.textContent === selectedText) {
            setAnchorRect(mark.getBoundingClientRect());
            break;
          }
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
    async () => {
      if (!editor || !doc.currentDoc) return;

      // Read latest annotation state via refs to avoid both stale closures
      // and race conditions with in-flight DB writes
      const markdown = await formatAnnotationsMarkdown({
        document: doc.currentDoc,
        editor,
        highlights: highlightsRef.current,
        marginNotes: marginNotesRef.current,
      });

      await writeText(markdown);

      // Persist corrections (fire-and-forget — don't block clipboard feedback)
      const highlights = highlightsRef.current;
      const marginNotes = marginNotesRef.current;
      const currentDoc = doc.currentDoc;

      if (currentDoc && highlights.length > 0 && marginNotes.length > 0) {
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
          persistCorrections(
            correctionInputs,
            currentDoc.id,
            currentDoc.title ?? null,
            currentDoc.source,
            currentDoc.file_path ?? null,
            today,
          ).catch((err) => console.error("Failed to persist corrections:", err));
        }
      }
    },
    [editor, doc.currentDoc],
  );

  // Open a recent document from the sidebar
  const handleSelectRecentDoc = useCallback(
    async (recentDoc: Document) => {
      if (doc.currentDoc?.id === recentDoc.id) return;

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
    [doc, keepLocal]
  );

  // Open a keep-local article
  const handleSelectKeepLocalItem = useCallback(
    async (item: KeepLocalItem) => {
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
        // indexDocument uses the saved doc's ID (which may be reused from a previous open)
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
      onOpenFilePath={doc.openFilePath}
      onRenameFile={async (targetDoc, newName) => {
        try {
          await doc.renameDocFile(targetDoc, newName);
        } catch (err) {
          // Error already logged in the hook
        }
      }}
    >
      <Reader
        content={doc.content}
        onUpdate={handleEditorUpdate}
        isLoading={doc.isLoading}
        onEditorReady={handleEditorReady}
      />

      <FloatingToolbar
        editor={editor}
        onHighlight={handleHighlight}
        onNote={handleNote}
      />

      {focusHighlightId && annotations.isLoaded && (() => {
        const highlight = annotations.highlights.find((h) => h.id === focusHighlightId);
        if (!highlight) return null;
        const notes = annotations.marginNotes.filter((n) => n.highlight_id === focusHighlightId);
        return (
          <HighlightThread
            highlight={highlight}
            notes={notes}
            onAddNote={annotations.createMarginNote}
            onUpdateNote={annotations.updateMarginNote}
            onDeleteNote={annotations.deleteMarginNote}
            onDeleteHighlight={handleDeleteHighlight}
            onClose={() => {
              setFocusHighlightId(null);
              setAnchorRect(null);
              setAutoFocusNew(false);
            }}
            anchorRect={anchorRect}
            autoFocusNew={autoFocusNew}
          />
        );
      })()}

      <ExportAnnotationsPopover
        isOpen={showExportPopover}
        onExport={handleExportAnnotations}
        onClose={() => setShowExportPopover(false)}
      />
    </AppShell>
  );
}

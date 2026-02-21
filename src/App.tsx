import { useState, useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AppShell } from "@/components/layout/AppShell";
import { Reader } from "@/components/editor/Reader";
import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import { MarginNotePanel } from "@/components/editor/MarginNotePanel";
import { ExportAnnotationsPopover } from "@/components/editor/ExportAnnotationsPopover";
import { useDocument } from "@/hooks/useDocument";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useKeepLocal } from "@/hooks/useKeepLocal";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { useSearch } from "@/hooks/useSearch";
import { createAnchor } from "@/lib/text-anchoring";
import { formatAnnotationsMarkdown } from "@/lib/export-annotations";
import { readFile, drainPendingOpenFiles } from "@/lib/tauri-commands";
import { listen } from "@tauri-apps/api/event";
import type { Highlight, MarginNote } from "@/types/annotations";
import type { KeepLocalItem } from "@/types/keep-local";
import type { Document } from "@/types/document";

export default function App() {
  const doc = useDocument();
  const annotations = useAnnotations();
  const keepLocal = useKeepLocal();
  const search = useSearch();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [focusHighlightId, setFocusHighlightId] = useState<string | null>(null);

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

  // File watcher: reload content on external changes
  // Use ref to avoid recreating the callback (which would cause useFileWatcher to re-subscribe)
  const currentDocRef = useRef(doc.currentDoc);
  currentDocRef.current = doc.currentDoc;
  const setContentExternalRef = useRef(doc.setContentExternal);
  setContentExternalRef.current = doc.setContentExternal;

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

  // Handle highlight click → scroll to note in margin
  useEffect(() => {
    const handleHighlightClick = (e: Event) => {
      const { text } = (e as CustomEvent).detail;
      const match = annotations.highlights.find((h) => h.text_content === text);
      if (match) {
        setFocusHighlightId(match.id);
      }
    };

    const handleHighlightDelete = async (e: Event) => {
      const { text } = (e as CustomEvent).detail;
      const match = annotations.highlights.find((h) => h.text_content === text);
      if (!match || !editor) return;

      // Remove from database
      await annotations.deleteHighlight(match.id);

      // Remove the mark from the editor
      const { state } = editor;
      const { tr } = state;
      let removed = false;
      state.doc.descendants((node, pos) => {
        if (removed) return false;
        node.marks.forEach((mark) => {
          if (mark.type.name === "highlight") {
            const nodeText = node.text ?? "";
            if (nodeText === text || text.includes(nodeText)) {
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              removed = true;
            }
          }
        });
      });
      if (removed) {
        editor.view.dispatch(tr);
      }
    };

    window.addEventListener("margin:highlight-click", handleHighlightClick);
    window.addEventListener("margin:highlight-delete", handleHighlightDelete);
    return () => {
      window.removeEventListener("margin:highlight-click", handleHighlightClick);
      window.removeEventListener("margin:highlight-delete", handleHighlightDelete);
    };
  }, [annotations.highlights, editor]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    if (!editor) return;

    const highlight = annotations.highlights.find((h) => h.id === id);
    await annotations.deleteHighlight(id);

    // Remove marks from editor
    if (highlight && editor) {
      const { state } = editor;
      const { tr } = state;
      state.doc.descendants((node, pos) => {
        node.marks.forEach((mark) => {
          if (mark.type.name === "highlight") {
            const nodeText = node.text ?? "";
            if (nodeText === highlight.text_content || highlight.text_content.includes(nodeText)) {
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
            }
          }
        });
      });
      editor.view.dispatch(tr);
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
      setFocusHighlightId(highlight.id);
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
      const documentId = doc.currentDoc.id;

      // Fetch fresh data directly from the DB to avoid stale React state
      const [freshHighlights, freshNotes] = await Promise.all([
        invoke<Highlight[]>("get_highlights", { documentId }),
        invoke<MarginNote[]>("get_margin_notes", { documentId }),
      ]);

      const markdown = await formatAnnotationsMarkdown({
        document: doc.currentDoc,
        editor,
        highlights: freshHighlights,
        marginNotes: freshNotes,
      });

      await writeText(markdown);
    },
    [editor, doc.currentDoc],
  );

  // Open a recent document from the sidebar
  const handleSelectRecentDoc = useCallback(
    async (recentDoc: Document) => {
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
      marginPanel={
        annotations.isLoaded ? (
          <MarginNotePanel
            highlights={annotations.highlights}
            marginNotes={annotations.marginNotes}
            onAddNote={annotations.createMarginNote}
            onUpdateNote={annotations.updateMarginNote}
            onDeleteNote={annotations.deleteMarginNote}
            onDeleteHighlight={handleDeleteHighlight}
            focusHighlightId={focusHighlightId}
            onFocusConsumed={() => setFocusHighlightId(null)}
          />
        ) : undefined
      }
    >
      <Reader
        content={doc.content}
        onUpdate={doc.setContent}
        isLoading={doc.isLoading}
        onEditorReady={handleEditorReady}
      />

      <FloatingToolbar
        editor={editor}
        onHighlight={handleHighlight}
        onNote={handleNote}
      />

      <ExportAnnotationsPopover
        isOpen={showExportPopover}
        onExport={handleExportAnnotations}
        onClose={() => setShowExportPopover(false)}
      />
    </AppShell>
  );
}

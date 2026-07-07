import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { serializeEditorMarkdown } from "@/lib/serialize-editor";
import StarterKit from "@tiptap/starter-kit";
import Strike from "@tiptap/extension-strike";
import Typography from "@tiptap/extension-typography";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";
import { MultiColorHighlight } from "./extensions/highlight";
import { MarginNote } from "./extensions/margin-note";
import { DiffMark } from "./extensions/diff-mark";
import { FrontMatter } from "./extensions/front-matter";
import { Search } from "./extensions/search";
import "../../styles/editor.css";

// Prevent Strike from claiming <del> tags used by DiffMark.
// Without this, deleted text gets both a diffMark and a strike mark;
// the strike serializes to ~~text~~ in markdown, which persists after
// diff cleanup and shows strikethrough on content that should be removed.
const SafeStrike = Strike.extend({
  parseHTML() {
    return [
      { tag: "s" },
      { tag: "del:not([data-change-id])" },
      { tag: "strike" },
      {
        style: "text-decoration",
        consuming: false,
        getAttrs: (style) =>
          (style as string).includes("line-through") ? {} : false,
      },
    ];
  },
});

interface ReaderProps {
  content: string;
  onUpdate: (content: string) => void;
  isLoading: boolean;
  onEditorReady?: (editor: Editor) => void;
  /** Called synchronously on every edit, before the debounced serialization. */
  onDirtyEdit?: () => void;
}

export function Reader({ content, onUpdate, isLoading, onEditorReady, onDirtyEdit }: ReaderProps) {
  const isExternalUpdate = useRef(false);
  const lastEmittedMarkdownRef = useRef<string | null>(null);
  const emitTimerRef = useRef<number | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onDirtyEditRef = useRef(onDirtyEdit);
  onDirtyEditRef.current = onDirtyEdit;

  const editor = useEditor({
    extensions: [
      FrontMatter,
      StarterKit.configure({ strike: false }),
      SafeStrike,
      Typography,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ["https", "http"] }),
      Image.configure({ inline: false, allowBase64: true }),
      MultiColorHighlight.configure({ multicolor: true }),
      MarginNote,
      DiffMark,
      Search,
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: "tight",
        bulletListMarker: "-",
        linkify: false,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "reader-content",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (isExternalUpdate.current) return;
      // Dirty flag is cheap and must be immediate (save/unsaved-dialog key
      // off it). Serialization walks and re-emits the whole document, so it
      // runs on a trailing debounce instead of every keystroke — on long
      // documents per-keystroke getMarkdown() dominated typing latency.
      onDirtyEditRef.current?.();
      if (emitTimerRef.current !== null) window.clearTimeout(emitTimerRef.current);
      emitTimerRef.current = window.setTimeout(() => {
        emitTimerRef.current = null;
        if (ed.isDestroyed) return;
        const md = serializeEditorMarkdown(ed);
        if (md === null) return;
        lastEmittedMarkdownRef.current = md;
        onUpdateRef.current(md);
      }, 250);
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // If the content prop matches what the editor last emitted via onUpdate,
    // this is a round-trip from the editor's own typing — skip setContent
    // to prevent the cursor from jumping to the end of the document.
    if (content === lastEmittedMarkdownRef.current) {
      lastEmittedMarkdownRef.current = null;
      return;
    }

    const currentMd = editor.storage.markdown.getMarkdown() as string;
    if (currentMd === content) return;

    isExternalUpdate.current = true;
    editor.commands.setContent(content);
    isExternalUpdate.current = false;
  }, [content, editor]);

  return (
    <div
      style={{
        opacity: isLoading ? 0.5 : 1,
        transition: isLoading ? "none" : "opacity 200ms var(--ease-entrance)",
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

export default Reader;

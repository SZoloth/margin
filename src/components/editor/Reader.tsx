import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
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
import "../../styles/editor.css";

interface ReaderProps {
  content: string;
  onUpdate: (content: string) => void;
  isLoading: boolean;
  onEditorReady?: (editor: Editor) => void;
}

export function Reader({ content, onUpdate, isLoading, onEditorReady }: ReaderProps) {
  const isExternalUpdate = useRef(false);
  const lastEmittedMarkdownRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Typography,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true }),
      MultiColorHighlight.configure({ multicolor: true }),
      MarginNote,
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
      const md = ed.storage.markdown.getMarkdown() as string;
      lastEmittedMarkdownRef.current = md;
      onUpdate(md);
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

    // If the only difference is that the editor has mark HTML (e.g. <mark ...>)
    // from programmatic highlight restoration, skip the setContent call —
    // it would wipe those marks and lose data-highlight-id attributes.
    const stripMarks = (s: string) =>
      s.replace(/<\/?mark[^>]*>/g, "");
    if (stripMarks(currentMd) === stripMarks(content)) return;

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

import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
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
}

export function Reader({ content, onUpdate, isLoading, onEditorReady }: ReaderProps) {
  const isExternalUpdate = useRef(false);
  const lastEmittedMarkdownRef = useRef<string | null>(null);

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
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true }),
      MultiColorHighlight.configure({ multicolor: true }),
      MarginNote,
      DiffMark,
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
      // Defense-in-depth: never serialize content that contains diff marks.
      // If diff marks leak into markdown, deleted text persists as plain text
      // (or ~~text~~ if Strike somehow claims <del> tags).
      let hasDiffMarks = false;
      ed.state.doc.descendants((node) => {
        if (hasDiffMarks) return false;
        if (node.marks.some((m) => m.type.name === "diffMark")) {
          hasDiffMarks = true;
          return false;
        }
      });
      if (hasDiffMarks) return;

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

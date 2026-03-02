import { Node } from "@tiptap/core";
import frontMatterPlugin from "markdown-it-front-matter";

/**
 * TipTap node extension that parses YAML front matter (--- delimited)
 * from markdown and renders it as a read-only styled code block.
 *
 * Round-trips cleanly: getMarkdown() re-serializes the --- fences,
 * so no save/load/export path needs changes.
 */
export const FrontMatter = Node.create({
  name: "frontMatter",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  isolating: true,

  // Must come before horizontalRule in priority so `---` at line 0
  // is parsed as front matter, not an <hr>.
  priority: 200,

  addAttributes() {
    return {
      content: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre[data-front-matter]",
        getAttrs(node) {
          const el = node as HTMLElement;
          return { content: el.querySelector("code")?.textContent ?? "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      { "data-front-matter": "", contenteditable: "false" },
      ["code", {}, HTMLAttributes.content],
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (n: unknown) => void }, node: { attrs: { content: string } }) {
          state.write(`---\n${node.attrs.content}\n---`);
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: { use: Function; _frontMatterMeta?: string }) {
            markdownit.use(frontMatterPlugin, (yaml: string) => {
              markdownit._frontMatterMeta = yaml;
            });
          },
          updateDOM(element: HTMLElement) {
            const md = (this as unknown as { editor: { storage: { markdown: { parser: { md: { _frontMatterMeta?: string } } } } } }).editor
              .storage.markdown.parser.md;
            const yaml = md._frontMatterMeta;
            if (!yaml) return;
            // Clean up so next parse doesn't carry stale data
            delete md._frontMatterMeta;

            const pre = element.ownerDocument.createElement("pre");
            pre.setAttribute("data-front-matter", "");
            pre.setAttribute("contenteditable", "false");
            const code = element.ownerDocument.createElement("code");
            code.textContent = yaml;
            pre.appendChild(code);
            element.insertBefore(pre, element.firstChild);
          },
        },
      },
    };
  },
});

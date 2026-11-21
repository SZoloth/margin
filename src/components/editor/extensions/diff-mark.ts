import { Mark } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const diffClickKey = new PluginKey("diffClick");

export interface DiffMarkOptions {
  /**
   * Whether a diff review is building the document. Outside a review,
   * <ins>/<del> with a change id are the file's own content, not review marks.
   */
  isReviewing: () => boolean;
}

export const DiffMark = Mark.create<DiffMarkOptions>({
  name: "diffMark",

  addOptions() {
    return { isReviewing: () => false };
  },

  addAttributes() {
    return {
      changeId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.dataset.changeId ?? null,
        renderHTML: (attributes: Record<string, string | null>) =>
          attributes.changeId ? { "data-change-id": attributes.changeId } : {},
      },
      diffType: {
        default: "insertion",
        parseHTML: (element: HTMLElement) => {
          if (element.tagName === "DEL") return "deletion";
          return "insertion";
        },
        renderHTML: (attributes: Record<string, string>) => ({
          class: `diff-mark--${attributes.diffType}`,
        }),
      },
    };
  },

  parseHTML() {
    const reviewing = () => (this.options.isReviewing() ? null : false);
    return [
      { tag: "ins[data-change-id]", getAttrs: reviewing },
      { tag: "del[data-change-id]", getAttrs: reviewing },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const tag = HTMLAttributes.class?.includes("diff-mark--deletion")
      ? "del"
      : "ins";
    return [tag, HTMLAttributes, 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize: { open: "", close: "" },
        parse: {},
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: diffClickKey,
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target;
            if (!(target instanceof Element)) return false;

            const mark = target.closest("ins[data-change-id], del[data-change-id]");
            if (!mark) return false;

            const changeId = (mark as HTMLElement).dataset.changeId;
            if (!changeId) return false;

            window.dispatchEvent(
              new CustomEvent("margin:diff-click", {
                detail: { changeId, element: mark },
              }),
            );
            return true;
          },
        },
      }),
    ];
  },
});

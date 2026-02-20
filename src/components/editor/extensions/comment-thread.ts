import { Mark, mergeAttributes } from "@tiptap/core";

export interface CommentThreadAttributes {
  threadId: string;
  resolved: boolean;
}

export const CommentThread = Mark.create({
  name: "commentThread",

  inclusive: false, // Don't extend when typing at the boundary

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.dataset.threadId,
        renderHTML: (attributes: Record<string, string>) => ({
          "data-thread-id": attributes.threadId,
        }),
      },
      resolved: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.dataset.resolved === "true",
        renderHTML: (attributes: Record<string, string | boolean>) => ({
          "data-resolved": String(attributes.resolved),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-thread-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const resolved = HTMLAttributes["data-resolved"] === "true";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: resolved
          ? "comment-thread comment-thread--resolved"
          : "comment-thread",
      }),
      0,
    ];
  },
});

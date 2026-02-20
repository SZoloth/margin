import Highlight from "@tiptap/extension-highlight";

export interface HighlightOptions {
  multicolor: boolean;
  colors: string[];
}

// Extend the built-in Highlight to support a `color` attribute
export const MultiColorHighlight = Highlight.extend({
  name: "highlight",

  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: "yellow",
        parseHTML: (element: HTMLElement) => element.dataset.color ?? "yellow",
        renderHTML: (attributes: Record<string, string>) => ({
          "data-color": attributes.color,
          class: `highlight--${attributes.color}`,
        }),
      },
    };
  },
});

import Highlight from "@tiptap/extension-highlight";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface HighlightOptions {
  multicolor: boolean;
  colors: string[];
}

const highlightClickKey = new PluginKey("highlightClick");

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

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: highlightClickKey,
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            const mark = target.closest("mark[data-color]");
            if (!mark) return false;

            const text = mark.textContent ?? "";

            if (event.shiftKey) {
              // Shift+click: delete highlight
              window.dispatchEvent(
                new CustomEvent("margin:highlight-delete", {
                  detail: { text },
                }),
              );
            } else {
              // Click: scroll to annotation
              window.dispatchEvent(
                new CustomEvent("margin:highlight-click", {
                  detail: { text },
                }),
              );
            }
            return true;
          },
        },
      }),
    ];
  },
});

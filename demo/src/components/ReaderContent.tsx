import type React from "react";
import { COLORS } from "../constants/colors";

// The article text broken into segments for animation
const TITLE = "The Case for Local-First Software";

const PARAGRAPHS = [
  "Cloud applications have transformed how we work, but they come with a hidden cost. Every document you create lives on someone else's server, subject to their terms, their uptime, and their business model.",
  // This paragraph contains the highlight target
  null, // handled specially
  null, // h2
  "The best readers don't just consume — they converse with the text. They underline, scribble, question. The margin is where understanding deepens.",
];

const P2_BEFORE = "Local-first software takes a different approach. Your data stays on your machine, in formats you control. ";
const P2_HIGHLIGHT = "When the network disappears, your work doesn't.";
const P2_AFTER = " Annotations are stored alongside your reading history in a private database that never phones home.";

const H2 = "Reading as a Practice";

type ReaderContentProps = {
  paragraphOpacities: number[];
  showHighlight: boolean;
  highlightProgress: number; // 0-1, width of highlight
  showSelection: boolean;
  selectionProgress: number; // 0-1, width of selection
};

export const ReaderContent: React.FC<ReaderContentProps> = ({
  paragraphOpacities,
  showHighlight,
  highlightProgress,
  showSelection,
  selectionProgress,
}) => {
  const baseStyle: React.CSSProperties = {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 18,
    lineHeight: 1.72,
    color: COLORS.textPrimary,
  };

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: COLORS.page,
        overflowY: "hidden",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: "65ch",
          width: "100%",
          padding: "48px 24px 96px",
          ...baseStyle,
        }}
      >
        {/* H1 */}
        <h1
          style={{
            fontSize: 36,
            lineHeight: 1.2,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginTop: 48,
            marginBottom: 24,
            opacity: paragraphOpacities[0] ?? 0,
            fontFamily: "'Newsreader', Georgia, serif",
            color: COLORS.textPrimary,
          }}
        >
          {TITLE}
        </h1>

        {/* Paragraph 1 */}
        <p
          style={{
            marginBottom: "1.25em",
            opacity: paragraphOpacities[1] ?? 0,
          }}
        >
          {PARAGRAPHS[0]}
        </p>

        {/* Paragraph 2 — contains highlight target */}
        <p
          style={{
            marginBottom: "1.25em",
            opacity: paragraphOpacities[2] ?? 0,
            position: "relative",
          }}
        >
          {P2_BEFORE}
          <span style={{ position: "relative", fontWeight: 700 }}>
            {/* Selection overlay */}
            {showSelection && (
              <span
                style={{
                  position: "absolute",
                  top: -1,
                  left: 0,
                  bottom: -1,
                  width: `${selectionProgress * 100}%`,
                  backgroundColor: COLORS.selection,
                  borderRadius: 2,
                  pointerEvents: "none",
                }}
              />
            )}
            {/* Highlight overlay */}
            {showHighlight && (
              <span
                style={{
                  position: "absolute",
                  top: -1,
                  left: 0,
                  bottom: -1,
                  width: `${highlightProgress * 100}%`,
                  backgroundColor: COLORS.highlight.yellow,
                  borderRadius: 2,
                  pointerEvents: "none",
                }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>
              {P2_HIGHLIGHT}
            </span>
          </span>
          {P2_AFTER}
        </p>

        {/* H2 */}
        <h2
          style={{
            fontSize: 26,
            lineHeight: 1.3,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            marginTop: 40,
            marginBottom: 16,
            opacity: paragraphOpacities[3] ?? 0,
            fontFamily: "'Newsreader', Georgia, serif",
            color: COLORS.textPrimary,
          }}
        >
          {H2}
        </h2>

        {/* Paragraph 3 */}
        <p
          style={{
            marginBottom: "1.25em",
            opacity: paragraphOpacities[4] ?? 0,
          }}
        >
          {PARAGRAPHS[3]}
        </p>
      </div>
    </div>
  );
};

// Export the highlight sentence position for cursor targeting
// These are approximate positions relative to the reader content area
export const HIGHLIGHT_TARGET = {
  // Center of the bold sentence, relative to the reader pane
  x: 380,
  y: 278,
  width: 380,
};

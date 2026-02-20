import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppChrome } from "./components/AppChrome";
import { Sidebar } from "./components/Sidebar";
import { ReaderContent, HIGHLIGHT_TARGET } from "./components/ReaderContent";
import { FloatingToolbar } from "./components/FloatingToolbar";
import { Cursor } from "./components/Cursor";
import { MarginNote } from "./components/MarginNote";
import { COLORS } from "./constants/colors";
import { SCENES, SPRING_CONFIGS } from "./constants/timing";

// Cursor keyframe positions (relative to the reader pane origin)
// The reader pane starts at x=260 (sidebar width) within the app chrome
const READER_OFFSET_X = 260;
const CURSOR_START = { x: 500, y: 350 }; // initial position off to the side
const CURSOR_SELECT_START = { x: HIGHLIGHT_TARGET.x - HIGHLIGHT_TARGET.width / 2 + READER_OFFSET_X, y: HIGHLIGHT_TARGET.y + 52 + 10 }; // title bar height (52) + offset
const CURSOR_SELECT_END = { x: HIGHLIGHT_TARGET.x + HIGHLIGHT_TARGET.width / 2 + READER_OFFSET_X, y: HIGHLIGHT_TARGET.y + 52 + 10 };
const CURSOR_TOOLBAR_YELLOW = { x: HIGHLIGHT_TARGET.x + READER_OFFSET_X - 60, y: HIGHLIGHT_TARGET.y + 52 - 30 }; // above selection, on yellow swatch

export const MarginDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ---- Scene 1: App chrome fade in (frames 0-59) ----
  const chromeOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const sidebarOpacity = interpolate(frame, [10, 40], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // ---- Scene 2: Text reveal (frames 60-149) ----
  // 5 elements: title, p1, p2, h2, p3 — stagger by 12 frames each
  const paragraphOpacities = Array.from({ length: 5 }, (_, i) => {
    const startFrame = SCENES.textReveal.from + i * 12;
    return spring({
      frame: frame - startFrame,
      fps,
      config: SPRING_CONFIGS.fade,
    });
  });

  // ---- Scene 3: Select text (frames 150-239) ----
  const selectScene = frame - SCENES.selectText.from;

  // Cursor moves to start of sentence (frames 0-25 of scene)
  const cursorMoveToStart = interpolate(selectScene, [0, 25], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const cursorMoveEased = easeInOut(cursorMoveToStart);

  // Selection drag (frames 30-80 of scene)
  const selectionProgress = interpolate(selectScene, [30, 80], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Cursor x during selection
  const cursorDragX = interpolate(
    selectionProgress,
    [0, 1],
    [CURSOR_SELECT_START.x, CURSOR_SELECT_END.x],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  // Cursor position logic
  let cursorX: number;
  let cursorY: number;
  let cursorOpacity: number;

  if (frame < SCENES.selectText.from) {
    cursorOpacity = 0;
    cursorX = CURSOR_START.x;
    cursorY = CURSOR_START.y;
  } else if (selectScene <= 25) {
    // Moving to start
    cursorOpacity = interpolate(selectScene, [0, 10], [0, 1], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });
    cursorX = interpolate(cursorMoveEased, [0, 1], [CURSOR_START.x, CURSOR_SELECT_START.x]);
    cursorY = interpolate(cursorMoveEased, [0, 1], [CURSOR_START.y, CURSOR_SELECT_START.y]);
  } else if (selectScene <= 80) {
    // Dragging selection
    cursorOpacity = 1;
    cursorX = cursorDragX;
    cursorY = CURSOR_SELECT_START.y;
  } else if (frame < SCENES.toolbar.from + SCENES.toolbar.duration) {
    // Move to toolbar yellow swatch
    const toolbarScene = frame - SCENES.toolbar.from;
    const moveToToolbar = interpolate(toolbarScene, [0, 20], [0, 1], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });
    const moveEased = easeInOut(moveToToolbar);
    cursorOpacity = 1;
    cursorX = interpolate(moveEased, [0, 1], [CURSOR_SELECT_END.x, CURSOR_TOOLBAR_YELLOW.x]);
    cursorY = interpolate(moveEased, [0, 1], [CURSOR_SELECT_START.y, CURSOR_TOOLBAR_YELLOW.y]);
  } else {
    // Fade out after clicking
    const fadeStart = SCENES.highlight.from;
    cursorOpacity = interpolate(frame, [fadeStart, fadeStart + 15], [1, 0], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });
    cursorX = CURSOR_TOOLBAR_YELLOW.x;
    cursorY = CURSOR_TOOLBAR_YELLOW.y;
  }

  // ---- Scene 4: Toolbar appears (frames 240-299) ----
  const toolbarScene = frame - SCENES.toolbar.from;
  const toolbarSpring = spring({
    frame: toolbarScene,
    fps,
    config: SPRING_CONFIGS.toolbar,
  });
  const toolbarOpacity = frame >= SCENES.toolbar.from && frame < SCENES.highlight.from + 20
    ? interpolate(toolbarSpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
    : frame >= SCENES.highlight.from + 20
      ? interpolate(frame, [SCENES.highlight.from + 20, SCENES.highlight.from + 35], [1, 0], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
        })
      : 0;
  const toolbarScale = interpolate(toolbarSpring, [0, 1], [0.9, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Active swatch: yellow gets selected when cursor is near (after frame 260)
  const activeSwatchIndex = frame >= SCENES.toolbar.from + 20 ? 0 : undefined;

  // ---- Scene 5: Highlight (frames 300-389) ----
  const highlightScene = frame - SCENES.highlight.from;
  const highlightProgress = interpolate(highlightScene, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const showHighlight = frame >= SCENES.highlight.from;
  const showSelection = frame >= SCENES.selectText.from + 30 && !showHighlight;

  // ---- Scene 6: Margin note (frames 390-479) ----
  const noteScene = frame - SCENES.marginNote.from;
  const noteSpring = spring({
    frame: noteScene,
    fps,
    config: SPRING_CONFIGS.note,
  });
  const noteOpacity = frame >= SCENES.marginNote.from
    ? interpolate(noteSpring, [0, 0.3], [0, 1], {
        extrapolateRight: "clamp",
        extrapolateLeft: "clamp",
      })
    : 0;
  const noteTranslateX = frame >= SCENES.marginNote.from
    ? interpolate(noteSpring, [0, 1], [40, 0])
    : 40;

  // Toolbar position (above the highlight target, in the reader pane)
  const toolbarX = HIGHLIGHT_TARGET.x;
  const toolbarY = HIGHLIGHT_TARGET.y + 52 - 12; // title bar + gap above

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#e8e4de",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <AppChrome opacity={chromeOpacity}>
          <Sidebar opacity={sidebarOpacity} />
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <ReaderContent
              paragraphOpacities={paragraphOpacities}
              showHighlight={showHighlight}
              highlightProgress={highlightProgress}
              showSelection={showSelection}
              selectionProgress={selectionProgress}
            />

            {/* Floating toolbar */}
            <FloatingToolbar
              opacity={toolbarOpacity}
              scale={toolbarScale}
              x={toolbarX}
              y={toolbarY}
              activeSwatchIndex={activeSwatchIndex}
            />

            {/* Margin note */}
            <MarginNote
              opacity={noteOpacity}
              translateX={noteTranslateX}
              y={HIGHLIGHT_TARGET.y + 52 - 10}
            />
          </div>
        </AppChrome>

        {/* Cursor (outside chrome so it's not clipped) */}
        <Cursor x={cursorX} y={cursorY} opacity={cursorOpacity} />
      </div>
    </AbsoluteFill>
  );
};

// Simple ease-in-out helper
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

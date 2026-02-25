export const LINKEDIN_FPS = 30;
export const LINKEDIN_TOTAL_FRAMES = 3600; // 120s

export const TRANSITION_FRAMES = 15; // 0.5s cross-fade

export type ZoomRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const ZOOM_REGIONS: Record<string, ZoomRegion> = {
  full: { x: 0, y: 60, w: 2932, h: 1646 },
  editor: { x: 500, y: 200, w: 1800, h: 1010 },
  notePanel: { x: 1400, y: 200, w: 1500, h: 843 },
  modal: { x: 800, y: 400, w: 1300, h: 731 },
  terminal: { x: 0, y: 300, w: 2932, h: 1538 },
};

export type SceneDef = {
  id: string;
  from: number;
  duration: number;
  /** Source video start time in seconds (null for non-video scenes) */
  sourceStart: number | null;
  /** Source video end time in seconds */
  sourceEnd: number | null;
  /** Playback speed multiplier */
  speed: number;
  /** Starting zoom region key */
  zoomFrom: string;
  /** Ending zoom region key (for animated zoom) */
  zoomTo: string;
  /** Caption text */
  caption: string;
  /** Secondary caption line */
  subcaption?: string;
};

export const SCENES: SceneDef[] = [
  // -- Intro card --
  {
    id: "intro",
    from: 0,
    duration: 240, // 8s
    sourceStart: null,
    sourceEnd: null,
    speed: 1,
    zoomFrom: "full",
    zoomTo: "full",
    caption: "",
  },
  // -- 0:00-0:10  Setup: Claude Code left, Margin right, article loaded --
  {
    id: "setup",
    from: 240,
    duration: 210, // 7s
    sourceStart: 0,
    sourceEnd: 10,
    speed: 1.5,
    zoomFrom: "full",
    zoomTo: "full",
    caption: "Margin + Claude Code, side by side",
    subcaption: "Article on the right. Terminal on the left.",
  },
  // -- 0:10-1:30  First highlights + writing margin notes on opening paragraphs --
  {
    id: "annotating",
    from: 450,
    duration: 480, // 16s
    sourceStart: 10,
    sourceEnd: 90,
    speed: 2,
    zoomFrom: "full",
    zoomTo: "full",
    caption: "Highlight and write in the margins",
    subcaption: "Each note captures specific feedback on the text.",
  },
  // -- 1:30-10:40  Deep annotation pass through the full article (timelapse) --
  {
    id: "deepPass",
    from: 930,
    duration: 420, // 14s
    sourceStart: 90,
    sourceEnd: 640,
    speed: 8,
    zoomFrom: "full",
    zoomTo: "full",
    caption: "Build up a log of your feedback",
    subcaption: "9 annotations and 10 notes by the end.",
  },
  // -- 10:40-10:55  Export: "Copied to clipboard" modal, paste into Claude --
  {
    id: "export",
    from: 1350,
    duration: 360, // 12s
    sourceStart: 640,
    sourceEnd: 660,
    speed: 1.5,
    zoomFrom: "full",
    zoomTo: "full",
    caption: "Two clicks to paste into Claude",
    subcaption: "Export annotations straight to the terminal.",
  },
  // -- 10:55-13:00  Claude reads annotations, produces revision list + revised article --
  {
    id: "aiRevision",
    from: 1710,
    duration: 600, // 20s
    sourceStart: 660,
    sourceEnd: 780,
    speed: 2,
    zoomFrom: "full",
    zoomTo: "full",
    caption: "Claude makes targeted revisions",
    subcaption: "Every change addresses a specific annotation.",
  },
  // -- 17:00-20:50  Writing quality gate skill + final edits --
  {
    id: "qualityGate",
    from: 2310,
    duration: 510, // 17s
    sourceStart: 1025,
    sourceEnd: 1230,
    speed: 3,
    zoomFrom: "full",
    zoomTo: "full",
    caption: "Run a writing quality gate",
    subcaption: "Automated checks before the draft is done.",
  },
  // -- Outro card --
  {
    id: "outro",
    from: 2820,
    duration: 780, // 26s
    sourceStart: null,
    sourceEnd: null,
    speed: 1,
    zoomFrom: "full",
    zoomTo: "full",
    caption: "",
  },
];

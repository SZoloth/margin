export const HERO_FPS = 30;
export const HERO_DURATION_SECONDS = 25;
export const HERO_TOTAL_FRAMES = HERO_FPS * HERO_DURATION_SECONDS; // 750

// Output dimensions — 16:9, optimized for web embed at max 960px container
export const HERO_WIDTH = 1280;
export const HERO_HEIGHT = 720;

// Source video dimensions (retina macOS recording)
export const SOURCE_WIDTH = 2932;
export const SOURCE_HEIGHT = 1838;

// Near-full screen crop — shows both Margin and Ghostty/Claude Code
// Small trim of menu bar and dock
export const HERO_CROP = {
  x: 0,
  y: 60,
  w: 2932,
  h: 1650, // ~16:9 ratio for full width
};

// Source segment: ~625s–675s covers tail of highlighting, export to clipboard,
// and paste into Claude Code via Ghostty. 50s of source at 2x = 25s output.
export const HERO_SOURCE_START = 625; // seconds into source recording
export const HERO_PLAYBACK_RATE = 2;

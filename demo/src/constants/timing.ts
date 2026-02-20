export const FPS = 30;
export const TOTAL_FRAMES = 540;

export const SCENES = {
  appChrome: { from: 0, duration: 60 },
  textReveal: { from: 60, duration: 90 },
  selectText: { from: 150, duration: 90 },
  toolbar: { from: 240, duration: 60 },
  highlight: { from: 300, duration: 90 },
  marginNote: { from: 390, duration: 90 },
  hold: { from: 480, duration: 60 },
} as const;

export const SPRING_CONFIGS = {
  toolbar: { damping: 12, mass: 0.8, stiffness: 200 },
  note: { damping: 14, mass: 1.0, stiffness: 180 },
  fade: { damping: 200 },
} as const;

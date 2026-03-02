/**
 * Browser mock for @tauri-apps/api/window
 */

export function getCurrentWindow() {
  return {
    setTitle: () => Promise.resolve(),
    onFocusChanged: (_cb: (focused: boolean) => void) =>
      Promise.resolve(() => {}),
  };
}

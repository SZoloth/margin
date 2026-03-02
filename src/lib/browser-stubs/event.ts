/**
 * Browser mock for @tauri-apps/api/event
 */

export function listen(
  _event: string,
  _handler: (...args: unknown[]) => void,
): Promise<() => void> {
  return Promise.resolve(() => {});
}

export function emit(): Promise<void> {
  return Promise.resolve();
}

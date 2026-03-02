/**
 * Browser mock for @tauri-apps/plugin-fs
 *
 * Critical: stat() must return { mtime: Date | null }, not a number.
 * App.tsx reads info.mtime?.getTime().
 */

export async function stat(
  _path: string,
): Promise<{ isFile: boolean; mtime: Date | null }> {
  return { isFile: true, mtime: new Date() };
}

export async function readTextFile(_path: string): Promise<string> {
  return "";
}

export async function writeTextFile(
  _path: string,
  _contents: string,
): Promise<void> {}

export async function mkdir(_path: string): Promise<void> {}

export async function exists(_path: string): Promise<boolean> {
  return false;
}

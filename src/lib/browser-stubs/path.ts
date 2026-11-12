/**
 * Browser mock for @tauri-apps/api/path
 */

export async function homeDir(): Promise<string> {
  return "/mock/home";
}

export async function join(...parts: string[]): Promise<string> {
  return parts.join("/");
}

export async function dirname(path: string): Promise<string> {
  return path.replace(/\/[^/]+\/?$/, "");
}

export async function resourceDir(): Promise<string> {
  return "/mock/resources";
}

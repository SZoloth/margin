import { invoke } from "@tauri-apps/api/core";

/** Best-effort send to the MCP export bridge. Rust holds the bridge token, so the webview never sees it. */
export async function sendToMcpServer(
  markdown: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    await invoke<void>("mcp_bridge_send", { markdown });
    return { sent: true };
  } catch (err) {
    if (err instanceof Error) return { sent: false, error: err.message };
    return { sent: false, error: typeof err === "string" ? err : "Unknown error" };
  }
}

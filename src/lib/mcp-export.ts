export async function sendToMcpServer(
  markdown: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const res = await fetch("http://localhost:24784/export", {
      method: "POST",
      body: markdown,
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return { sent: true };
    return { sent: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

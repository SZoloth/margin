export async function sendToMcpServer(
  markdown: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("http://127.0.0.1:24784/export", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: markdown,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { sent: true };
    return { sent: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

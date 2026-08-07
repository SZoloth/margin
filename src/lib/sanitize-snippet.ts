/** Preserve the FTS-generated mark tags and escape every document-controlled byte. */
export function sanitizeSearchSnippet(html: string): string {
  return html
    .replace(/<mark>/g, "\x00MARK_OPEN\x00")
    .replace(/<\/mark>/g, "\x00MARK_CLOSE\x00")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\x00MARK_OPEN\x00/g, "<mark>")
    .replace(/\x00MARK_CLOSE\x00/g, "</mark>");
}

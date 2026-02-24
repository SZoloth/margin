import Foundation
import AppKit

/// Formats and exports annotations to clipboard as markdown.
struct ExportService {

    struct ExportResult {
        let highlightCount: Int
        let noteCount: Int
        let snippets: [String]
        let correctionsSaved: Bool
        let correctionsFile: String
    }

    func formatAnnotationsMarkdown(
        document: Document,
        highlights: [Highlight],
        marginNotes: [MarginNote],
        fullText: String
    ) -> String {
        // Build note lookup
        var notesByHighlight: [String: [MarginNote]] = [:]
        for note in marginNotes {
            notesByHighlight[note.highlightId, default: []].append(note)
        }

        let items = highlights.sorted { $0.fromPos < $1.fromPos }
        guard !items.isEmpty else { return "_No annotations to export._" }

        var lines: [String] = []

        // Header
        if document.isFile, let fp = document.filePath {
            lines.append("# Annotations: `\(fp)`")
        } else {
            lines.append("# Annotations: \"\(document.displayTitle)\"")
            if let url = document.url {
                lines.append("_Source: \(url)_")
            }
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "MM/dd/yyyy HH:mm"
        let dateStr = formatter.string(from: Date())
        lines.append("")
        lines.append("_Exported from Margin — \(dateStr) — \(items.count) annotations_")

        for highlight in items {
            lines.append("")
            lines.append("---")
            lines.append("")

            let lineRange = posToLineRange(fullText: fullText, from: Int(highlight.fromPos), to: Int(highlight.toPos))
            lines.append("### \(lineRange) -- \(highlight.color) highlight")
            lines.append(quoteText(highlight.textContent))

            if let notes = notesByHighlight[highlight.id], !notes.isEmpty {
                lines.append("")
                for note in notes {
                    lines.append("**Note:** \(note.content)")
                }
            }
        }

        lines.append("")
        return lines.joined(separator: "\n")
    }

    func copyToClipboard(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    // MARK: - Helpers

    private func posToLineNumber(fullText: String, pos: Int) -> Int {
        let index = fullText.index(fullText.startIndex, offsetBy: min(pos, fullText.count))
        let prefix = fullText[fullText.startIndex..<index]
        return prefix.components(separatedBy: "\n").count
    }

    private func posToLineRange(fullText: String, from: Int, to: Int) -> String {
        let startLine = posToLineNumber(fullText: fullText, pos: from)
        let endLine = posToLineNumber(fullText: fullText, pos: to)
        if startLine == endLine { return "Line \(startLine)" }
        return "Lines \(startLine)-\(endLine)"
    }

    private func quoteText(_ text: String) -> String {
        text.components(separatedBy: "\n")
            .map { "> \($0)" }
            .joined(separator: "\n")
    }
}

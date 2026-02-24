import Testing
import Foundation
@testable import MarginCore

struct ExportServiceTests {
    let service = ExportService()

    // MARK: - posToLineNumber

    @Test("Line 1 for position 0")
    func lineNumberAtStart() {
        #expect(service.posToLineNumber(fullText: "hello\nworld", pos: 0) == 1)
    }

    @Test("Line 2 for position after first newline")
    func lineNumberSecondLine() {
        let text = "hello\nworld"
        let nsText = text as NSString
        let worldStart = nsText.range(of: "world").location
        #expect(service.posToLineNumber(fullText: text, pos: worldStart) == 2)
    }

    @Test("Clamps position beyond string length")
    func lineNumberBeyondEnd() {
        let text = "hello\nworld"
        // Should not crash, should clamp to end
        let result = service.posToLineNumber(fullText: text, pos: 999)
        #expect(result == 2)
    }

    @Test("Works with UTF-16 positions and emoji")
    func lineNumberWithEmoji() {
        let text = "Hello 🌍\nWorld" // 🌍 is 2 UTF-16 units
        let nsText = text as NSString
        let worldStart = nsText.range(of: "World").location
        #expect(service.posToLineNumber(fullText: text, pos: worldStart) == 2)
    }

    // MARK: - posToLineRange

    @Test("Same line returns singular")
    func lineRangeSameLine() {
        let text = "The quick brown fox"
        #expect(service.posToLineRange(fullText: text, from: 4, to: 9) == "Line 1")
    }

    @Test("Different lines returns range")
    func lineRangeMultiLine() {
        let text = "line one\nline two\nline three"
        let nsText = text as NSString
        let twoStart = nsText.range(of: "line two").location
        let threeEnd = nsText.range(of: "line three").location + ("line three" as NSString).length
        #expect(service.posToLineRange(fullText: text, from: twoStart, to: threeEnd) == "Lines 2-3")
    }

    // MARK: - quoteText

    @Test("Single line gets > prefix")
    func quoteTextSingleLine() {
        #expect(service.quoteText("hello") == "> hello")
    }

    @Test("Multi-line gets > prefix on each line")
    func quoteTextMultiLine() {
        let result = service.quoteText("line one\nline two")
        #expect(result == "> line one\n> line two")
    }

    // MARK: - formatAnnotationsMarkdown

    @Test("Empty highlights returns no-annotations message")
    func formatEmptyHighlights() {
        let doc = Document(
            id: "doc1", source: "file", filePath: "/test.md",
            keepLocalId: nil, title: "Test", author: nil, url: nil,
            wordCount: 100, lastOpenedAt: 0, createdAt: 0
        )
        let result = service.formatAnnotationsMarkdown(
            document: doc, highlights: [], marginNotes: [], fullText: "content"
        )
        #expect(result.contains("No annotations"))
    }

    @Test("File document uses backtick path header")
    func formatFileDocument() {
        let doc = Document(
            id: "doc1", source: "file", filePath: "/path/to/notes.md",
            keepLocalId: nil, title: "Notes", author: nil, url: nil,
            wordCount: 100, lastOpenedAt: 0, createdAt: 0
        )
        let highlight = Highlight(
            id: "h1", documentId: "doc1", color: "yellow",
            textContent: "highlighted text", fromPos: 0, toPos: 16,
            prefixContext: nil, suffixContext: nil,
            createdAt: 0, updatedAt: 0
        )
        let result = service.formatAnnotationsMarkdown(
            document: doc, highlights: [highlight], marginNotes: [], fullText: "highlighted text here"
        )
        #expect(result.contains("# Annotations: `/path/to/notes.md`"))
        #expect(result.contains("> highlighted text"))
    }

    @Test("Keep-local document uses quoted title")
    func formatKeepLocalDocument() {
        let doc = Document(
            id: "doc1", source: "keep-local", filePath: nil,
            keepLocalId: "kl1", title: "Article Title", author: nil,
            url: "https://example.com", wordCount: 500, lastOpenedAt: 0, createdAt: 0
        )
        let highlight = Highlight(
            id: "h1", documentId: "doc1", color: "blue",
            textContent: "some text", fromPos: 0, toPos: 9,
            prefixContext: nil, suffixContext: nil,
            createdAt: 0, updatedAt: 0
        )
        let result = service.formatAnnotationsMarkdown(
            document: doc, highlights: [highlight], marginNotes: [], fullText: "some text"
        )
        #expect(result.contains("\"Article Title\""))
        #expect(result.contains("_Source: https://example.com_"))
    }

    @Test("Highlights sorted by position in export")
    func formatSortsByPosition() {
        let doc = Document(
            id: "doc1", source: "file", filePath: "/test.md",
            keepLocalId: nil, title: "Test", author: nil, url: nil,
            wordCount: 100, lastOpenedAt: 0, createdAt: 0
        )
        let h1 = Highlight(
            id: "h1", documentId: "doc1", color: "yellow",
            textContent: "second", fromPos: 20, toPos: 26,
            prefixContext: nil, suffixContext: nil, createdAt: 0, updatedAt: 0
        )
        let h2 = Highlight(
            id: "h2", documentId: "doc1", color: "green",
            textContent: "first", fromPos: 0, toPos: 5,
            prefixContext: nil, suffixContext: nil, createdAt: 0, updatedAt: 0
        )
        let result = service.formatAnnotationsMarkdown(
            document: doc, highlights: [h1, h2], marginNotes: [],
            fullText: "first some text and second here"
        )
        let firstIdx = result.range(of: "> first")!.lowerBound
        let secondIdx = result.range(of: "> second")!.lowerBound
        #expect(firstIdx < secondIdx)
    }

    @Test("Notes included under their highlight")
    func formatWithNotes() {
        let doc = Document(
            id: "doc1", source: "file", filePath: "/test.md",
            keepLocalId: nil, title: "Test", author: nil, url: nil,
            wordCount: 100, lastOpenedAt: 0, createdAt: 0
        )
        let highlight = Highlight(
            id: "h1", documentId: "doc1", color: "yellow",
            textContent: "text", fromPos: 0, toPos: 4,
            prefixContext: nil, suffixContext: nil, createdAt: 0, updatedAt: 0
        )
        let note = MarginNote(
            id: "n1", highlightId: "h1", content: "my annotation",
            createdAt: 0, updatedAt: 0
        )
        let result = service.formatAnnotationsMarkdown(
            document: doc, highlights: [highlight], marginNotes: [note],
            fullText: "text here"
        )
        #expect(result.contains("**Note:** my annotation"))
    }
}

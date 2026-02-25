import Testing
@testable import MarginCore

struct DocumentModelTests {

    @Test("isFile returns true for file source")
    func isFile() {
        let doc = Document(
            id: "1", source: "file", filePath: "/path.md",
            keepLocalId: nil, title: "Test", author: nil, url: nil,
            wordCount: 0, lastOpenedAt: 0, createdAt: 0
        )
        #expect(doc.isFile == true)
        #expect(doc.isKeepLocal == false)
    }

    @Test("isKeepLocal returns true for keep-local source")
    func isKeepLocal() {
        let doc = Document(
            id: "1", source: "keep-local", filePath: nil,
            keepLocalId: "kl1", title: "Article", author: nil, url: nil,
            wordCount: 0, lastOpenedAt: 0, createdAt: 0
        )
        #expect(doc.isKeepLocal == true)
        #expect(doc.isFile == false)
    }

    @Test("displayTitle returns title when present")
    func displayTitlePresent() {
        let doc = Document(
            id: "1", source: "file", filePath: nil,
            keepLocalId: nil, title: "My Title", author: nil, url: nil,
            wordCount: 0, lastOpenedAt: 0, createdAt: 0
        )
        #expect(doc.displayTitle == "My Title")
    }

    @Test("displayTitle returns Untitled when title is nil")
    func displayTitleNil() {
        let doc = Document(
            id: "1", source: "file", filePath: nil,
            keepLocalId: nil, title: nil, author: nil, url: nil,
            wordCount: 0, lastOpenedAt: 0, createdAt: 0
        )
        #expect(doc.displayTitle == "Untitled")
    }
}

struct HighlightModelTests {

    @Test("create() generates UUID and timestamps")
    func createSetsDefaults() {
        let h = Highlight.create(
            documentId: "doc1",
            color: "yellow",
            textContent: "some text",
            fromPos: 10,
            toPos: 19,
            prefixContext: "prefix",
            suffixContext: "suffix"
        )

        #expect(!h.id.isEmpty)
        #expect(h.documentId == "doc1")
        #expect(h.color == "yellow")
        #expect(h.textContent == "some text")
        #expect(h.fromPos == 10)
        #expect(h.toPos == 19)
        #expect(h.prefixContext == "prefix")
        #expect(h.suffixContext == "suffix")
        #expect(h.createdAt > 0)
        #expect(h.createdAt == h.updatedAt)
    }

    @Test("create() generates unique IDs")
    func createUniqueIds() {
        let h1 = Highlight.create(documentId: "d", color: "y", textContent: "t", fromPos: 0, toPos: 1, prefixContext: nil, suffixContext: nil)
        let h2 = Highlight.create(documentId: "d", color: "y", textContent: "t", fromPos: 0, toPos: 1, prefixContext: nil, suffixContext: nil)
        #expect(h1.id != h2.id)
    }
}

struct MarginNoteModelTests {

    @Test("create() generates UUID and timestamps")
    func createSetsDefaults() {
        let note = MarginNote.create(highlightId: "h1", content: "My note")

        #expect(!note.id.isEmpty)
        #expect(note.highlightId == "h1")
        #expect(note.content == "My note")
        #expect(note.createdAt > 0)
        #expect(note.createdAt == note.updatedAt)
    }
}

struct TabItemModelTests {

    @Test("create() sets initial state")
    func createSetsDefaults() {
        let tab = TabItem.create(documentId: "doc1", title: "Notes", tabOrder: 2)

        #expect(!tab.id.isEmpty)
        #expect(tab.documentId == "doc1")
        #expect(tab.title == "Notes")
        #expect(tab.isDirty == false)
        #expect(tab.tabOrder == 2)
    }
}

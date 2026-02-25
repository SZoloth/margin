import Testing
import GRDB
@testable import MarginCore

/// Creates a fresh in-memory database with Margin's schema for each test.
struct TestDatabase {
    let queue: DatabaseQueue

    init() throws {
        var config = Configuration()
        config.foreignKeysEnabled = true
        queue = try DatabaseQueue(configuration: config)
        try DatabaseManager.migrator().migrate(queue)
    }
}

// MARK: - AnnotationStore Tests

@Suite(.serialized)
struct AnnotationStoreTests {

    @Test("Create and retrieve highlight")
    func createAndGet() throws {
        let testDB = try TestDatabase()
        let store = AnnotationStore(reader: testDB.queue, writer: testDB.queue)

        // Insert a document first (foreign key)
        try testDB.queue.write { db in
            try db.execute(sql: """
                INSERT INTO documents (id, source, title, word_count, last_opened_at, created_at)
                VALUES ('doc1', 'file', 'Test', 100, 0, 0)
            """)
        }

        let highlight = try store.createHighlight(
            documentId: "doc1",
            color: "yellow",
            textContent: "some text",
            fromPos: 10,
            toPos: 19,
            prefixContext: "before ",
            suffixContext: " after"
        )

        #expect(highlight.documentId == "doc1")
        #expect(highlight.color == "yellow")
        #expect(highlight.textContent == "some text")

        let fetched = try store.getHighlights(documentId: "doc1")
        #expect(fetched.count == 1)
        #expect(fetched[0].id == highlight.id)
    }

    @Test("Delete highlight removes it")
    func deleteHighlight() throws {
        let testDB = try TestDatabase()
        let store = AnnotationStore(reader: testDB.queue, writer: testDB.queue)

        try testDB.queue.write { db in
            try db.execute(sql: """
                INSERT INTO documents (id, source, title, word_count, last_opened_at, created_at)
                VALUES ('doc1', 'file', 'Test', 100, 0, 0)
            """)
        }

        let highlight = try store.createHighlight(
            documentId: "doc1", color: "blue", textContent: "text",
            fromPos: 0, toPos: 4, prefixContext: nil, suffixContext: nil
        )

        try store.deleteHighlight(id: highlight.id)

        let remaining = try store.getHighlights(documentId: "doc1")
        #expect(remaining.isEmpty)
    }

    @Test("Update highlight color")
    func updateColor() throws {
        let testDB = try TestDatabase()
        let store = AnnotationStore(reader: testDB.queue, writer: testDB.queue)

        try testDB.queue.write { db in
            try db.execute(sql: """
                INSERT INTO documents (id, source, title, word_count, last_opened_at, created_at)
                VALUES ('doc1', 'file', 'Test', 100, 0, 0)
            """)
        }

        let highlight = try store.createHighlight(
            documentId: "doc1", color: "yellow", textContent: "text",
            fromPos: 0, toPos: 4, prefixContext: nil, suffixContext: nil
        )

        try store.updateHighlightColor(id: highlight.id, color: "green")

        let fetched = try store.getHighlights(documentId: "doc1")
        #expect(fetched[0].color == "green")
    }

    @Test("Update highlight position")
    func updatePosition() throws {
        let testDB = try TestDatabase()
        let store = AnnotationStore(reader: testDB.queue, writer: testDB.queue)

        try testDB.queue.write { db in
            try db.execute(sql: """
                INSERT INTO documents (id, source, title, word_count, last_opened_at, created_at)
                VALUES ('doc1', 'file', 'Test', 100, 0, 0)
            """)
        }

        let highlight = try store.createHighlight(
            documentId: "doc1", color: "yellow", textContent: "text",
            fromPos: 0, toPos: 4, prefixContext: nil, suffixContext: nil
        )

        try store.updateHighlightPosition(id: highlight.id, fromPos: 10, toPos: 14)

        let fetched = try store.getHighlights(documentId: "doc1")
        #expect(fetched[0].fromPos == 10)
        #expect(fetched[0].toPos == 14)
    }

    @Test("Create and retrieve margin notes")
    func marginNotes() throws {
        let testDB = try TestDatabase()
        let store = AnnotationStore(reader: testDB.queue, writer: testDB.queue)

        try testDB.queue.write { db in
            try db.execute(sql: """
                INSERT INTO documents (id, source, title, word_count, last_opened_at, created_at)
                VALUES ('doc1', 'file', 'Test', 100, 0, 0)
            """)
        }

        let highlight = try store.createHighlight(
            documentId: "doc1", color: "yellow", textContent: "text",
            fromPos: 0, toPos: 4, prefixContext: nil, suffixContext: nil
        )

        let note = try store.createMarginNote(highlightId: highlight.id, content: "My note")

        let fetched = try store.getMarginNotes(documentId: "doc1")
        #expect(fetched.count == 1)
        #expect(fetched[0].content == "My note")
        #expect(fetched[0].id == note.id)
    }

    @Test("Cascade delete removes notes when highlight deleted")
    func cascadeDelete() throws {
        let testDB = try TestDatabase()
        let store = AnnotationStore(reader: testDB.queue, writer: testDB.queue)

        try testDB.queue.write { db in
            try db.execute(sql: """
                INSERT INTO documents (id, source, title, word_count, last_opened_at, created_at)
                VALUES ('doc1', 'file', 'Test', 100, 0, 0)
            """)
        }

        let highlight = try store.createHighlight(
            documentId: "doc1", color: "yellow", textContent: "text",
            fromPos: 0, toPos: 4, prefixContext: nil, suffixContext: nil
        )
        _ = try store.createMarginNote(highlightId: highlight.id, content: "note")

        try store.deleteHighlight(id: highlight.id)

        let notes = try store.getMarginNotes(documentId: "doc1")
        #expect(notes.isEmpty)
    }
}

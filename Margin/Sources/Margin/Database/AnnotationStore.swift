import Foundation
import GRDB

/// CRUD operations for highlights and margin notes.
struct AnnotationStore {
    private let reader: DatabaseReader
    private let writer: DatabaseWriter

    init(reader: DatabaseReader? = nil, writer: DatabaseWriter? = nil) {
        self.reader = reader ?? DatabaseManager.shared.reader
        self.writer = writer ?? DatabaseManager.shared.writer
    }

    // MARK: - Highlights

    func getHighlights(documentId: String) throws -> [Highlight] {
        try reader.read { database in
            try Highlight
                .filter(Highlight.CodingKeys.documentId == documentId)
                .order(Highlight.CodingKeys.fromPos)
                .fetchAll(database)
        }
    }

    func createHighlight(
        documentId: String,
        color: String,
        textContent: String,
        fromPos: Int64,
        toPos: Int64,
        prefixContext: String?,
        suffixContext: String?
    ) throws -> Highlight {
        var highlight = Highlight.create(
            documentId: documentId,
            color: color,
            textContent: textContent,
            fromPos: fromPos,
            toPos: toPos,
            prefixContext: prefixContext,
            suffixContext: suffixContext
        )
        try writer.write { database in
            try highlight.insert(database)
            let now = Int64(Date().timeIntervalSince1970 * 1000)
            try database.execute(
                sql: "UPDATE documents SET last_opened_at = ? WHERE id = ?",
                arguments: [now, documentId]
            )
        }
        return highlight
    }

    func updateHighlightPosition(id: String, fromPos: Int64, toPos: Int64) throws {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        try writer.write { database in
            try database.execute(
                sql: "UPDATE highlights SET from_pos = ?, to_pos = ?, updated_at = ? WHERE id = ?",
                arguments: [fromPos, toPos, now, id]
            )
        }
    }

    func updateHighlightColor(id: String, color: String) throws {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        try writer.write { database in
            try database.execute(
                sql: "UPDATE highlights SET color = ?, updated_at = ? WHERE id = ?",
                arguments: [color, now, id]
            )
        }
    }

    func deleteHighlight(id: String) throws {
        try writer.write { database in
            let docId = try String.fetchOne(
                database,
                sql: "SELECT document_id FROM highlights WHERE id = ?",
                arguments: [id]
            )
            try database.execute(
                sql: "DELETE FROM highlights WHERE id = ?",
                arguments: [id]
            )
            if let docId {
                let now = Int64(Date().timeIntervalSince1970 * 1000)
                try database.execute(
                    sql: "UPDATE documents SET last_opened_at = ? WHERE id = ?",
                    arguments: [now, docId]
                )
            }
        }
    }

    // MARK: - Margin Notes

    func getMarginNotes(documentId: String) throws -> [MarginNote] {
        try reader.read { database in
            try MarginNote.fetchAll(database, sql: """
                SELECT mn.id, mn.highlight_id, mn.content, mn.created_at, mn.updated_at
                FROM margin_notes mn
                JOIN highlights h ON mn.highlight_id = h.id
                WHERE h.document_id = ?
                ORDER BY h.from_pos
            """, arguments: [documentId])
        }
    }

    func createMarginNote(highlightId: String, content: String) throws -> MarginNote {
        var note = MarginNote.create(highlightId: highlightId, content: content)
        try writer.write { database in
            try note.insert(database)
            // Touch parent document
            if let docId = try String.fetchOne(
                database,
                sql: "SELECT document_id FROM highlights WHERE id = ?",
                arguments: [highlightId]
            ) {
                let now = Int64(Date().timeIntervalSince1970 * 1000)
                try database.execute(
                    sql: "UPDATE documents SET last_opened_at = ? WHERE id = ?",
                    arguments: [now, docId]
                )
            }
        }
        return note
    }

    func updateMarginNote(id: String, content: String) throws {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        try writer.write { database in
            try database.execute(
                sql: "UPDATE margin_notes SET content = ?, updated_at = ? WHERE id = ?",
                arguments: [content, now, id]
            )
            // Touch parent document
            if let docId = try String.fetchOne(
                database,
                sql: """
                    SELECT h.document_id FROM margin_notes mn
                    JOIN highlights h ON mn.highlight_id = h.id
                    WHERE mn.id = ?
                """,
                arguments: [id]
            ) as String? {
                try database.execute(
                    sql: "UPDATE documents SET last_opened_at = ? WHERE id = ?",
                    arguments: [now, docId]
                )
            }
        }
    }

    func deleteMarginNote(id: String) throws {
        try writer.write { database in
            // Touch parent document
            if let docId = try String.fetchOne(
                database,
                sql: """
                    SELECT h.document_id FROM margin_notes mn
                    JOIN highlights h ON mn.highlight_id = h.id
                    WHERE mn.id = ?
                """,
                arguments: [id]
            ) as String? {
                let now = Int64(Date().timeIntervalSince1970 * 1000)
                try database.execute(
                    sql: "UPDATE documents SET last_opened_at = ? WHERE id = ?",
                    arguments: [now, docId]
                )
            }
            try database.execute(
                sql: "DELETE FROM margin_notes WHERE id = ?",
                arguments: [id]
            )
        }
    }
}

import Foundation
import GRDB

/// CRUD operations for documents.
struct DocumentStore {
    private var db: DatabaseManager { .shared }

    func getRecentDocuments(limit: Int = 20) throws -> [Document] {
        try db.reader.read { db in
            try Document
                .order(Document.CodingKeys.lastOpenedAt.desc)
                .limit(limit)
                .fetchAll(db)
        }
    }

    /// Insert or replace a document, preserving the existing ID when matched by file_path or keep_local_id.
    func upsertDocument(_ doc: inout Document) throws -> Document {
        try db.writer.write { database in
            // Look up existing by file_path or keep_local_id
            var existingId: String?
            if let fp = doc.filePath {
                existingId = try String.fetchOne(
                    database,
                    sql: "SELECT id FROM documents WHERE file_path = ?",
                    arguments: [fp]
                )
            } else if let klId = doc.keepLocalId {
                existingId = try String.fetchOne(
                    database,
                    sql: "SELECT id FROM documents WHERE keep_local_id = ?",
                    arguments: [klId]
                )
            }

            if let eid = existingId {
                doc.id = eid
            } else if doc.id.isEmpty {
                doc.id = UUID().uuidString
            }

            try doc.save(database)
            return doc
        }
    }

    func touchDocument(id: String) throws {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        try db.writer.write { database in
            try database.execute(
                sql: "UPDATE documents SET last_opened_at = ? WHERE id = ?",
                arguments: [now, id]
            )
        }
    }
}

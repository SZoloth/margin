import Foundation
import GRDB

struct CorrectionInput {
    let highlightId: String
    let originalText: String
    let prefixContext: String?
    let suffixContext: String?
    let extendedContext: String?
    let notes: [String]
    let highlightColor: String
}

struct CorrectionRecord: Identifiable {
    let id: String
    let originalText: String
    let notes: [String]
    let highlightColor: String
    let documentTitle: String?
    let documentId: String
    let createdAt: Int64
}

/// Persistence for correction records (exported annotation pairs).
struct CorrectionStore {
    private var db: DatabaseManager { .shared }

    func getAllCorrections(limit: Int = 200) throws -> [CorrectionRecord] {
        try db.reader.read { database in
            let rows = try Row.fetchAll(database, sql: """
                SELECT id, original_text, notes_json, highlight_color, document_title, document_id, created_at
                FROM corrections
                ORDER BY created_at DESC
                LIMIT ?
            """, arguments: [limit])

            return rows.compactMap { row -> CorrectionRecord? in
                let id: String = row["id"]
                let originalText: String = row["original_text"]
                let notesJson: String = row["notes_json"]
                let highlightColor: String = row["highlight_color"]
                let documentTitle: String? = row["document_title"]
                let documentId: String = row["document_id"]
                let createdAt: Int64 = row["created_at"]

                let notes = (try? JSONDecoder().decode(
                    [String].self,
                    from: notesJson.data(using: .utf8) ?? Data()
                )) ?? []

                return CorrectionRecord(
                    id: id,
                    originalText: originalText,
                    notes: notes,
                    highlightColor: highlightColor,
                    documentTitle: documentTitle,
                    documentId: documentId,
                    createdAt: createdAt
                )
            }
        }
    }

    func getCorrectionsCount() throws -> Int {
        try db.reader.read { database in
            try Int.fetchOne(database, sql: "SELECT COUNT(*) FROM corrections") ?? 0
        }
    }

    func persistCorrections(
        corrections: [CorrectionInput],
        documentId: String,
        documentTitle: String?,
        documentSource: String,
        documentPath: String?,
        exportDate: String
    ) throws -> String {
        let sessionId = UUID().uuidString
        let now = Int64(Date().timeIntervalSince1970 * 1000)

        try db.writer.write { database in
            for input in corrections {
                let id = UUID().uuidString
                let notesJson = (try? JSONEncoder().encode(input.notes))
                    .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"

                try database.execute(sql: """
                    INSERT INTO corrections
                        (id, highlight_id, document_id, session_id, original_text,
                         prefix_context, suffix_context, extended_context, notes_json,
                         document_title, document_source, document_path, category,
                         highlight_color, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(highlight_id) DO UPDATE SET
                        session_id = excluded.session_id,
                        original_text = excluded.original_text,
                        prefix_context = excluded.prefix_context,
                        suffix_context = excluded.suffix_context,
                        extended_context = excluded.extended_context,
                        notes_json = excluded.notes_json,
                        document_title = excluded.document_title,
                        document_source = excluded.document_source,
                        document_path = excluded.document_path,
                        highlight_color = excluded.highlight_color,
                        updated_at = excluded.updated_at
                """, arguments: [
                    id, input.highlightId, documentId, sessionId,
                    input.originalText, input.prefixContext, input.suffixContext,
                    input.extendedContext, notesJson, documentTitle, documentSource,
                    documentPath, nil as String?, input.highlightColor, now, now,
                ])
            }
        }

        // Also append to JSONL file
        appendToJSONL(
            corrections: corrections,
            documentId: documentId,
            documentTitle: documentTitle,
            documentSource: documentSource,
            documentPath: documentPath,
            sessionId: sessionId,
            exportDate: exportDate,
            now: now
        )

        return sessionId
    }

    private func appendToJSONL(
        corrections: [CorrectionInput],
        documentId: String,
        documentTitle: String?,
        documentSource: String,
        documentPath: String?,
        sessionId: String,
        exportDate: String,
        now: Int64
    ) {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let dir = home.appendingPathComponent(".margin/corrections")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let safeDate = exportDate.replacingOccurrences(
            of: "[^A-Za-z0-9._-]",
            with: "_",
            options: .regularExpression
        )
        let filePath = dir.appendingPathComponent("corrections-\(safeDate).jsonl")

        if !FileManager.default.fileExists(atPath: filePath.path) {
            FileManager.default.createFile(atPath: filePath.path, contents: nil)
        }
        guard let handle = try? FileHandle(forWritingTo: filePath) else { return }

        handle.seekToEndOfFile()
        writeRecords(to: handle, corrections: corrections, documentId: documentId,
                    documentTitle: documentTitle, documentSource: documentSource,
                    documentPath: documentPath, sessionId: sessionId, now: now)
        handle.closeFile()
    }

    private func writeRecords(
        to handle: FileHandle,
        corrections: [CorrectionInput],
        documentId: String,
        documentTitle: String?,
        documentSource: String,
        documentPath: String?,
        sessionId: String,
        now: Int64
    ) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys

        for input in corrections {
            let record: [String: Any] = [
                "highlight_id": input.highlightId,
                "session_id": sessionId,
                "original_text": input.originalText,
                "prefix_context": input.prefixContext as Any,
                "suffix_context": input.suffixContext as Any,
                "extended_context": input.extendedContext as Any,
                "notes": input.notes,
                "document_id": documentId,
                "document_title": documentTitle as Any,
                "document_source": documentSource,
                "document_path": documentPath as Any,
                "highlight_color": input.highlightColor,
                "exported_at": now,
            ]

            if let data = try? JSONSerialization.data(withJSONObject: record),
               var line = String(data: data, encoding: .utf8) {
                line += "\n"
                if let lineData = line.data(using: .utf8) {
                    handle.write(lineData)
                }
            }
        }
    }
}

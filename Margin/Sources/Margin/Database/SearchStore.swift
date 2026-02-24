import Foundation
import GRDB

struct SearchResult: Identifiable {
    let id: String // documentId
    let documentId: String
    let title: String
    let snippet: String
    let rank: Double
}

struct FileSearchResult: Identifiable {
    let id: String // path
    let path: String
    let filename: String
}

/// Full-text search using FTS5 + macOS Spotlight.
struct SearchStore {
    private var db: DatabaseManager { .shared }

    func indexDocument(documentId: String, title: String, content: String) throws {
        try db.writer.write { database in
            try database.execute(
                sql: "DELETE FROM documents_fts WHERE document_id = ?",
                arguments: [documentId]
            )
            try database.execute(
                sql: "INSERT INTO documents_fts (document_id, title, content) VALUES (?, ?, ?)",
                arguments: [documentId, title, content]
            )
        }
    }

    func searchDocuments(query: String, limit: Int = 20) throws -> [SearchResult] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return [] }

        // Escape FTS5 special characters to prevent query syntax errors
        let sanitized = query
            .replacingOccurrences(of: "\"", with: "\"\"")

        return try db.reader.read { database in
            let rows = try Row.fetchAll(database, sql: """
                SELECT document_id, title,
                       snippet(documents_fts, 1, '<mark>', '</mark>', '\u{2026}', 32) as snippet,
                       rank
                FROM documents_fts
                WHERE documents_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            """, arguments: ["\"\(sanitized)\"", limit])

            return rows.map { row in
                SearchResult(
                    id: row["document_id"],
                    documentId: row["document_id"],
                    title: row["title"],
                    snippet: row["snippet"],
                    rank: row["rank"]
                )
            }
        }
    }

    func removeDocumentIndex(documentId: String) throws {
        try db.writer.write { database in
            try database.execute(
                sql: "DELETE FROM documents_fts WHERE document_id = ?",
                arguments: [documentId]
            )
        }
    }

    /// Search for markdown files on disk using macOS Spotlight (mdfind).
    func searchFilesOnDisk(query: String, limit: Int = 20) -> [FileSearchResult] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return [] }

        // Escape special characters to prevent mdfind predicate injection
        let sanitized = query
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "*", with: "")

        let mdfindQuery = """
            (kMDItemFSName == '*.md' || kMDItemFSName == '*.markdown') && \
            (kMDItemDisplayName == '*\(sanitized)*'cdw || kMDItemTextContent == '*\(sanitized)*'cdw)
        """

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/mdfind")
        process.arguments = [mdfindQuery]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return []
        }

        guard process.terminationStatus == 0 else { return [] }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8) ?? ""

        return output
            .components(separatedBy: "\n")
            .filter { !$0.isEmpty }
            .filter { path in
                !path.split(separator: "/").contains { $0.hasPrefix(".") && $0.count > 1 }
            }
            .prefix(limit)
            .map { path in
                let url = URL(fileURLWithPath: path)
                let filename = url.deletingPathExtension().lastPathComponent
                return FileSearchResult(id: path, path: path, filename: filename)
            }
    }
}

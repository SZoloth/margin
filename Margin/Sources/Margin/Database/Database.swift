import Foundation
import GRDB

/// Central database manager for Margin.
/// Stores documents, highlights, margin notes, corrections, and tabs in SQLite.
final class DatabaseManager {
    static let shared = DatabaseManager()

    private var dbPool: DatabasePool?

    private init() {}

    /// Path to the database file: ~/.margin/margin.db
    private var dbPath: String {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let marginDir = home.appendingPathComponent(".margin")
        try? FileManager.default.createDirectory(at: marginDir, withIntermediateDirectories: true)
        return marginDir.appendingPathComponent("margin.db").path
    }

    /// Initialize the database, creating tables if needed.
    func initialize() throws {
        var config = Configuration()
        config.foreignKeysEnabled = true
        config.prepareDatabase { db in
            try db.execute(sql: "PRAGMA journal_mode=WAL")
        }

        dbPool = try DatabasePool(path: dbPath, configuration: config)
        try migrate()
    }

    var reader: DatabaseReader {
        guard let pool = dbPool else { fatalError("Database not initialized") }
        return pool
    }

    var writer: DatabaseWriter {
        guard let pool = dbPool else { fatalError("Database not initialized") }
        return pool
    }

    private func migrate() throws {
        guard let pool = dbPool else { return }
        let migrator = Self.migrator()
        try migrator.migrate(pool)
    }

    /// Shared migrator for production and test use (in-memory databases).
    static func migrator() -> DatabaseMigrator {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_create_tables") { db in
            try db.create(table: "documents", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("source", .text).notNull()
                t.column("file_path", .text).unique()
                t.column("keep_local_id", .text).unique()
                t.column("title", .text)
                t.column("author", .text)
                t.column("url", .text)
                t.column("word_count", .integer).defaults(to: 0)
                t.column("last_opened_at", .integer).notNull()
                t.column("created_at", .integer).notNull()
            }

            try db.create(table: "highlights", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("document_id", .text).notNull()
                    .references("documents", onDelete: .cascade)
                t.column("color", .text).notNull().defaults(to: "yellow")
                t.column("text_content", .text).notNull()
                t.column("from_pos", .integer).notNull()
                t.column("to_pos", .integer).notNull()
                t.column("prefix_context", .text)
                t.column("suffix_context", .text)
                t.column("created_at", .integer).notNull()
                t.column("updated_at", .integer).notNull()
            }

            try db.create(table: "margin_notes", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("highlight_id", .text).notNull()
                    .references("highlights", onDelete: .cascade)
                t.column("content", .text).notNull()
                t.column("created_at", .integer).notNull()
                t.column("updated_at", .integer).notNull()
            }

            try db.create(
                index: "idx_highlights_document",
                on: "highlights",
                columns: ["document_id"],
                ifNotExists: true
            )
            try db.create(
                index: "idx_margin_notes_highlight",
                on: "margin_notes",
                columns: ["highlight_id"],
                ifNotExists: true
            )

            try db.create(table: "corrections", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("highlight_id", .text).notNull().unique()
                    .references("highlights", onDelete: .cascade)
                t.column("document_id", .text).notNull()
                    .references("documents", onDelete: .cascade)
                t.column("session_id", .text).notNull()
                t.column("original_text", .text).notNull()
                t.column("prefix_context", .text)
                t.column("suffix_context", .text)
                t.column("extended_context", .text)
                t.column("notes_json", .text).notNull()
                t.column("document_title", .text)
                t.column("document_source", .text).notNull()
                t.column("document_path", .text)
                t.column("category", .text)
                t.column("highlight_color", .text).notNull()
                t.column("created_at", .integer).notNull()
                t.column("updated_at", .integer).notNull()
            }

            try db.create(
                index: "idx_corrections_document",
                on: "corrections",
                columns: ["document_id"],
                ifNotExists: true
            )
            try db.create(
                index: "idx_corrections_session",
                on: "corrections",
                columns: ["session_id"],
                ifNotExists: true
            )

            try db.create(table: "open_tabs", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("document_id", .text).notNull()
                    .references("documents", onDelete: .cascade)
                t.column("tab_order", .integer).notNull()
                t.column("is_active", .integer).notNull().defaults(to: 0)
                t.column("created_at", .integer).notNull()
            }
        }

        migrator.registerMigration("v2_fts") { db in
            try db.execute(sql: """
                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
                USING fts5(title, content, document_id UNINDEXED)
            """)
        }

        return migrator
    }
}

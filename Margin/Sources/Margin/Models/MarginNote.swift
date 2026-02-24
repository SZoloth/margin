import Foundation
import GRDB

struct MarginNote: Identifiable, Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "margin_notes"

    var id: String
    var highlightId: String
    var content: String
    var createdAt: Int64
    var updatedAt: Int64

    enum CodingKeys: String, CodingKey, ColumnExpression {
        case id
        case highlightId = "highlight_id"
        case content
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    static func create(highlightId: String, content: String) -> MarginNote {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        return MarginNote(
            id: UUID().uuidString,
            highlightId: highlightId,
            content: content,
            createdAt: now,
            updatedAt: now
        )
    }
}

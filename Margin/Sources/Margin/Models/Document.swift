import Foundation
import GRDB

struct Document: Identifiable, Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "documents"

    var id: String
    var source: String  // "file" or "keep-local"
    var filePath: String?
    var keepLocalId: String?
    var title: String?
    var author: String?
    var url: String?
    var wordCount: Int64
    var lastOpenedAt: Int64
    var createdAt: Int64

    enum CodingKeys: String, CodingKey, ColumnExpression {
        case id
        case source
        case filePath = "file_path"
        case keepLocalId = "keep_local_id"
        case title
        case author
        case url
        case wordCount = "word_count"
        case lastOpenedAt = "last_opened_at"
        case createdAt = "created_at"
    }

    var isFile: Bool { source == "file" }
    var isKeepLocal: Bool { source == "keep-local" }

    var displayTitle: String { title ?? "Untitled" }
}

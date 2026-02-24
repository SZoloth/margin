import Foundation
import GRDB

public struct Document: Identifiable, Codable, Equatable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "documents"

    public var id: String
    public var source: String  // "file" or "keep-local"
    public var filePath: String?
    public var keepLocalId: String?
    public var title: String?
    public var author: String?
    public var url: String?
    public var wordCount: Int64
    public var lastOpenedAt: Int64
    public var createdAt: Int64

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

    public var isFile: Bool { source == "file" }
    public var isKeepLocal: Bool { source == "keep-local" }

    public var displayTitle: String { title ?? "Untitled" }
}

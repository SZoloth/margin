import Foundation
import GRDB

public struct Highlight: Identifiable, Codable, Equatable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "highlights"

    public var id: String
    public var documentId: String
    public var color: String
    public var textContent: String
    public var fromPos: Int64
    public var toPos: Int64
    public var prefixContext: String?
    public var suffixContext: String?
    public var createdAt: Int64
    public var updatedAt: Int64

    enum CodingKeys: String, CodingKey, ColumnExpression {
        case id
        case documentId = "document_id"
        case color
        case textContent = "text_content"
        case fromPos = "from_pos"
        case toPos = "to_pos"
        case prefixContext = "prefix_context"
        case suffixContext = "suffix_context"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    static func create(
        documentId: String,
        color: String,
        textContent: String,
        fromPos: Int64,
        toPos: Int64,
        prefixContext: String?,
        suffixContext: String?
    ) -> Highlight {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        return Highlight(
            id: UUID().uuidString,
            documentId: documentId,
            color: color,
            textContent: textContent,
            fromPos: fromPos,
            toPos: toPos,
            prefixContext: prefixContext,
            suffixContext: suffixContext,
            createdAt: now,
            updatedAt: now
        )
    }
}

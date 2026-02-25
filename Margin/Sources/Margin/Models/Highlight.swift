import Foundation
import GRDB

struct Highlight: Identifiable, Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "highlights"

    var id: String
    var documentId: String
    var color: String
    var textContent: String
    var fromPos: Int64
    var toPos: Int64
    var prefixContext: String?
    var suffixContext: String?
    var anchorHeadingPath: String?
    var createdAt: Int64
    var updatedAt: Int64

    enum CodingKeys: String, CodingKey, ColumnExpression {
        case id
        case documentId = "document_id"
        case color
        case textContent = "text_content"
        case fromPos = "from_pos"
        case toPos = "to_pos"
        case prefixContext = "prefix_context"
        case suffixContext = "suffix_context"
        case anchorHeadingPath = "anchor_heading_path"
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
        suffixContext: String?,
        anchorHeadingPath: String? = nil
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
            anchorHeadingPath: anchorHeadingPath,
            createdAt: now,
            updatedAt: now
        )
    }
}

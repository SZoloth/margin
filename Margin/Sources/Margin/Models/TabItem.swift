import Foundation
import GRDB

struct TabItem: Identifiable, Codable, Equatable {
    var id: String
    var documentId: String
    var title: String
    var isDirty: Bool
    var tabOrder: Int

    static func create(documentId: String, title: String, tabOrder: Int) -> TabItem {
        TabItem(
            id: UUID().uuidString,
            documentId: documentId,
            title: title,
            isDirty: false,
            tabOrder: tabOrder
        )
    }
}

/// Database-persisted tab record
struct PersistedTab: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "open_tabs"

    var id: String
    var documentId: String
    var tabOrder: Int64
    var isActive: Bool
    var createdAt: Int64

    enum CodingKeys: String, CodingKey, ColumnExpression {
        case id
        case documentId = "document_id"
        case tabOrder = "tab_order"
        case isActive = "is_active"
        case createdAt = "created_at"
    }
}

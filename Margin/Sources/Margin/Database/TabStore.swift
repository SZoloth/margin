import Foundation
import GRDB

/// Persistence for open tabs across app restarts.
struct TabStore {
    private var db: DatabaseManager { .shared }

    func getOpenTabs() throws -> [PersistedTab] {
        try db.reader.read { database in
            try PersistedTab
                .order(PersistedTab.CodingKeys.tabOrder)
                .fetchAll(database)
        }
    }

    func saveOpenTabs(_ tabs: [PersistedTab]) throws {
        try db.writer.write { database in
            try database.execute(sql: "DELETE FROM open_tabs")
            for tab in tabs {
                try tab.insert(database)
            }
        }
    }
}

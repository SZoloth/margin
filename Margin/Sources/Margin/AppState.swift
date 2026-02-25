import Foundation
import SwiftUI
import Combine

/// Central application state — replaces all React hooks from the Tauri version.
/// Owns document, annotation, tab, and search state.
@MainActor
final class AppState: ObservableObject {
    // MARK: - Services
    let fileService = FileService()
    let fileWatcher = FileWatcher()
    let keepLocal = KeepLocalService()
    var settings = AppSettings()
    private let documentStore = DocumentStore()
    private let annotationStore = AnnotationStore()
    private let searchStore = SearchStore()
    private let tabStore = TabStore()
    private let exportService = ExportService()

    // MARK: - Document State
    @Published var currentDoc: Document?
    @Published var recentDocs: [Document] = []
    @Published var content: String = ""
    @Published var filePath: String?
    @Published var isDirty = false
    @Published var isLoading = false

    // MARK: - Annotation State
    @Published var highlights: [Highlight] = []
    @Published var marginNotes: [MarginNote] = []
    @Published var annotationsLoaded = false

    // MARK: - Tab State
    @Published var tabs: [TabItem] = []
    @Published var activeTabId: String?
    @Published var pendingCloseTabId: String?

    // MARK: - Search State
    @Published var searchQuery = ""
    @Published var fileResults: [FileSearchResult] = []
    @Published var isSearching = false

    // MARK: - UI State
    @Published var focusHighlightId: String?
    @Published var showExportPopover = false
    @Published var showSettings = false
    @Published var sidebarOpen = true

    // MARK: - Shrink Guard
    @Published var shrinkGuardAlert: ShrinkGuardAlert?

    struct ShrinkGuardAlert: Identifiable {
        let id = UUID()
        let removedPercent: Int
        let pendingPath: String
        let pendingContent: String
    }

    // MARK: - Tab Cache
    private var tabCache: [String: TabSnapshot] = [:]

    struct TabSnapshot {
        let document: Document?
        let content: String
        let filePath: String?
        let isDirty: Bool
        let highlights: [Highlight]
        let marginNotes: [MarginNote]
        let annotationsLoaded: Bool
        let scrollOffset: CGFloat
    }

    // MARK: - Autosave
    private var autosaveTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Diff Normalization
    private var lastSavedContent: String = ""

    // MARK: - Initialize

    func initialize() {
        do {
            try DatabaseManager.shared.initialize()
            loadRecentDocs()
            restoreTabs()
        } catch {
            print("Failed to initialize database: \(error)")
        }

        // Set up file watcher callback
        fileWatcher.onFileChanged = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self, self.filePath == path else { return }
                if let newContent = try? self.fileService.readFile(path: path) {
                    // External save = new baseline
                    self.lastSavedContent = newContent
                    // Only update and re-anchor if meaningfully different
                    if hasMeaningfulDiff(newContent, self.content) {
                        self.content = newContent
                        if let docId = self.currentDoc?.id {
                            self.loadAnnotations(for: docId)
                        }
                    }
                    // Don't mark dirty — this is an external change
                }
            }
        }

        // Health check for keep-local
        Task { await keepLocal.checkHealth() }
        Task { await keepLocal.loadItems() }
    }

    // MARK: - Document Operations

    func openFile() {
        guard let path = fileService.openFileDialog() else { return }
        Task { await openFilePath(path) }
    }

    func openFilePath(_ path: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let fileContent = try fileService.readFile(path: path)
            let title = basename(path)
            let now = Int64(Date().timeIntervalSince1970 * 1000)

            var doc = Document(
                id: UUID().uuidString,
                source: "file",
                filePath: path,
                keepLocalId: nil,
                title: title,
                author: nil,
                url: nil,
                wordCount: countWords(fileContent),
                lastOpenedAt: now,
                createdAt: now
            )

            doc = try documentStore.upsertDocument(&doc)

            snapshotActiveTab()
            setDocument(doc, content: fileContent, filePath: path)
            openTab(for: doc)
            loadAnnotations(for: doc.id)
            indexDocument(doc, content: fileContent)
            loadRecentDocs()
            fileWatcher.watch(path: path)
        } catch {
            print("Failed to open file: \(error)")
        }
    }

    func openRecentDocument(_ recentDoc: Document, newTab: Bool = true) async {
        if recentDoc.isFile, let path = recentDoc.filePath {
            isLoading = true
            defer { isLoading = false }

            do {
                let fileContent = try fileService.readFile(path: path)
                var updated = recentDoc
                updated.wordCount = countWords(fileContent)

                _ = try documentStore.upsertDocument(&updated)

                snapshotActiveTab()
                setDocument(updated, content: fileContent, filePath: path)

                if newTab {
                    openTab(for: updated)
                } else {
                    replaceActiveTab(with: updated)
                }

                loadAnnotations(for: updated.id)
                loadRecentDocs()
                fileWatcher.watch(path: path)
            } catch {
                print("Failed to open recent file: \(error)")
            }
        }
    }

    func openKeepLocalArticle(_ item: KeepLocalItem) async {
        do {
            let markdown = try await keepLocal.getContent(itemId: item.id)
            let now = Int64(Date().timeIntervalSince1970 * 1000)

            var doc = Document(
                id: UUID().uuidString,
                source: "keep-local",
                filePath: nil,
                keepLocalId: item.id,
                title: item.title,
                author: item.author,
                url: item.url,
                wordCount: item.wordCount,
                lastOpenedAt: now,
                createdAt: now
            )

            doc = try documentStore.upsertDocument(&doc)

            snapshotActiveTab()
            setDocument(doc, content: markdown, filePath: nil)
            openTab(for: doc)
            loadAnnotations(for: doc.id)
            indexDocument(doc, content: markdown)
            loadRecentDocs()
            fileWatcher.unwatch()
        } catch {
            print("Failed to open keep-local article: \(error)")
        }
    }

    func saveCurrentFile() async {
        guard isDirty else { return }

        // Keep-local articles have no file path — keep dirty so unsaved-changes guard triggers
        guard let path = filePath else {
            return
        }

        // Shrink guard check
        let (suspicious, removedPercent) = shouldRejectSuspiciousShrink(
            existing: lastSavedContent,
            incoming: content
        )
        if suspicious {
            shrinkGuardAlert = ShrinkGuardAlert(
                removedPercent: removedPercent,
                pendingPath: path,
                pendingContent: content
            )
            return
        }

        await performSave(path: path, content: content)
    }

    /// Execute the actual file write + state update. Called directly by shrink guard "Save Anyway".
    func performSave(path: String, content: String) async {
        do {
            try fileService.saveFile(path: path, content: content)
            isDirty = false
            lastSavedContent = content
            syncDirtyToActiveTab()

            if var doc = currentDoc {
                doc.wordCount = countWords(content)
                doc.lastOpenedAt = Int64(Date().timeIntervalSince1970 * 1000)
                _ = try documentStore.upsertDocument(&doc)
                currentDoc = doc
                loadRecentDocs()
            }
        } catch {
            print("Failed to save file: \(error)")
        }
    }

    func renameDocFile(_ doc: Document, newName: String) async {
        guard let oldPath = doc.filePath else { return }
        do {
            let newPath = try fileService.renameFile(oldPath: oldPath, newName: newName)
            let newTitle = basename(newPath)

            // Update database
            try await DatabaseManager.shared.writer.write { database in
                try database.execute(
                    sql: "UPDATE documents SET file_path = ?, title = ? WHERE file_path = ?",
                    arguments: [newPath, newTitle, oldPath]
                )
            }

            if currentDoc?.id == doc.id {
                currentDoc?.filePath = newPath
                currentDoc?.title = newTitle
                filePath = newPath
            }
            loadRecentDocs()
        } catch {
            print("Failed to rename file: \(error)")
        }
    }

    // MARK: - Content Updates

    func updateContent(_ newContent: String) {
        content = newContent
        isDirty = hasMeaningfulDiff(newContent, lastSavedContent)
        syncDirtyToActiveTab()
        if isDirty {
            scheduleAutosave()
        }
    }

    private func setDocument(_ doc: Document, content: String, filePath: String?) {
        self.currentDoc = doc
        self.content = content
        self.filePath = filePath
        self.isDirty = false
        self.lastSavedContent = content
        syncDirtyToActiveTab()
    }

    private func scheduleAutosave() {
        guard settings.autosave else { return }
        autosaveTimer?.invalidate()
        autosaveTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.saveCurrentFile()
            }
        }
    }

    // MARK: - Annotations

    func loadAnnotations(for documentId: String) {
        annotationsLoaded = false
        do {
            highlights = try annotationStore.getHighlights(documentId: documentId)
            marginNotes = try annotationStore.getMarginNotes(documentId: documentId)
            annotationsLoaded = true
        } catch {
            print("Failed to load annotations: \(error)")
        }
    }

    func createHighlight(
        color: String,
        textContent: String,
        fromPos: Int,
        toPos: Int,
        prefixContext: String?,
        suffixContext: String?
    ) async -> Highlight? {
        guard let docId = currentDoc?.id else { return nil }

        // Extract heading path for anchor recovery
        let anchor = createAnchor(fullText: content, from: fromPos, to: toPos)
        let headingPathJSON: String? = {
            guard !anchor.headingPath.isEmpty else { return nil }
            guard let data = try? JSONEncoder().encode(anchor.headingPath),
                  let str = String(data: data, encoding: .utf8) else { return nil }
            return str
        }()

        do {
            let highlight = try annotationStore.createHighlight(
                documentId: docId,
                color: color,
                textContent: textContent,
                fromPos: Int64(fromPos),
                toPos: Int64(toPos),
                prefixContext: prefixContext,
                suffixContext: suffixContext,
                anchorHeadingPath: headingPathJSON
            )
            highlights.append(highlight)
            loadRecentDocs()
            return highlight
        } catch {
            print("Failed to create highlight: \(error)")
            return nil
        }
    }

    func deleteHighlight(_ id: String) async {
        do {
            try annotationStore.deleteHighlight(id: id)
            highlights.removeAll { $0.id == id }
            marginNotes.removeAll { $0.highlightId == id }
            focusHighlightId = nil
            loadRecentDocs()
        } catch {
            print("Failed to delete highlight: \(error)")
        }
    }

    func createMarginNote(highlightId: String, content: String) async -> MarginNote? {
        do {
            let note = try annotationStore.createMarginNote(
                highlightId: highlightId,
                content: content
            )
            marginNotes.append(note)
            scheduleAutosave()
            return note
        } catch {
            print("Failed to create margin note: \(error)")
            return nil
        }
    }

    func updateMarginNote(id: String, content: String) async {
        do {
            try annotationStore.updateMarginNote(id: id, content: content)
            if let idx = marginNotes.firstIndex(where: { $0.id == id }) {
                marginNotes[idx].content = content
                marginNotes[idx].updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
            }
            scheduleAutosave()
        } catch {
            print("Failed to update margin note: \(error)")
        }
    }

    func deleteMarginNote(id: String) async {
        do {
            try annotationStore.deleteMarginNote(id: id)
            marginNotes.removeAll { $0.id == id }
            scheduleAutosave()
        } catch {
            print("Failed to delete margin note: \(error)")
        }
    }

    // MARK: - Tab Management

    func openTab(for doc: Document) {
        // Check if already open
        if let existing = tabs.first(where: { $0.documentId == doc.id }) {
            activeTabId = existing.id
            return
        }

        let tab = TabItem.create(
            documentId: doc.id,
            title: doc.displayTitle,
            tabOrder: tabs.count
        )
        tabs.append(tab)
        activeTabId = tab.id
        persistTabs()
    }

    func replaceActiveTab(with doc: Document) {
        guard let activeIdx = tabs.firstIndex(where: { $0.id == activeTabId }) else {
            openTab(for: doc)
            return
        }
        // Remove old cache
        if let oldTabId = activeTabId {
            tabCache.removeValue(forKey: oldTabId)
        }
        tabs[activeIdx] = TabItem(
            id: tabs[activeIdx].id,
            documentId: doc.id,
            title: doc.displayTitle,
            isDirty: false,
            tabOrder: activeIdx
        )
        persistTabs()
    }

    func switchTab(_ tabId: String) {
        guard tabId != activeTabId else { return }
        snapshotActiveTab()
        activeTabId = tabId

        if let cached = tabCache[tabId] {
            restoreFromSnapshot(cached)
        } else if let tab = tabs.first(where: { $0.id == tabId }),
                  let doc = recentDocs.first(where: { $0.id == tab.documentId }) {
            Task { await openRecentDocument(doc, newTab: false) }
        }
    }

    func closeTab(_ tabId: String) {
        let tab = tabs.first(where: { $0.id == tabId })
        if tab?.isDirty == true {
            pendingCloseTabId = tabId
            return
        }
        forceCloseTab(tabId)
    }

    func forceCloseTab(_ tabId: String) {
        tabs.removeAll { $0.id == tabId }
        tabCache.removeValue(forKey: tabId)
        pendingCloseTabId = nil

        if activeTabId == tabId {
            if let next = tabs.last {
                switchTab(next.id)
            } else {
                activeTabId = nil
                currentDoc = nil
                content = ""
                filePath = nil
                isDirty = false
                lastSavedContent = ""
                highlights = []
                marginNotes = []
                annotationsLoaded = false
                fileWatcher.unwatch()
            }
        }
        persistTabs()
    }

    func cancelCloseTab() {
        pendingCloseTabId = nil
    }

    func reorderTabs(from: Int, to: Int) {
        tabs.move(fromOffsets: IndexSet(integer: from), toOffset: to)
        for i in tabs.indices { tabs[i].tabOrder = i }
        persistTabs()
    }

    private func snapshotActiveTab() {
        guard let tabId = activeTabId else { return }
        tabCache[tabId] = TabSnapshot(
            document: currentDoc,
            content: content,
            filePath: filePath,
            isDirty: isDirty,
            highlights: highlights,
            marginNotes: marginNotes,
            annotationsLoaded: annotationsLoaded,
            scrollOffset: 0 // TODO: capture from scroll view
        )
    }

    private func restoreFromSnapshot(_ snapshot: TabSnapshot) {
        currentDoc = snapshot.document
        content = snapshot.content
        filePath = snapshot.filePath
        isDirty = snapshot.isDirty
        lastSavedContent = snapshot.isDirty ? "" : snapshot.content
        highlights = snapshot.highlights
        marginNotes = snapshot.marginNotes
        annotationsLoaded = snapshot.annotationsLoaded
        focusHighlightId = nil

        if let path = snapshot.filePath {
            fileWatcher.watch(path: path)
        } else {
            fileWatcher.unwatch()
        }
    }

    private func persistTabs() {
        let persisted = tabs.enumerated().map { idx, tab in
            PersistedTab(
                id: tab.id,
                documentId: tab.documentId,
                tabOrder: Int64(idx),
                isActive: tab.id == activeTabId,
                createdAt: Int64(Date().timeIntervalSince1970 * 1000)
            )
        }
        try? tabStore.saveOpenTabs(persisted)
    }

    private func restoreTabs() {
        guard let persisted = try? tabStore.getOpenTabs() else { return }
        tabs = persisted.map { p in
            let title = recentDocs.first(where: { $0.id == p.documentId })?.displayTitle ?? "Untitled"
            return TabItem(
                id: p.id,
                documentId: p.documentId,
                title: title,
                isDirty: false,
                tabOrder: Int(p.tabOrder)
            )
        }
        if let active = persisted.first(where: { $0.isActive }) {
            activeTabId = active.id
            // Load the active tab's content
            if let doc = recentDocs.first(where: { $0.id == active.documentId }) {
                Task { await openRecentDocument(doc, newTab: false) }
            }
        }
    }

    // MARK: - Search

    func search(_ query: String) {
        searchQuery = query
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            fileResults = []
            isSearching = false
            return
        }
        isSearching = true
        // Spotlight search runs synchronously but is fast
        fileResults = searchStore.searchFilesOnDisk(query: query)
        isSearching = false
    }

    private func indexDocument(_ doc: Document, content: String) {
        try? searchStore.indexDocument(
            documentId: doc.id,
            title: doc.displayTitle,
            content: content
        )
    }

    // MARK: - Export

    func exportAnnotations() -> ExportService.ExportResult {
        guard let doc = currentDoc else {
            return ExportService.ExportResult(
                highlightCount: 0, noteCount: 0, snippets: [],
                correctionsSaved: false, correctionsFile: ""
            )
        }

        let markdown = exportService.formatAnnotationsMarkdown(
            document: doc,
            highlights: highlights,
            marginNotes: marginNotes,
            fullText: content
        )
        exportService.copyToClipboard(markdown)

        let snippets = highlights.prefix(3).map { h in
            h.textContent.count > 60
                ? String(h.textContent.prefix(57)) + "..."
                : h.textContent
        }

        return ExportService.ExportResult(
            highlightCount: highlights.count,
            noteCount: marginNotes.count,
            snippets: Array(snippets),
            correctionsSaved: false,
            correctionsFile: ""
        )
    }

    // MARK: - Helpers

    func loadRecentDocs() {
        recentDocs = (try? documentStore.getRecentDocuments()) ?? []
    }

    func notesForHighlight(_ highlightId: String) -> [MarginNote] {
        marginNotes.filter { $0.highlightId == highlightId }
    }

    /// Keep the active TabItem.isDirty in sync with global isDirty.
    private func syncDirtyToActiveTab() {
        guard let tabId = activeTabId,
              let idx = tabs.firstIndex(where: { $0.id == tabId }) else { return }
        tabs[idx].isDirty = isDirty
    }
}

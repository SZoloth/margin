import Foundation
import SwiftUI
import Combine

/// Central application state — replaces all React hooks from the Tauri version.
/// Owns document, annotation, tab, and search state.
@MainActor
public final class AppState: ObservableObject {
    // MARK: - Services
    let fileService = FileService()
    let fileWatcher = FileWatcher()
    let keepLocal = KeepLocalService()
    public var settings = AppSettings()
    private let documentStore = DocumentStore()
    private let annotationStore = AnnotationStore()
    private let searchStore = SearchStore()
    private let tabStore = TabStore()
    private let exportService = ExportService()
    private let correctionStore = CorrectionStore()

    // MARK: - Document State
    @Published public var currentDoc: Document?
    @Published var recentDocs: [Document] = []
    @Published var content: String = ""
    @Published var filePath: String?
    @Published var isDirty = false
    @Published var isLoading = false

    // MARK: - Annotation State
    @Published public var highlights: [Highlight] = []
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

    // MARK: - Highlight Positions (scroll bridge for margin rail)
    @Published var visibleHighlightPositions: [String: HighlightPosition] = [:]

    // MARK: - UI State
    @Published var focusHighlightId: String?
    @Published var focusHighlightRect: CGRect = .zero
    @Published public var showExportPopover = false
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

    // MARK: - Selection State (for floating toolbar)
    @Published public var selectionRange: NSRange?
    @Published var selectionRect: CGRect = .zero
    @Published var selectionText: String = ""
    @Published var clearEditorSelection = false

    // MARK: - Table of Contents
    @Published var headings: [TOCEntry] = []
    @Published var scrollToOffset: Int?
    private var tocTask: Task<Void, Never>?

    // MARK: - Undo State
    @Published var pendingUndo: UndoAction?
    private var undoTimer: Timer?

    // MARK: - Error State
    @Published var errorMessage: String?
    private var errorTimer: Timer?

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
    private var searchTask: Task<Void, Never>?

    public init() {}

    // MARK: - Diff Normalization
    private var lastSavedContent: String = ""

    // MARK: - Initialize

    public func initialize() {
        Task.detached {
            do {
                try DatabaseManager.shared.initialize()
            } catch {
                print("Failed to initialize database: \(error)")
                return
            }
            await MainActor.run {
                self.loadRecentDocs()
                self.restoreTabs()
            }
        }

        // Forward AppSettings changes so SwiftUI views re-render when settings change
        settings.objectWillChange.sink { [weak self] in
            self?.objectWillChange.send()
        }.store(in: &cancellables)

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

    public func openFile() {
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
            showError("Couldn't open file")
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
                showError("Couldn't open file")
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
            showError("Couldn't open article")
        }
    }

    public func saveCurrentFile() async {
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
            showError("Couldn't save file")
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
            showError("Couldn't rename file")
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
        extractHeadings()
    }

    private func setDocument(_ doc: Document, content: String, filePath: String?) {
        self.currentDoc = doc
        self.content = content
        self.filePath = filePath
        self.isDirty = false
        self.lastSavedContent = content
        syncDirtyToActiveTab()
        extractHeadings()
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
            var loaded = try annotationStore.getHighlights(documentId: documentId)

            // Re-anchor highlights against current document content
            if !content.isEmpty {
                for i in loaded.indices {
                    let h = loaded[i]
                    let anchor = TextAnchor(
                        text: h.textContent,
                        prefix: h.prefixContext ?? "",
                        suffix: h.suffixContext ?? "",
                        from: Int(h.fromPos),
                        to: Int(h.toPos)
                    )
                    let result = resolveAnchor(fullText: content, anchor: anchor)
                    if result.from != Int(h.fromPos) || result.to != Int(h.toPos) {
                        if result.confidence != .orphaned {
                            loaded[i].fromPos = Int64(result.from)
                            loaded[i].toPos = Int64(result.to)
                            do {
                                try annotationStore.updateHighlightPosition(
                                    id: h.id,
                                    fromPos: Int64(result.from),
                                    toPos: Int64(result.to)
                                )
                            } catch {
                                print("Failed to persist re-anchored position for \(h.id): \(error)")
                            }
                        }
                    }
                }
            }

            highlights = loaded
            marginNotes = try annotationStore.getMarginNotes(documentId: documentId)
            annotationsLoaded = true
        } catch {
            showError("Couldn't load annotations")
        }
    }

    func createHighlight(
        color: String,
        textContent: String,
        fromPos: Int,
        toPos: Int
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
                prefixContext: anchor.prefix,
                suffixContext: anchor.suffix,
                anchorHeadingPath: headingPathJSON
            )
            highlights.append(highlight)
            loadRecentDocs()
            return highlight
        } catch {
            showError("Couldn't save highlight")
            return nil
        }
    }

    func updateHighlightColor(id: String, color: String) async {
        do {
            try annotationStore.updateHighlightColor(id: id, color: color)
            if let idx = highlights.firstIndex(where: { $0.id == id }) {
                highlights[idx].color = color
            }
        } catch {
            showError("Couldn't update highlight")
        }
    }

    func deleteHighlight(_ id: String) async {
        guard let highlight = highlights.first(where: { $0.id == id }) else { return }
        let savedNotes = marginNotes.filter { $0.highlightId == id }

        do {
            try annotationStore.deleteHighlight(id: id)
            highlights.removeAll { $0.id == id }
            marginNotes.removeAll { $0.highlightId == id }
            focusHighlightId = nil
            loadRecentDocs()

            // Commit any pending undo before setting a new one
            commitPendingUndo()

            // Capture content snapshot to validate offsets haven't drifted
            let contentSnapshot = self.content

            pendingUndo = UndoAction(
                message: "Highlight deleted",
                onUndo: { [weak self] in
                    Task { @MainActor [weak self] in
                        guard let self else { return }
                        // Validate content hasn't changed — stale offsets could crash createAnchor
                        let fromPos = Int(highlight.fromPos)
                        let toPos = Int(highlight.toPos)
                        let nsContent = self.content as NSString
                        guard self.content == contentSnapshot,
                              fromPos >= 0, toPos > fromPos,
                              toPos <= nsContent.length else {
                            print("Undo skipped: content changed since deletion")
                            return
                        }
                        if let restored = await self.createHighlight(
                            color: highlight.color,
                            textContent: highlight.textContent,
                            fromPos: fromPos,
                            toPos: toPos
                        ) {
                            for note in savedNotes {
                                _ = await self.createMarginNote(
                                    highlightId: restored.id,
                                    content: note.content
                                )
                            }
                        }
                    }
                }
            )

            undoTimer?.invalidate()
            undoTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: false) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.dismissUndoToast()
                }
            }
        } catch {
            showError("Couldn't delete highlight")
        }
    }

    func performUndo() {
        guard let undo = pendingUndo else { return }
        undoTimer?.invalidate()
        undo.onUndo()
        pendingUndo = nil
    }

    func commitPendingUndo() {
        undoTimer?.invalidate()
        pendingUndo = nil
    }

    /// Animate the undo toast out before clearing state.
    func dismissUndoToast() {
        undoTimer?.invalidate()
        // Give the view time to animate out by setting nil after a brief delay
        // The view's onDisappear handles the visual transition
        pendingUndo = nil
    }

    // MARK: - Error Toast

    func showError(_ message: String) {
        errorMessage = message
        errorTimer?.invalidate()
        errorTimer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.errorMessage = nil
            }
        }
    }

    // MARK: - Highlight from Selection (shared for toolbar + keyboard shortcuts)

    public func createHighlightFromCurrentSelection(color: HighlightColor, openNote: Bool = false) {
        guard let range = selectionRange, !selectionText.isEmpty else { return }
        let text = selectionText
        let from = range.location
        let to = range.location + range.length
        // Capture selection rect before clearing — needed for note thread positioning
        let savedRect = selectionRect

        // Clear selection state
        selectionRange = nil
        selectionText = ""
        selectionRect = .zero
        clearEditorSelection = true

        Task {
            if let highlight = await createHighlight(
                color: color.rawValue,
                textContent: text,
                fromPos: from,
                toPos: to
            ) {
                if openNote {
                    focusHighlightRect = savedRect
                    focusHighlightId = highlight.id
                }
            }
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
            showError("Couldn't save note")
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
            showError("Couldn't update note")
        }
    }

    func deleteMarginNote(id: String) async {
        do {
            try annotationStore.deleteMarginNote(id: id)
            marginNotes.removeAll { $0.id == id }
            scheduleAutosave()
        } catch {
            showError("Couldn't delete note")
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
        visibleHighlightPositions = [:]

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
        searchTask?.cancel()

        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            fileResults = []
            isSearching = false
            return
        }

        isSearching = true
        let capturedRecentDocs = recentDocs
        let store = searchStore
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }

            // Run Spotlight (mdfind) and FTS5 off main actor to avoid blocking UI
            let (spotlightResults, ftsResults) = await Task.detached(priority: .userInitiated) {
                let spotlight = store.searchFilesOnDisk(query: query)
                let fts = (try? store.searchDocuments(query: query)) ?? []
                return (spotlight, fts)
            }.value

            guard !Task.isCancelled else { return }

            // Merge FTS results as file results (deduplicate by path)
            let spotlightPaths = Set(spotlightResults.map(\.path))
            let ftsAsFiles = ftsResults.compactMap { result -> FileSearchResult? in
                guard let doc = capturedRecentDocs.first(where: { $0.id == result.documentId }),
                      let path = doc.filePath,
                      !spotlightPaths.contains(path) else { return nil }
                return FileSearchResult(id: path, path: path, filename: doc.displayTitle)
            }

            fileResults = spotlightResults + ftsAsFiles
            isSearching = false
        }
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

        var correctionsSaved = false
        var correctionsFile = ""

        if settings.persistCorrections {
            let corrections = highlights.map { h in
                CorrectionInput(
                    highlightId: h.id,
                    originalText: h.textContent,
                    prefixContext: h.prefixContext,
                    suffixContext: h.suffixContext,
                    extendedContext: nil,
                    notes: marginNotes.filter { $0.highlightId == h.id }.map(\.content),
                    highlightColor: h.color
                )
            }

            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            let exportDate = dateFormatter.string(from: Date())

            if let sessionId = try? correctionStore.persistCorrections(
                corrections: corrections,
                documentId: doc.id,
                documentTitle: doc.title,
                documentSource: doc.source,
                documentPath: doc.filePath,
                exportDate: exportDate
            ) {
                correctionsSaved = true
                correctionsFile = "~/.margin/corrections/corrections-\(exportDate).jsonl"
                _ = sessionId
            }
        }

        return ExportService.ExportResult(
            highlightCount: highlights.count,
            noteCount: marginNotes.count,
            snippets: Array(snippets),
            correctionsSaved: correctionsSaved,
            correctionsFile: correctionsFile
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

    // MARK: - Table of Contents

    func extractHeadings() {
        tocTask?.cancel()
        tocTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            let entries = parseHeadings(from: content)
            guard !Task.isCancelled else { return }
            headings = entries
        }
    }
}

struct TOCEntry: Identifiable, Equatable {
    let id: String
    let text: String
    let level: Int
    let offset: Int
}

/// Parse H1 and H2 headings from markdown content, returning entries with UTF-16 offsets.
func parseHeadings(from content: String) -> [TOCEntry] {
    var entries: [TOCEntry] = []
    var charOffset = 0

    for line in content.components(separatedBy: "\n") {
        if line.hasPrefix("## "), !line.hasPrefix("### ") {
            let text = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            if !text.isEmpty {
                entries.append(TOCEntry(
                    id: "heading-\(entries.count)",
                    text: text,
                    level: 2,
                    offset: charOffset
                ))
            }
        } else if line.hasPrefix("# "), !line.hasPrefix("## ") {
            let text = String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
            if !text.isEmpty {
                entries.append(TOCEntry(
                    id: "heading-\(entries.count)",
                    text: text,
                    level: 1,
                    offset: charOffset
                ))
            }
        }
        charOffset += (line as NSString).length + 1
    }

    return entries
}

struct HighlightPosition: Equatable {
    let highlightId: String
    let viewportY: CGFloat   // SwiftUI global Y coordinate
    let height: CGFloat
}

struct UndoAction {
    let id = UUID().uuidString
    let message: String
    let onUndo: () -> Void
}

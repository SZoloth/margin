import SwiftUI

enum SidebarTab: String, CaseIterable {
    case files = "Files"
    case articles = "Articles"
}

struct SidebarView: View {
    @EnvironmentObject var appState: AppState
    @State private var activeTab: SidebarTab = .files
    @State private var searchText = ""
    @State private var isFocused = false

    var body: some View {
        VStack(spacing: 0) {
            // App title
            HStack {
                Text("MarginOS")
                    .font(.system(size: 18, weight: .semibold))
                    .tracking(-0.3)
                Spacer()
                Button {
                    appState.showSettings = true
                } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Settings")
            }
            .padding(.horizontal, 16)
            .padding(.top, 20)
            .padding(.bottom, 16)

            // Search bar
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)

                TextField(
                    activeTab == .files ? "Search files..." : "Search articles...",
                    text: $searchText
                )
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .accessibilityLabel(activeTab == .files ? "Search files" : "Search articles")
                .onChange(of: searchText) { _, newValue in
                    if activeTab == .files {
                        appState.search(newValue)
                    } else {
                        appState.keepLocal.search(newValue)
                    }
                }

                if activeTab == .files {
                    Button {
                        appState.openFile()
                    } label: {
                        Image(systemName: "folder")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("Open File (⌘O)")
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.quaternary)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            // Tab picker: Files / Articles
            HStack(spacing: 4) {
                ForEach(SidebarTab.allCases, id: \.self) { tab in
                    Button {
                        activeTab = tab
                        searchText = ""
                    } label: {
                        HStack(spacing: 4) {
                            Text(tab.rawValue)
                                .font(.system(size: 12, weight: activeTab == tab ? .medium : .regular))

                            if tab == .articles {
                                Circle()
                                    .fill(appState.keepLocal.isOnline ? Color.green : Color.red)
                                    .frame(width: 6, height: 6)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(activeTab == tab ? Color.primary.opacity(0.07) : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(activeTab == tab ? .primary : .secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            Divider()

            // Content
            ScrollView {
                switch activeTab {
                case .files:
                    FilesSidebarContent()
                        .environmentObject(appState)
                case .articles:
                    ArticlesSidebarContent()
                        .environmentObject(appState)
                }
            }
        }
        .sheet(isPresented: $appState.showSettings) {
            SettingsView()
                .environmentObject(appState)
        }
    }
}

// MARK: - Files Tab

struct FilesSidebarContent: View {
    @EnvironmentObject var appState: AppState

    private var temporalGroups: [(label: String, docs: [Document])] {
        guard !appState.recentDocs.isEmpty else { return [] }

        let calendar = Calendar.current
        let now = Date()
        let todayStart = calendar.startOfDay(for: now)
        let yesterdayStart = calendar.date(byAdding: .day, value: -1, to: todayStart)!
        let weekStart = calendar.date(byAdding: .day, value: -7, to: todayStart)!

        var groups: [(label: String, docs: [Document])] = [
            ("Today", []), ("Yesterday", []), ("This Week", []), ("Older", []),
        ]

        for doc in appState.recentDocs {
            let t = Date(timeIntervalSince1970: Double(doc.lastOpenedAt) / 1000)
            if t >= todayStart { groups[0].docs.append(doc) }
            else if t >= yesterdayStart { groups[1].docs.append(doc) }
            else if t >= weekStart { groups[2].docs.append(doc) }
            else { groups[3].docs.append(doc) }
        }

        return groups.filter { !$0.docs.isEmpty }
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 16) {
            // Spotlight search results dropdown
            if !appState.fileResults.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Search Results")
                        .font(.system(size: 11, weight: .semibold))
                        .textCase(.uppercase)
                        .tracking(0.5)
                        .foregroundStyle(.secondary.opacity(0.7))
                        .padding(.horizontal, 12)

                    ForEach(appState.fileResults) { result in
                        Button {
                            Task { await appState.openFilePath(result.path) }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(result.filename)
                                    .font(.system(size: 13, weight: .medium))
                                    .lineLimit(1)
                                Text(URL(fileURLWithPath: result.path).deletingLastPathComponent().lastPathComponent)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary.opacity(0.7))
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.bottom, 8)

                Divider()
                    .padding(.horizontal, 12)
            }

            // Recent documents grouped by time
            if appState.recentDocs.isEmpty {
                Text("No recent documents")
                    .font(.system(size: 13))
                    .italic()
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
            } else {
                ForEach(temporalGroups, id: \.label) { group in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(group.label)
                            .font(.system(size: 11, weight: .semibold))
                            .textCase(.uppercase)
                            .tracking(0.5)
                            .foregroundStyle(.secondary.opacity(0.7))
                            .padding(.horizontal, 12)

                        ForEach(group.docs) { doc in
                            SidebarDocRow(doc: doc)
                                .environmentObject(appState)
                        }
                    }
                }
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 16)
    }
}

struct SidebarDocRow: View {
    @EnvironmentObject var appState: AppState
    let doc: Document

    private var isActive: Bool {
        appState.currentDoc?.id == doc.id
    }

    private var isOpen: Bool {
        appState.tabs.contains { $0.documentId == doc.id }
    }

    var body: some View {
        Button {
            Task { await appState.openRecentDocument(doc) }
        } label: {
            HStack(spacing: 6) {
                if isOpen {
                    Circle()
                        .fill(.secondary.opacity(0.7))
                        .frame(width: 5, height: 5)
                }

                Text(doc.displayTitle)
                    .font(.system(size: 13, weight: isActive ? .medium : .regular))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(isActive ? Color.primary.opacity(0.07) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(isActive ? .primary : .secondary)
    }
}

// MARK: - Articles Tab

struct ArticlesSidebarContent: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 2) {
            if !appState.keepLocal.isOnline {
                Text("keep-local server offline")
                    .font(.system(size: 13))
                    .italic()
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
            } else if appState.keepLocal.isLoading {
                ProgressView()
                    .scaleEffect(0.7)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 16)
            } else if appState.keepLocal.items.isEmpty {
                Text("No articles")
                    .font(.system(size: 13))
                    .italic()
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
            } else {
                ForEach(appState.keepLocal.items) { item in
                    Button {
                        Task { await appState.openKeepLocalArticle(item) }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title ?? "Untitled")
                                .font(.system(size: 13, weight: .medium))
                                .lineLimit(1)

                            HStack(spacing: 4) {
                                if let domain = item.domain {
                                    Text(domain)
                                        .font(.system(size: 11))
                                        .foregroundStyle(.secondary.opacity(0.7))
                                        .lineLimit(1)
                                }
                                if item.wordCount > 0 {
                                    Text("· \(item.wordCount) words")
                                        .font(.system(size: 11))
                                        .foregroundStyle(.secondary.opacity(0.5))
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 16)
    }
}

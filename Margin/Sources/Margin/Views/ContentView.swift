import SwiftUI

/// Root view — sidebar + tab bar + reader pane.
public struct ContentView: View {
    @EnvironmentObject var appState: AppState

    public init() {}

    public var body: some View {
        NavigationSplitView(columnVisibility: .constant(
            appState.sidebarOpen ? .doubleColumn : .detailOnly
        )) {
            SidebarView()
                .environmentObject(appState)
                .navigationSplitViewColumnWidth(min: 160, ideal: 260, max: 400)
        } detail: {
            VStack(spacing: 0) {
                // Tab bar
                TabBarView()
                    .environmentObject(appState)

                Divider()

                // Main content area
                if appState.currentDoc != nil {
                    MarkdownEditorView()
                        .environmentObject(appState)
                } else {
                    EmptyStateView()
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        appState.sidebarOpen.toggle()
                    }
                } label: {
                    Image(systemName: "sidebar.left")
                }
                .help("Toggle Sidebar")
            }

            ToolbarItem(placement: .primaryAction) {
                if !appState.highlights.isEmpty {
                    Button {
                        appState.showExportPopover = true
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .help("Export Annotations")
                }
            }
        }
        .sheet(isPresented: $appState.showExportPopover) {
            ExportPopoverView()
                .environmentObject(appState)
        }
        .alert("Unsaved Changes", isPresented: .init(
            get: { appState.pendingCloseTabId != nil },
            set: { if !$0 { appState.cancelCloseTab() } }
        )) {
            Button("Close Without Saving", role: .destructive) {
                if let id = appState.pendingCloseTabId {
                    appState.forceCloseTab(id)
                }
            }
            Button("Save and Close") {
                Task {
                    await appState.saveCurrentFile()
                    if let id = appState.pendingCloseTabId {
                        appState.forceCloseTab(id)
                    }
                }
            }
            Button("Cancel", role: .cancel) {
                appState.cancelCloseTab()
            }
        } message: {
            if let id = appState.pendingCloseTabId,
               let tab = appState.tabs.first(where: { $0.id == id }) {
                Text("\"\(tab.title)\" has unsaved changes.")
            }
        }
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("\u{201c}We have books inside our books.\u{201d}")
                .font(.custom("Georgia", size: 18))
                .italic()
                .foregroundStyle(.secondary.opacity(0.5))

            Text("Edgar Allan Poe, Marginalia")
                .font(.system(size: 11, weight: .medium))
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(.secondary.opacity(0.35))

            Spacer().frame(height: 16)

            Text("Open a file or select an article to start reading")
                .font(.custom("Georgia", size: 16))
                .italic()
                .foregroundStyle(.secondary)

            HStack(spacing: 4) {
                Text("⌘O")
                    .font(.system(size: 12, design: .monospaced))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(.quaternary)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                Text("to open a file")
                    .font(.system(size: 13))
            }
            .foregroundStyle(.secondary.opacity(0.5))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

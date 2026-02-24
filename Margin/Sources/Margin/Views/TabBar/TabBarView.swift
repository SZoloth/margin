import SwiftUI
import UniformTypeIdentifiers

/// Horizontal tab bar showing open documents, with close buttons and drag reordering.
struct TabBarView: View {
    @EnvironmentObject var appState: AppState
    @State private var draggedTabId: String?

    var body: some View {
        HStack(spacing: 0) {
            tabScrollArea
            Spacer()
            newTabButton
        }
        .frame(height: 34)
    }

    private var tabScrollArea: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 1) {
                ForEach(appState.tabs) { tab in
                    draggableTab(tab)
                }
            }
            .padding(.horizontal, 4)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Open tabs")
        }
    }

    private func draggableTab(_ tab: TabItem) -> some View {
        let isActive = tab.id == appState.activeTabId
        return TabBarItem(tab: tab, isActive: isActive)
            .environmentObject(appState)
            .opacity(draggedTabId == tab.id ? 0.5 : 1)
            .onDrag {
                draggedTabId = tab.id
                return NSItemProvider(object: tab.id as NSString)
            }
            .onDrop(of: [.text], delegate: TabDropDelegate(
                tabId: tab.id,
                appState: appState,
                draggedTabId: $draggedTabId
            ))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(tab.title)\(isActive ? ", selected" : "")")
            .accessibilityValue(tab.isDirty ? "Unsaved changes" : "")
    }

    private var newTabButton: some View {
        Button {
            appState.openFile()
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 24, height: 24)
        }
        .buttonStyle(.plain)
        .help("New Tab")
        .accessibilityLabel("New Tab")
        .padding(.trailing, 8)
    }
}

struct TabDropDelegate: DropDelegate {
    let tabId: String
    let appState: AppState
    @Binding var draggedTabId: String?

    func performDrop(info: DropInfo) -> Bool {
        defer { draggedTabId = nil }
        guard let draggedId = draggedTabId,
              draggedId != tabId,
              let fromIndex = appState.tabs.firstIndex(where: { $0.id == draggedId }),
              let toIndex = appState.tabs.firstIndex(where: { $0.id == tabId }) else {
            return false
        }
        let dest = toIndex > fromIndex ? toIndex + 1 : toIndex
        appState.reorderTabs(from: fromIndex, to: dest)
        return true
    }

    func dropEntered(info: DropInfo) {}

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func dropExited(info: DropInfo) {}

    func validateDrop(info: DropInfo) -> Bool {
        draggedTabId != nil && draggedTabId != tabId
    }
}

struct TabBarItem: View {
    @EnvironmentObject var appState: AppState
    let tab: TabItem
    let isActive: Bool

    @State private var isHovered = false

    var body: some View {
        Button {
            appState.switchTab(tab.id)
        } label: {
            HStack(spacing: 4) {
                if tab.isDirty {
                    Circle()
                        .fill(.secondary)
                        .frame(width: 5, height: 5)
                        .accessibilityLabel("Unsaved changes")
                }

                Text(tab.title)
                    .font(.system(size: 12, weight: isActive ? .medium : .regular))
                    .lineLimit(1)

                Button {
                    appState.closeTab(tab.id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 14, height: 14)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .opacity(isHovered || isActive ? 1 : 0)
                .accessibilityLabel("Close \(tab.title)")
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                isActive
                    ? Color.primary.opacity(0.07)
                    : (isHovered ? Color.primary.opacity(0.03) : Color.clear)
            )
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .foregroundStyle(isActive ? .primary : .secondary)
        .onHover { isHovered = $0 }
    }
}

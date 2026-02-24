import SwiftUI

/// Horizontal tab bar showing open documents, with close buttons and drag reordering.
struct TabBarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 1) {
                    ForEach(appState.tabs) { tab in
                        TabBarItem(tab: tab, isActive: tab.id == appState.activeTabId)
                            .environmentObject(appState)
                    }
                }
                .padding(.horizontal, 4)
            }

            Spacer()

            // New tab button
            Button {
                appState.openFile()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .help("New Tab (⌘T)")
            .padding(.trailing, 8)
        }
        .frame(height: 34)
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
                // Dirty indicator
                if tab.isDirty {
                    Circle()
                        .fill(.secondary)
                        .frame(width: 5, height: 5)
                }

                Text(tab.title)
                    .font(.system(size: 12, weight: isActive ? .medium : .regular))
                    .lineLimit(1)

                // Close button
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

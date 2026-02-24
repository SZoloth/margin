import SwiftUI

/// Placeholder — floating toolbar positioning requires NSTextView selection rect
/// integration via the Coordinator. Renders nothing until wired up.
struct FloatingToolbarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        EmptyView()
    }
}

/// Standalone highlight toolbar that can be shown in a popover or overlay.
struct HighlightToolbar: View {
    @EnvironmentObject var appState: AppState
    let onHighlight: (HighlightColor) -> Void
    let onNote: () -> Void

    private var orderedColors: [HighlightColor] {
        var colors = HighlightColor.allCases
        if let idx = colors.firstIndex(of: appState.settings.defaultHighlightColor), idx != 0 {
            let c = colors.remove(at: idx)
            colors.insert(c, at: 0)
        }
        return colors
    }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(orderedColors) { color in
                Button {
                    onHighlight(color)
                } label: {
                    Circle()
                        .fill(color.swiftUIColor)
                        .frame(width: 18, height: 18)
                        .overlay {
                            if color == appState.settings.defaultHighlightColor {
                                Circle()
                                    .strokeBorder(.secondary, lineWidth: 2)
                            } else {
                                Circle()
                                    .strokeBorder(.quaternary, lineWidth: 1.5)
                            }
                        }
                }
                .buttonStyle(.plain)
                .help("Highlight \(color.displayName)")
            }

            Divider()
                .frame(height: 18)

            Button {
                onNote()
            } label: {
                Image(systemName: "text.bubble")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Add Note")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.1), radius: 8, y: 2)
    }
}

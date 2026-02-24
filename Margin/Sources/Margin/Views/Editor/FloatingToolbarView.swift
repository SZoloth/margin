import SwiftUI

/// Floating toolbar that appears above text selection for highlight creation.
/// Selection rect is in window coordinates; we convert to local overlay coords.
struct FloatingToolbarView: View {
    @EnvironmentObject var appState: AppState
    @State private var isVisible = false

    var body: some View {
        GeometryReader { geometry in
            let toolbarWidth: CGFloat = 210
            let toolbarHeight: CGFloat = 40
            // Convert window coords to local overlay coords
            let overlayFrame = geometry.frame(in: .global)
            let selRect = appState.selectionRect
            let localRect = CGRect(
                x: selRect.origin.x - overlayFrame.origin.x,
                y: selRect.origin.y - overlayFrame.origin.y,
                width: selRect.width,
                height: selRect.height
            )
            let centerX = localRect.midX
            let clampedX = max(8, min(centerX - toolbarWidth / 2, geometry.size.width - toolbarWidth - 8))
            let aboveY = localRect.minY - toolbarHeight - 8
            let belowY = localRect.maxY + 8
            let y = aboveY > 40 ? aboveY : belowY

            HighlightToolbar(
                onHighlight: { color in
                    createHighlightFromSelection(color: color)
                },
                onNote: {
                    createHighlightFromSelection(color: appState.settings.defaultHighlightColor, openNote: true)
                }
            )
            .environmentObject(appState)
            .position(x: clampedX + toolbarWidth / 2, y: y + toolbarHeight / 2)
            .opacity(isVisible ? 1 : 0)
            .scaleEffect(isVisible ? 1 : 0.97)
            .offset(y: isVisible ? 0 : 4)
            .animation(.easeOut(duration: 0.15), value: isVisible)
        }
        .allowsHitTesting(true)
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false }
    }

    private func createHighlightFromSelection(color: HighlightColor, openNote: Bool = false) {
        guard let range = appState.selectionRange, !appState.selectionText.isEmpty else { return }
        let text = appState.selectionText
        let from = range.location
        let to = range.location + range.length

        // Clear selection state first to dismiss toolbar
        appState.selectionRange = nil
        appState.selectionText = ""
        appState.selectionRect = .zero
        // Also tell the editor to clear its native selection
        appState.clearEditorSelection = true

        Task {
            if let highlight = await appState.createHighlight(
                color: color.rawValue,
                textContent: text,
                fromPos: from,
                toPos: to
            ) {
                if openNote {
                    appState.focusHighlightId = highlight.id
                }
            }
        }
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
                .accessibilityLabel("Highlight \(color.displayName)")
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
            .accessibilityLabel("Add Note")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.1), radius: 8, y: 2)
    }
}

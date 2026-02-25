import SwiftUI

/// Floating toolbar that appears above text selection for highlight creation.
/// Selection rect is in SwiftUI `.global` coords; we convert to local overlay coords.
struct FloatingToolbarView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.accessibilityReduceMotion) var reduceMotion
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
            let clampedX = max(Spacing.sm, min(centerX - toolbarWidth / 2, geometry.size.width - toolbarWidth - Spacing.sm))
            let aboveY = localRect.minY - toolbarHeight - Spacing.sm
            let belowY = localRect.maxY + Spacing.sm
            let y = aboveY > 40 ? aboveY : belowY

            HighlightToolbar(
                onHighlight: { color in
                    dismissThenAct {
                        createHighlightFromSelection(color: color)
                    }
                },
                onNote: {
                    dismissThenAct {
                        createHighlightFromSelection(color: appState.settings.defaultHighlightColor, openNote: true)
                    }
                }
            )
            .environmentObject(appState)
            .position(x: clampedX + toolbarWidth / 2, y: y + toolbarHeight / 2)
            .opacity(isVisible ? 1 : 0)
            .scaleEffect(isVisible ? 1 : 0.97)
            .offset(y: isVisible ? 0 : 4)
            .animation(reduceMotion ? nil : .easeOut(duration: AnimationDuration.normal), value: isVisible)
        }
        .allowsHitTesting(true)
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false }
    }

    /// Animate out, then execute the action and clear selection state.
    private func dismissThenAct(_ action: @escaping () -> Void) {
        if reduceMotion {
            action()
            return
        }
        withAnimation(.easeIn(duration: AnimationDuration.fast)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + AnimationDuration.fast + 0.01) {
            action()
        }
    }

    private func createHighlightFromSelection(color: HighlightColor, openNote: Bool = false) {
        guard let range = appState.selectionRange, !appState.selectionText.isEmpty else { return }
        let text = appState.selectionText
        let from = range.location
        let to = range.location + range.length

        // Clear selection state to dismiss toolbar
        appState.selectionRange = nil
        appState.selectionText = ""
        appState.selectionRect = .zero
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

    @State private var hoveredColor: HighlightColor?
    @State private var isNoteHovered = false

    private var orderedColors: [HighlightColor] {
        var colors = HighlightColor.allCases
        if let idx = colors.firstIndex(of: appState.settings.defaultHighlightColor), idx != 0 {
            let c = colors.remove(at: idx)
            colors.insert(c, at: 0)
        }
        return colors
    }

    var body: some View {
        HStack(spacing: Spacing.sm - 2) {
            ForEach(orderedColors) { color in
                Button {
                    onHighlight(color)
                } label: {
                    Circle()
                        .fill(color.swiftUIColor)
                        .frame(width: Spacing.xl, height: Spacing.xl)
                        .overlay {
                            if color == appState.settings.defaultHighlightColor {
                                Circle()
                                    .strokeBorder(.secondary, lineWidth: 2)
                            } else {
                                Circle()
                                    .strokeBorder(.quaternary, lineWidth: 1.5)
                            }
                        }
                        .scaleEffect(hoveredColor == color ? 1.15 : 1.0)
                        .animation(.easeOut(duration: 0.1), value: hoveredColor)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Circle())
                        .onHover { isHovered in
                            hoveredColor = isHovered ? color : nil
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
                    .scaleEffect(isNoteHovered ? 1.1 : 1.0)
                    .animation(.easeOut(duration: 0.1), value: isNoteHovered)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add Note")
            .onHover { isHovered in
                isNoteHovered = isHovered
            }
        }
        .padding(.horizontal, Spacing.md - 2)
        .padding(.vertical, Spacing.sm)
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md))
        .elevationShadow(Elevation.toast)
    }
}

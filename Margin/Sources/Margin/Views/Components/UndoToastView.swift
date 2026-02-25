import SwiftUI

/// Toast banner that appears at the bottom of the editor with an undo action.
/// Uses two-phase dismiss: animate out first, then clear model state.
struct UndoToastView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    @State private var isVisible = false
    @State private var displayedUndo: UndoAction?

    var body: some View {
        Group {
            if let undo = displayedUndo {
                VStack {
                    Spacer()
                    HStack(spacing: Spacing.md) {
                        Text(undo.message)
                            .font(Typography.body)
                            .foregroundStyle(.primary)

                        Button("Undo") {
                            appState.performUndo()
                        }
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.blue)
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, Spacing.md - 2)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md))
                    .elevationShadow(Elevation.toast)
                    .padding(.bottom, Spacing.lg)
                    .opacity(isVisible ? 1 : 0)
                    .offset(y: isVisible ? 0 : 12)
                    .animation(reduceMotion ? nil : .easeOut(duration: AnimationDuration.slow), value: isVisible)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.updatesFrequently)
                }
                .allowsHitTesting(true)
            }
        }
        .onChange(of: appState.pendingUndo?.id) { _, _ in
            if let newUndo = appState.pendingUndo {
                displayedUndo = newUndo
                if reduceMotion {
                    isVisible = true
                } else {
                    withAnimation(.easeOut(duration: AnimationDuration.slow)) {
                        isVisible = true
                    }
                }
            } else if displayedUndo != nil {
                if reduceMotion {
                    isVisible = false
                    displayedUndo = nil
                } else {
                    withAnimation(.easeIn(duration: AnimationDuration.slow)) {
                        isVisible = false
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + AnimationDuration.slow + 0.02) {
                        displayedUndo = nil
                    }
                }
            }
        }
        .onAppear {
            if appState.pendingUndo != nil {
                displayedUndo = appState.pendingUndo
                isVisible = true
            }
        }
    }
}

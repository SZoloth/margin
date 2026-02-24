import SwiftUI

/// Toast banner that appears at the bottom of the editor with an undo action.
struct UndoToastView: View {
    @EnvironmentObject var appState: AppState
    @State private var isVisible = false

    var body: some View {
        if let undo = appState.pendingUndo {
            VStack {
                Spacer()
                HStack(spacing: 12) {
                    Text(undo.message)
                        .font(.system(size: 13))
                        .foregroundStyle(.primary)

                    Button("Undo") {
                        appState.performUndo()
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.blue)
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .shadow(color: .black.opacity(0.1), radius: 8, y: 2)
                .padding(.bottom, 16)
                .opacity(isVisible ? 1 : 0)
                .offset(y: isVisible ? 0 : 12)
                .animation(.easeOut(duration: 0.2), value: isVisible)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.updatesFrequently)
            }
            .id(undo.id)
            .onAppear { isVisible = true }
            .onDisappear { isVisible = false }
            .allowsHitTesting(true)
        }
    }
}

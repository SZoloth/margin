import SwiftUI

/// Red-tinted toast that appears at the bottom of the editor when an operation fails.
/// Uses two-phase dismiss: animate out first, then clear model state.
struct ErrorToastView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    @State private var isVisible = false
    @State private var displayedMessage: String?

    var body: some View {
        Group {
            if let message = displayedMessage {
                VStack {
                    Spacer()
                    HStack(spacing: Spacing.sm) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(.red)

                        Text(message)
                            .font(Typography.body)
                            .foregroundStyle(.primary)

                        Button {
                            appState.errorMessage = nil
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Dismiss error")
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, Spacing.md - 2)
                    .background(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: CornerRadius.md)
                            .strokeBorder(.red.opacity(0.2), lineWidth: 1)
                    )
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
        .onChange(of: appState.errorMessage) { _, newMessage in
            if let msg = newMessage {
                displayedMessage = msg
                if reduceMotion {
                    isVisible = true
                } else {
                    withAnimation(.easeOut(duration: AnimationDuration.slow)) {
                        isVisible = true
                    }
                }
            } else if displayedMessage != nil {
                if reduceMotion {
                    isVisible = false
                    displayedMessage = nil
                } else {
                    withAnimation(.easeIn(duration: AnimationDuration.slow)) {
                        isVisible = false
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + AnimationDuration.slow + 0.02) {
                        displayedMessage = nil
                    }
                }
            }
        }
        .onAppear {
            if appState.errorMessage != nil {
                displayedMessage = appState.errorMessage
                isVisible = true
            }
        }
    }
}

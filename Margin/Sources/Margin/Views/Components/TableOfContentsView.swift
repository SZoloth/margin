import SwiftUI

/// Table of contents showing H1 and H2 headings with scroll-to navigation.
struct TableOfContentsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        if appState.headings.isEmpty {
            Text("No headings")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
                .padding()
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(appState.headings) { entry in
                        Button {
                            // Reset then set to allow re-triggering same heading
                            appState.scrollToOffset = nil
                            DispatchQueue.main.async {
                                appState.scrollToOffset = entry.offset
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(entry.level == 1 ? Color.primary.opacity(0.4) : Color.primary.opacity(0.2))
                                    .frame(width: 4, height: 4)

                                Text(entry.text)
                                    .font(.system(size: entry.level == 1 ? 12 : 11,
                                                  weight: entry.level == 1 ? .medium : .regular))
                                    .foregroundStyle(entry.level == 1 ? .primary : .secondary)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                            .padding(.leading, entry.level == 1 ? 0 : 12)
                            .padding(.vertical, 3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Go to \(entry.text)")
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
        }
    }
}

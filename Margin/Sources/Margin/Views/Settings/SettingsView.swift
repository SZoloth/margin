import SwiftUI

/// Settings panel with theme, typography, and behavior controls.
struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(.system(size: 16, weight: .semibold))
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(20)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Theme
                    SettingsSection(title: "Theme") {
                        Picker("Appearance", selection: $appState.settings.theme) {
                            ForEach(Theme.allCases, id: \.self) { theme in
                                Text(theme.rawValue.capitalized).tag(theme)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    // Typography
                    SettingsSection(title: "Typography") {
                        LabeledContent("Font Size") {
                            Picker("Font Size", selection: $appState.settings.fontSize) {
                                ForEach(FontSize.allCases, id: \.self) { size in
                                    Text(size.displayName).tag(size)
                                }
                            }
                            .pickerStyle(.segmented)
                        }

                        LabeledContent("Line Spacing") {
                            Picker("Line Spacing", selection: $appState.settings.lineSpacing) {
                                ForEach(LineSpacing.allCases, id: \.self) { spacing in
                                    Text(spacing.displayName).tag(spacing)
                                }
                            }
                            .pickerStyle(.segmented)
                        }

                        LabeledContent("Reader Width") {
                            Picker("Reader Width", selection: $appState.settings.readerWidth) {
                                ForEach(ReaderWidth.allCases, id: \.self) { width in
                                    Text(width.displayName).tag(width)
                                }
                            }
                            .pickerStyle(.segmented)
                        }
                    }

                    // Highlights
                    SettingsSection(title: "Highlights") {
                        LabeledContent("Default Color") {
                            HStack(spacing: 6) {
                                ForEach(HighlightColor.allCases) { color in
                                    Button {
                                        appState.settings.defaultHighlightColor = color
                                    } label: {
                                        Circle()
                                            .fill(color.swiftUIColor)
                                            .frame(width: 22, height: 22)
                                            .overlay {
                                                if color == appState.settings.defaultHighlightColor {
                                                    Circle()
                                                        .strokeBorder(.primary, lineWidth: 2)
                                                }
                                            }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    // Behavior
                    SettingsSection(title: "Behavior") {
                        Toggle("Autosave", isOn: $appState.settings.autosave)
                            .font(.system(size: 13))

                        Toggle("Persist corrections on export", isOn: $appState.settings.persistCorrections)
                            .font(.system(size: 13))
                    }
                }
                .padding(20)
            }
        }
        .frame(width: 440, height: 500)
        .preferredColorScheme(appState.settings.theme.resolved)
    }
}

struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.5)

            VStack(alignment: .leading, spacing: 10) {
                content
            }
        }
    }
}

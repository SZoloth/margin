import SwiftUI

@main
struct MarginApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: 800, minHeight: 500)
                .onAppear {
                    appState.initialize()
                }
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: false))
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open File...") {
                    appState.openFile()
                }
                .keyboardShortcut("o", modifiers: .command)

                Button("New Tab") {
                    appState.openFile()
                }
                .keyboardShortcut("t", modifiers: .command)
            }

            CommandGroup(replacing: .saveItem) {
                Button("Save") {
                    Task { await appState.saveCurrentFile() }
                }
                .keyboardShortcut("s", modifiers: .command)
            }

            CommandGroup(after: .toolbar) {
                Button("Export Annotations") {
                    appState.showExportPopover = true
                }
                .keyboardShortcut("e", modifiers: [.command, .shift])
                .disabled(appState.currentDoc == nil || appState.highlights.isEmpty)

                Divider()

                Button("Highlight Selection") {
                    appState.createHighlightFromCurrentSelection(
                        color: appState.settings.defaultHighlightColor
                    )
                }
                .keyboardShortcut("h", modifiers: [.command, .shift])
                .disabled(appState.selectionRange == nil)

                Button("Highlight & Add Note") {
                    appState.createHighlightFromCurrentSelection(
                        color: appState.settings.defaultHighlightColor,
                        openNote: true
                    )
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
                .disabled(appState.selectionRange == nil)
            }
        }

        Settings {
            SettingsView()
                .environmentObject(appState)
        }
    }
}

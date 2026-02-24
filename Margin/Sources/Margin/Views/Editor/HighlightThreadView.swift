import SwiftUI

/// Popover for viewing and adding margin notes on a highlight.
struct HighlightThreadView: View {
    @EnvironmentObject var appState: AppState
    let highlight: Highlight
    let notes: [MarginNote]

    @State private var newNoteText = ""
    @FocusState private var isNewNoteFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Scrim behind
            Color.black.opacity(0.15)
                .ignoresSafeArea()
                .onTapGesture {
                    appState.focusHighlightId = nil
                }
                .accessibilityHidden(true)

            // The popover itself
            VStack(alignment: .leading, spacing: 0) {
                // Header
                HStack {
                    Text("Notes")
                        .font(.system(size: 13, weight: .semibold))
                    Spacer()
                    Button("Remove") {
                        Task { await appState.deleteHighlight(highlight.id) }
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(.red)
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                Divider()

                // Highlight excerpt
                Text(highlight.textContent)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        HighlightColor(rawValue: highlight.color)?.swiftUIColor.opacity(0.3)
                            ?? Color.yellow.opacity(0.3)
                    )

                Divider()

                // Existing notes
                if !notes.isEmpty {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(notes) { note in
                                NoteRow(note: note)
                                    .environmentObject(appState)

                                if note.id != notes.last?.id {
                                    Divider().padding(.leading, 16)
                                }
                            }
                        }
                    }
                    .frame(maxHeight: 200)

                    Divider()
                }

                // New note input
                VStack(spacing: 6) {
                    TextField("Add a note...", text: $newNoteText, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .lineLimit(1...5)
                        .focused($isNewNoteFocused)
                        .onSubmit {
                            if NSApp.currentEvent?.modifierFlags.contains(.command) == true {
                                addNote()
                            }
                        }

                    if !newNoteText.trimmingCharacters(in: .whitespaces).isEmpty {
                        HStack {
                            Spacer()
                            Button("Save") {
                                addNote()
                            }
                            .font(.system(size: 12, weight: .medium))
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(12)
            }
            .frame(width: 300)
            .background(.background)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.15), radius: 16, y: 4)
            .padding(20)
            .accessibilityAddTraits(.isModal)
            .accessibilityLabel("Notes for highlight")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func addNote() {
        let trimmed = newNoteText.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        Task {
            _ = await appState.createMarginNote(highlightId: highlight.id, content: trimmed)
            newNoteText = ""
        }
    }
}

struct NoteRow: View {
    @EnvironmentObject var appState: AppState
    let note: MarginNote

    @State private var isEditing = false
    @State private var editText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Timestamp
            Text(timeAgo(note.createdAt))
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)

            if isEditing {
                TextField("Note", text: $editText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .lineLimit(1...5)
                    .onSubmit {
                        saveEdit()
                    }

                HStack(spacing: 8) {
                    Button("Cancel") {
                        isEditing = false
                    }
                    .font(.system(size: 12))
                    .buttonStyle(.plain)

                    Button("Save") {
                        saveEdit()
                    }
                    .font(.system(size: 12, weight: .medium))
                    .buttonStyle(.plain)
                }
            } else {
                Text(note.content)
                    .font(.system(size: 13))

                HStack(spacing: 8) {
                    Button("Edit") {
                        editText = note.content
                        isEditing = true
                    }
                    .font(.system(size: 12))
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)

                    Button("Delete") {
                        Task { await appState.deleteMarginNote(id: note.id) }
                    }
                    .font(.system(size: 12))
                    .buttonStyle(.plain)
                    .foregroundStyle(.red.opacity(0.7))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func saveEdit() {
        let trimmed = editText.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty, trimmed != note.content {
            Task { await appState.updateMarginNote(id: note.id, content: trimmed) }
        }
        isEditing = false
    }

    private func timeAgo(_ timestamp: Int64) -> String {
        let seconds = Int(Date().timeIntervalSince1970 - Double(timestamp) / 1000)
        if seconds < 60 { return "just now" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        if days == 1 { return "yesterday" }
        if days < 30 { return "\(days)d ago" }
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        return formatter.string(from: Date(timeIntervalSince1970: Double(timestamp) / 1000))
    }
}

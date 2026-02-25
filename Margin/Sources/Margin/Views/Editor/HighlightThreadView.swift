import SwiftUI

/// Anchored popover for viewing and adding margin notes on a highlight.
/// Positioned near the highlight text, not centered on screen.
struct HighlightThreadView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    let highlight: Highlight
    let notes: [MarginNote]

    @State private var newNoteText = ""
    @FocusState private var isNewNoteFocused: Bool
    @State private var isVisible = false
    @State private var isDismissing = false
    @State private var eventMonitor: Any?

    var body: some View {
        GeometryReader { geometry in
            let overlayFrame = geometry.frame(in: .global)
            let overlayWidth = geometry.size.width
            let overlayHeight = geometry.size.height
            let highlightRect = appState.focusHighlightRect
            let readerWidth = appState.settings.readerWidth.points

            // Convert highlight SwiftUI `.global` coords to overlay-local coords
            let localRect = CGRect(
                x: highlightRect.origin.x - overlayFrame.origin.x,
                y: highlightRect.origin.y - overlayFrame.origin.y,
                width: highlightRect.width,
                height: highlightRect.height
            )

            // Available right margin from reader text edge
            let readerRightEdge = (overlayWidth + readerWidth) / 2
            let rightMarginSpace = overlayWidth - readerRightEdge
            let useMarginLayout = rightMarginSpace >= 220

            let popoverWidth: CGFloat = useMarginLayout
                ? min(280, rightMarginSpace - Spacing.sm)
                : 300

            // Margin layout: right of reader, aligned with highlight Y
            // Fallback layout: below/above highlight, centered on it
            let belowY = localRect.maxY + Spacing.sm
            let aboveY = localRect.minY - 260 - Spacing.sm
            let useBelow = belowY + 260 < overlayHeight

            let xOffset = useMarginLayout
                ? readerRightEdge + Spacing.sm
                : max(Spacing.sm, min(localRect.midX - popoverWidth / 2, overlayWidth - popoverWidth - Spacing.sm))

            let yOffset = useMarginLayout
                ? max(Spacing.sm, min(localRect.minY, overlayHeight - 280))
                : (useBelow ? belowY : max(Spacing.sm, aboveY))

            let scaleAnchor: UnitPoint = useMarginLayout ? .topLeading : .top

            popoverContent
                .frame(width: popoverWidth)
                .fixedSize(horizontal: false, vertical: true)
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md))
                .elevationShadow(Elevation.popover)
                .offset(
                    x: xOffset,
                    y: yOffset + (isVisible ? 0 : 4)
                )
                .opacity(isVisible ? 1 : 0)
                .scaleEffect(isVisible ? 1 : 0.97, anchor: scaleAnchor)
        }
        .onAppear {
            if reduceMotion {
                isVisible = true
            } else {
                withAnimation(.easeOut(duration: AnimationDuration.normal)) {
                    isVisible = true
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + AnimationDuration.slow) {
                isNewNoteFocused = true
            }

            // Click-outside dismiss via event monitor.
            // Exempt: NSTextView (coordinator handles), SwiftUI hosting views (popover content).
            eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { event in
                guard let window = event.window,
                      let contentView = window.contentView else { return event }
                let localPoint = contentView.convert(event.locationInWindow, from: nil)
                if let hitView = contentView.hitTest(localPoint) {
                    var view: NSView? = hitView
                    while let v = view {
                        // NSTextView clicks handled by the coordinator
                        if v is NSTextView { return event }
                        // SwiftUI hosting views are the popover's own content
                        let typeName = String(describing: type(of: v))
                        if typeName.contains("NSHostingView") || typeName.contains("_NSHostingView") {
                            return event
                        }
                        view = v.superview
                    }
                    // Click was outside both editor and popover — dismiss
                    dismiss()
                }
                return event
            }
        }
        .onDisappear {
            if let monitor = eventMonitor {
                NSEvent.removeMonitor(monitor)
                eventMonitor = nil
            }
        }
        .onExitCommand { dismiss() }
        .accessibilityAddTraits(.isModal)
        .accessibilityLabel("Notes for highlight")
    }

    private var popoverContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Notes")
                    .font(Typography.headingSemibold)
                Spacer()
                Button("Remove") {
                    Task { await appState.deleteHighlight(highlight.id) }
                }
                .font(Typography.captionMedium)
                .foregroundStyle(.red)
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.lg - 2)
            .padding(.vertical, Spacing.md - 2)

            Divider()

            // Highlight excerpt
            Text(highlight.textContent)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(3)
                .padding(.horizontal, Spacing.lg - 2)
                .padding(.vertical, Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    HighlightColor(rawValue: highlight.color)?.swiftUIColor.opacity(0.2)
                        ?? Color.yellow.opacity(0.2)
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
                                Divider().padding(.leading, Spacing.lg - 2)
                            }
                        }
                    }
                }
                .frame(maxHeight: 160)

                Divider()
            }

            // New note input
            VStack(spacing: Spacing.sm - 2) {
                TextField("Add a note...", text: $newNoteText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(Typography.body)
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
                        .font(Typography.captionMedium)
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(Spacing.md)
        }
    }

    private func dismiss() {
        guard !isDismissing else { return }
        isDismissing = true

        if reduceMotion {
            isVisible = false
            appState.focusHighlightId = nil
        } else {
            withAnimation(.easeOut(duration: AnimationDuration.fast)) {
                isVisible = false
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + AnimationDuration.fast + 0.01) {
                appState.focusHighlightId = nil
            }
        }
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
        VStack(alignment: .leading, spacing: Spacing.xs) {
            // Timestamp
            Text(timeAgo(note.createdAt))
                .font(Typography.caption)
                .foregroundStyle(.tertiary)

            if isEditing {
                TextField("Note", text: $editText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(Typography.body)
                    .lineLimit(1...5)
                    .onSubmit {
                        saveEdit()
                    }

                HStack(spacing: Spacing.sm) {
                    Button("Cancel") {
                        isEditing = false
                    }
                    .font(.system(size: 12))
                    .buttonStyle(.plain)

                    Button("Save") {
                        saveEdit()
                    }
                    .font(Typography.captionMedium)
                    .buttonStyle(.plain)
                }
            } else {
                Text(note.content)
                    .font(Typography.body)

                HStack(spacing: Spacing.sm) {
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
        .padding(.horizontal, Spacing.lg - 2)
        .padding(.vertical, Spacing.sm)
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

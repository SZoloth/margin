import SwiftUI

/// SwiftUI wrapper around a native NSTextView for rendering and editing markdown
/// with multi-color highlight support.
struct MarkdownEditorView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        GeometryReader { geometry in
            let totalWidth = geometry.size.width
            let readerWidth = appState.settings.readerWidth.points
            let horizontalPadding: CGFloat = 40
            // Left gutter: space from detail pane edge to the reader content
            let gutterWidth = max(0, (totalWidth - readerWidth) / 2 - horizontalPadding)
            let showGutterTOC = gutterWidth >= 120 && !appState.headings.isEmpty

            ZStack(alignment: .topLeading) {
                // Main editor, centered
                MarkdownTextView(
                    content: $appState.content,
                    highlights: appState.highlights,
                    settings: appState.settings,
                    onContentChange: { newContent in
                        appState.updateContent(newContent)
                    },
                    onSelectionChange: { range, rect, text in
                        appState.clearEditorSelection = false
                        if range.length > 0 {
                            appState.selectionRange = range
                            appState.selectionRect = rect
                            appState.selectionText = text
                        } else {
                            appState.selectionRange = nil
                            appState.selectionRect = .zero
                            appState.selectionText = ""
                        }
                    },
                    onHighlightClick: { highlightId, rect in
                        if highlightId.isEmpty {
                            appState.focusHighlightId = nil
                        } else {
                            appState.focusHighlightRect = rect
                            appState.focusHighlightId = highlightId
                        }
                    },
                    onScrollChange: { positions in
                        appState.visibleHighlightPositions = positions
                    },
                    scrollToOffset: appState.scrollToOffset,
                    clearSelection: appState.clearEditorSelection
                )
                .frame(maxWidth: readerWidth)
                .padding(.horizontal, horizontalPadding)
                .frame(maxWidth: .infinity)

                // Left gutter TOC
                if showGutterTOC {
                    GutterTableOfContentsView()
                        .environmentObject(appState)
                        .frame(width: min(gutterWidth - Spacing.lg, 180))
                        .padding(.top, 32)
                        .padding(.leading, Spacing.lg)
                }

                // Right gutter margin rail
                if gutterWidth >= MarginRail.minGutterWidth && !appState.highlights.isEmpty {
                    MarginRailView(gutterWidth: gutterWidth)
                        .environmentObject(appState)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(editorAccessibilityLabel)
        .overlay {
            if appState.selectionRange != nil, !appState.selectionText.isEmpty {
                FloatingToolbarView()
                    .environmentObject(appState)
            }
        }
        .overlay {
            if let highlightId = appState.focusHighlightId,
               let highlight = appState.highlights.first(where: { $0.id == highlightId }) {
                HighlightThreadView(
                    highlight: highlight,
                    notes: appState.notesForHighlight(highlightId)
                )
                .environmentObject(appState)
            }
        }
        .overlay(alignment: .bottom) {
            UndoToastView()
                .environmentObject(appState)
        }
        .overlay(alignment: .bottom) {
            ErrorToastView()
                .environmentObject(appState)
                .padding(.bottom, appState.pendingUndo != nil ? 60 : 0)
        }
    }

    private var editorAccessibilityLabel: String {
        let count = appState.highlights.count
        if count == 0 {
            return "Document editor"
        } else {
            return "Document editor with \(count) highlight\(count == 1 ? "" : "s")"
        }
    }
}

/// Compact table of contents for the left gutter of the editor.
/// Shows only when the gutter has enough space (>=120pt).
private struct GutterTableOfContentsView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    @State private var isHovered = false

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 1) {
                ForEach(appState.headings) { entry in
                    Button {
                        appState.scrollToOffset = nil
                        DispatchQueue.main.async {
                            appState.scrollToOffset = entry.offset
                        }
                    } label: {
                        Text(entry.text)
                            .font(.system(size: entry.level == 1 ? 11 : 10,
                                          weight: entry.level == 1 ? .medium : .regular))
                            .foregroundStyle(entry.level == 1 ? .secondary : .tertiary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .padding(.leading, entry.level == 1 ? 0 : Spacing.sm)
                            .padding(.vertical, 2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Go to \(entry.text)")
                }
            }
            .padding(.vertical, Spacing.sm)
        }
        .opacity(isHovered ? 1.0 : 0.6)
        .animation(reduceMotion ? nil : .easeOut(duration: AnimationDuration.normal), value: isHovered)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

/// NSViewRepresentable wrapping NSTextView for rich markdown editing with highlights.
/// Uses regex-based syntax highlighting that preserves raw markdown text,
/// so textView.string always returns the original markdown (no data corruption on save).
struct MarkdownTextView: NSViewRepresentable {
    @Binding var content: String
    let highlights: [Highlight]
    let settings: AppSettings
    var onContentChange: (String) -> Void
    var onSelectionChange: (NSRange, CGRect, String) -> Void
    var onHighlightClick: (String, CGRect) -> Void
    var onScrollChange: (([String: HighlightPosition]) -> Void)?
    var scrollToOffset: Int?
    var clearSelection: Bool

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        let textView = HighlightCursorTextView()
        textView.autoresizingMask = [.width]
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        let textContainer = textView.textContainer
        textContainer?.widthTracksTextView = true
        textContainer?.containerSize = NSSize(width: scrollView.contentSize.width, height: CGFloat.greatestFiniteMagnitude)
        scrollView.documentView = textView
        scrollView.hasVerticalScroller = true
        scrollView.drawsBackground = false

        textView.isEditable = true
        textView.isSelectable = true
        textView.allowsUndo = true
        textView.isRichText = true
        textView.usesFontPanel = false
        textView.usesRuler = false
        textView.isAutomaticQuoteSubstitutionEnabled = true
        textView.isAutomaticDashSubstitutionEnabled = true
        textView.textContainerInset = NSSize(width: 0, height: 32)
        textView.textContainer?.lineFragmentPadding = 0
        textView.backgroundColor = .clear

        // Set up default typing attributes
        textView.typingAttributes = defaultAttributes()

        textView.delegate = context.coordinator
        context.coordinator.scrollView = scrollView

        // Initial content
        setAttributedContent(textView: textView, content: content)

        // Observe scroll changes for margin rail highlight positions
        scrollView.contentView.postsBoundsChangedNotifications = true
        context.coordinator.scrollObserver = NotificationCenter.default.addObserver(
            forName: NSView.boundsDidChangeNotification,
            object: scrollView.contentView,
            queue: .main
        ) { [weak coordinator = context.coordinator] _ in
            coordinator?.computeHighlightPositions()
        }

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NSTextView else { return }
        // Only update if content actually changed (avoid feedback loop)
        if context.coordinator.isUpdatingFromSwift { return }
        let currentText = textView.string
        // Compare against cleaned content since setAttributedContent strips HTML
        let cleanedContent = stripHTMLTags(content)
        if currentText != cleanedContent {
            context.coordinator.isUpdatingFromSwift = true
            let selectedRange = textView.selectedRange()
            setAttributedContent(textView: textView, content: content)
            // Restore selection (use UTF-16 length for safety)
            let nsLen = (textView.string as NSString).length
            let safeRange = NSRange(
                location: min(selectedRange.location, nsLen),
                length: 0
            )
            textView.setSelectedRange(safeRange)
            context.coordinator.isUpdatingFromSwift = false
        }

        // Re-apply highlights
        applyHighlights(textView: textView)

        // Recompute highlight positions for margin rail
        context.coordinator.computeHighlightPositions()

        // Scroll to offset if requested (consume once)
        if let offset = scrollToOffset,
           offset != context.coordinator.lastScrolledOffset,
           offset < (textView.string as NSString).length {
            let range = NSRange(location: offset, length: 0)
            textView.scrollRangeToVisible(range)
            context.coordinator.lastScrolledOffset = offset
        } else if scrollToOffset == nil {
            context.coordinator.lastScrolledOffset = nil
        }

        // Clear native selection when requested (after highlight creation)
        if clearSelection {
            let pos = textView.selectedRange().location
            textView.setSelectedRange(NSRange(location: pos, length: 0))
            DispatchQueue.main.async {
                self.onSelectionChange(NSRange(location: pos, length: 0), .zero, "")
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    private func defaultAttributes() -> [NSAttributedString.Key: Any] {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineSpacing = settings.fontSize.cgFloat * (settings.lineSpacing.multiplier - 1.0)
        paragraphStyle.paragraphSpacing = settings.fontSize.cgFloat * 0.6

        return [
            .font: NSFont(name: "Georgia", size: settings.fontSize.cgFloat)
                ?? NSFont.systemFont(ofSize: settings.fontSize.cgFloat),
            .foregroundColor: NSColor.textColor,
            .paragraphStyle: paragraphStyle,
        ]
    }

    private func setAttributedContent(textView: NSTextView, content: String) {
        let cleaned = stripHTMLTags(content)
        let attributed = renderMarkdownSyntaxHighlighted(cleaned)
        textView.textStorage?.setAttributedString(attributed)
    }

    /// Strip common HTML tags from content (e.g. <mark>, <strong>, <em>, <br>).
    /// These come from Tauri-era highlights stored inline in markdown files.
    private func stripHTMLTags(_ text: String) -> String {
        guard let regex = try? NSRegularExpression(
            pattern: "</?(?:mark|strong|em|b|i|br|span|div|p)(?:\\s[^>]*)?\\/?>",
            options: .caseInsensitive
        ) else { return text }
        return regex.stringByReplacingMatches(
            in: text,
            range: NSRange(location: 0, length: (text as NSString).length),
            withTemplate: ""
        )
    }

    // MARK: - Syntax-Highlighted Markdown Renderer
    //
    // Preserves raw markdown text (textView.string == original markdown).
    // Applies visual styles via attributes; syntax characters (# ** * ` > etc.) are dimmed.

    /// Attributes that make syntax characters invisible (clear color + tiny font).
    private func hiddenSyntaxAttrs() -> [NSAttributedString.Key: Any] {
        [
            .foregroundColor: NSColor.clear,
            .font: NSFont.systemFont(ofSize: 0.01),
        ]
    }

    private func renderMarkdownSyntaxHighlighted(_ markdown: String) -> NSAttributedString {
        let result = NSMutableAttributedString(string: markdown, attributes: defaultAttributes())
        let nsText = markdown as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        guard fullRange.length > 0 else { return result }

        let hidden = hiddenSyntaxAttrs()
        let fontSize = settings.fontSize.cgFloat

        // --- Block-level styles (line by line) ---
        var lineStart = 0
        for line in markdown.components(separatedBy: "\n") {
            let lineLen = (line as NSString).length
            let lineRange = NSRange(location: lineStart, length: lineLen)

            if let (level, prefixLen) = headingMatch(line) {
                let scales: [CGFloat] = [0, 1.8, 1.4, 1.2, 1.1, 1.05, 1.0]
                let scale = level <= 6 ? scales[level] : 1.0
                let headingFont = NSFontManager.shared.convert(
                    NSFont(name: "Georgia", size: fontSize * scale) ?? NSFont.systemFont(ofSize: fontSize * scale),
                    toHaveTrait: .boldFontMask
                )
                let style = NSMutableParagraphStyle()
                style.paragraphSpacing = fontSize * 0.4
                if level > 1 { style.paragraphSpacingBefore = fontSize * 0.8 }
                // Apply heading style to content (after prefix)
                let contentStart = lineStart + prefixLen
                let contentLen = lineLen - prefixLen
                if contentLen > 0 {
                    result.addAttribute(.font, value: headingFont,
                        range: NSRange(location: contentStart, length: contentLen))
                }
                result.addAttribute(.paragraphStyle, value: style, range: lineRange)
                // Hide the "## " prefix
                if prefixLen > 0, prefixLen <= lineLen {
                    result.addAttributes(hidden,
                        range: NSRange(location: lineStart, length: prefixLen))
                }
            } else if line.hasPrefix("> ") {
                let style = NSMutableParagraphStyle()
                style.headIndent = 24
                style.firstLineHeadIndent = 24
                style.paragraphSpacing = fontSize * 0.4
                result.addAttribute(.paragraphStyle, value: style, range: lineRange)
                if let italicFont = NSFont(name: "Georgia-Italic", size: fontSize) {
                    result.addAttribute(.font, value: italicFont, range: lineRange)
                }
                result.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: lineRange)
                // Hide "> " prefix
                result.addAttributes(hidden,
                    range: NSRange(location: lineStart, length: min(2, lineLen)))
            } else if line == "---" || line == "***" || line == "___" {
                result.addAttribute(.foregroundColor, value: NSColor.separatorColor, range: lineRange)
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("+ ") {
                let style = NSMutableParagraphStyle()
                style.headIndent = 24
                style.firstLineHeadIndent = 8
                style.paragraphSpacing = fontSize * 0.2
                result.addAttribute(.paragraphStyle, value: style, range: lineRange)
                // Replace "- " with bullet: hide the marker char, keep visual spacing
                let bulletRange = NSRange(location: lineStart, length: 1)
                result.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: bulletRange)
            } else if line.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil {
                let style = NSMutableParagraphStyle()
                style.headIndent = 28
                style.firstLineHeadIndent = 8
                style.paragraphSpacing = fontSize * 0.2
                result.addAttribute(.paragraphStyle, value: style, range: lineRange)
            } else if line.hasPrefix("    ") || line.hasPrefix("\t") {
                // Indented code block
                let codeFont = NSFont.monospacedSystemFont(ofSize: fontSize * 0.85, weight: .regular)
                result.addAttribute(.font, value: codeFont, range: lineRange)
                result.addAttribute(.backgroundColor, value: NSColor.quaternaryLabelColor, range: lineRange)
                result.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: lineRange)
            }

            lineStart += lineLen + 1 // +1 for the \n separator
        }

        // --- Code blocks (```...```) ---
        if let fenceRegex = try? NSRegularExpression(pattern: "```([^\\n]*)\\n([\\s\\S]*?)```") {
            for match in fenceRegex.matches(in: markdown, range: fullRange) {
                let codeFont = NSFont.monospacedSystemFont(ofSize: fontSize * 0.85, weight: .regular)
                // Style the code content
                let contentRange = match.range(at: 2)
                result.addAttribute(.font, value: codeFont, range: contentRange)
                result.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: contentRange)
                result.addAttribute(.backgroundColor, value: NSColor.quaternaryLabelColor, range: contentRange)
                // Hide the ``` delimiters (opening line and closing ```)
                let openStart = match.range.location
                let openLen = contentRange.location - openStart
                if openLen > 0 {
                    result.addAttributes(hidden, range: NSRange(location: openStart, length: openLen))
                }
                let closeStart = contentRange.location + contentRange.length
                let closeLen = (match.range.location + match.range.length) - closeStart
                if closeLen > 0 {
                    result.addAttributes(hidden, range: NSRange(location: closeStart, length: closeLen))
                }
            }
        }

        // --- Inline styles ---

        // Inline code: `text`
        if let regex = try? NSRegularExpression(pattern: "(?<!`)`(?!`)([^`\\n]+?)`(?!`)") {
            for match in regex.matches(in: markdown, range: fullRange) {
                let contentRange = match.range(at: 1)
                let codeFont = NSFont.monospacedSystemFont(ofSize: fontSize * 0.9, weight: .regular)
                result.addAttribute(.font, value: codeFont, range: contentRange)
                result.addAttribute(.backgroundColor, value: NSColor.quaternaryLabelColor, range: contentRange)
                // Hide backticks
                result.addAttributes(hidden,
                    range: NSRange(location: match.range.location, length: 1))
                result.addAttributes(hidden,
                    range: NSRange(location: match.range.location + match.range.length - 1, length: 1))
            }
        }

        // Bold: **text**
        if let regex = try? NSRegularExpression(pattern: "\\*\\*(.+?)\\*\\*") {
            for match in regex.matches(in: markdown, range: fullRange) {
                let contentRange = match.range(at: 1)
                if let base = result.attribute(.font, at: contentRange.location, effectiveRange: nil) as? NSFont {
                    let bold = NSFontManager.shared.convert(base, toHaveTrait: .boldFontMask)
                    result.addAttribute(.font, value: bold, range: contentRange)
                }
                // Hide ** delimiters
                result.addAttributes(hidden,
                    range: NSRange(location: match.range.location, length: 2))
                result.addAttributes(hidden,
                    range: NSRange(location: match.range.location + match.range.length - 2, length: 2))
            }
        }

        // Italic: *text* (not inside bold **)
        if let regex = try? NSRegularExpression(pattern: "(?<!\\*)\\*([^*]+)\\*(?!\\*)") {
            for match in regex.matches(in: markdown, range: fullRange) {
                let contentRange = match.range(at: 1)
                if let base = result.attribute(.font, at: contentRange.location, effectiveRange: nil) as? NSFont {
                    let italic = NSFontManager.shared.convert(base, toHaveTrait: .italicFontMask)
                    result.addAttribute(.font, value: italic, range: contentRange)
                }
                // Hide * delimiters
                result.addAttributes(hidden,
                    range: NSRange(location: match.range.location, length: 1))
                result.addAttributes(hidden,
                    range: NSRange(location: match.range.location + match.range.length - 1, length: 1))
            }
        }

        // Links: [text](url)
        if let regex = try? NSRegularExpression(pattern: "\\[([^\\]]+)\\]\\(([^)]+)\\)") {
            for match in regex.matches(in: markdown, range: fullRange) {
                let textRange = match.range(at: 1)
                let urlRange = match.range(at: 2)
                result.addAttribute(.foregroundColor, value: NSColor.linkColor, range: textRange)
                let urlStr = nsText.substring(with: urlRange)
                if let url = URL(string: urlStr) {
                    result.addAttribute(.link, value: url, range: textRange)
                }
                // Hide [, ](url) syntax
                result.addAttributes(hidden,
                    range: NSRange(location: match.range.location, length: 1))
                let afterText = textRange.location + textRange.length
                let trailingLen = match.range.location + match.range.length - afterText
                if trailingLen > 0 {
                    result.addAttributes(hidden,
                        range: NSRange(location: afterText, length: trailingLen))
                }
            }
        }

        // Images: ![alt](url) — hide syntax, show alt text
        if let regex = try? NSRegularExpression(pattern: "!\\[([^\\]]*)\\]\\(([^)]+)\\)") {
            for match in regex.matches(in: markdown, range: fullRange) {
                // Hide all syntax
                result.addAttributes(hidden, range: match.range)
                // But show the alt text
                let altRange = match.range(at: 1)
                if altRange.length > 0 {
                    let altAttrs: [NSAttributedString.Key: Any] = [
                        .foregroundColor: NSColor.secondaryLabelColor,
                        .font: NSFont(name: "Georgia-Italic", size: fontSize)
                            ?? NSFont.systemFont(ofSize: fontSize),
                    ]
                    result.addAttributes(altAttrs, range: altRange)
                }
            }
        }

        return result
    }

    private func headingMatch(_ line: String) -> (level: Int, prefixLength: Int)? {
        var level = 0
        for ch in line {
            if ch == "#" { level += 1 }
            else if ch == " " && level > 0 && level <= 6 { return (level, level + 1) }
            else { return nil }
        }
        return nil
    }

    /// Custom attribute key to tag ranges as annotation highlights (vs code block backgrounds).
    private static let highlightTagKey = NSAttributedString.Key("marginHighlight")
    /// Custom attribute key storing the highlight ID for click hit-testing.
    static let highlightIdKey = NSAttributedString.Key("marginHighlightId")

    /// Apply highlight backgrounds from the stored highlights.
    private func applyHighlights(textView: NSTextView) {
        guard let storage = textView.textStorage else { return }
        let fullText = textView.string as NSString
        let fullLength = fullText.length

        // Only remove backgrounds on ranges we previously tagged as annotation highlights
        storage.beginEditing()
        storage.enumerateAttribute(Self.highlightTagKey, in: NSRange(location: 0, length: fullLength)) { value, range, _ in
            if value != nil {
                storage.removeAttribute(.backgroundColor, range: range)
                storage.addAttribute(.foregroundColor, value: NSColor.textColor, range: range)
                storage.removeAttribute(Self.highlightTagKey, range: range)
                storage.removeAttribute(Self.highlightIdKey, range: range)
            }
        }

        for highlight in highlights {
            // Reconstruct anchor from stored highlight fields
            let headingPath: [String] = {
                guard let json = highlight.anchorHeadingPath,
                      let data = json.data(using: .utf8),
                      let decoded = try? JSONDecoder().decode([String].self, from: data) else {
                    return []
                }
                return decoded
            }()

            let anchor = TextAnchor(
                text: highlight.textContent,
                prefix: highlight.prefixContext ?? "",
                suffix: highlight.suffixContext ?? "",
                from: Int(highlight.fromPos),
                to: Int(highlight.toPos),
                headingPath: headingPath
            )

            let result = resolveAnchor(fullText: fullText as String, anchor: anchor)
            guard result.confidence != .orphaned else { continue }

            let range = NSRange(location: result.from, length: result.to - result.from)
            guard range.location >= 0, NSMaxRange(range) <= fullLength else { continue }

            let color = HighlightColor(rawValue: highlight.color)?.nsColor
                ?? HighlightColor.yellow.nsColor
            storage.addAttribute(.backgroundColor, value: color, range: range)
            storage.addAttribute(.foregroundColor, value: NSColor(name: nil) { appearance in
                appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil
                    ? NSColor(white: 0.95, alpha: 1.0)
                    : NSColor(white: 0.1, alpha: 1.0)
            }, range: range)
            storage.addAttribute(Self.highlightTagKey, value: true, range: range)
            storage.addAttribute(Self.highlightIdKey, value: highlight.id, range: range)
        }

        storage.endEditing()

        // Invalidate cursor rects so resetCursorRects picks up new highlight ranges
        textView.window?.invalidateCursorRects(for: textView)
    }

    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: MarkdownTextView
        var isUpdatingFromSwift = false
        var lastScrolledOffset: Int?
        weak var scrollView: NSScrollView?
        var scrollObserver: Any?
        private var throttleWorkItem: DispatchWorkItem?

        init(_ parent: MarkdownTextView) {
            self.parent = parent
        }

        deinit {
            if let observer = scrollObserver {
                NotificationCenter.default.removeObserver(observer)
            }
            throttleWorkItem?.cancel()
        }

        /// Compute viewport positions of all visible highlights for the margin rail.
        func computeHighlightPositions() {
            throttleWorkItem?.cancel()
            let workItem = DispatchWorkItem { [weak self] in
                self?.doComputeHighlightPositions()
            }
            throttleWorkItem = workItem
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(16), execute: workItem)
        }

        private func doComputeHighlightPositions() {
            guard let scrollView = scrollView,
                  let textView = scrollView.documentView as? NSTextView,
                  let layoutManager = textView.layoutManager,
                  let textContainer = textView.textContainer,
                  let storage = textView.textStorage else {
                parent.onScrollChange?([:])
                return
            }

            let visibleRect = scrollView.contentView.bounds
            let lookahead: CGFloat = 100
            let extendedVisible = visibleRect.insetBy(dx: 0, dy: -lookahead)
            let fullLength = (textView.string as NSString).length
            guard fullLength > 0 else {
                parent.onScrollChange?([:])
                return
            }

            var positions: [String: HighlightPosition] = [:]

            var searchStart = 0
            while searchStart < fullLength {
                var effectiveRange = NSRange(location: 0, length: 0)
                let highlightId = storage.attribute(
                    MarkdownTextView.highlightIdKey,
                    at: searchStart,
                    effectiveRange: &effectiveRange
                ) as? String

                if let highlightId = highlightId, !highlightId.isEmpty {
                    let glyphRange = layoutManager.glyphRange(forCharacterRange: effectiveRange, actualCharacterRange: nil)
                    let textRect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
                    let containerOrigin = textView.textContainerOrigin
                    let docRect = textRect.offsetBy(dx: containerOrigin.x, dy: containerOrigin.y)

                    if docRect.intersects(extendedVisible) {
                        let windowRect = textView.convert(docRect, to: nil)
                        let globalRect = Self.appKitToSwiftUIGlobal(windowRect, in: textView.window)
                        positions[highlightId] = HighlightPosition(
                            highlightId: highlightId,
                            viewportY: globalRect.origin.y,
                            height: globalRect.height
                        )
                    }
                }

                searchStart = effectiveRange.location + effectiveRange.length
                if searchStart <= effectiveRange.location { break }
            }

            parent.onScrollChange?(positions)
        }

        /// Convert an AppKit window-coordinate rect to SwiftUI `.global` coordinates.
        /// AppKit: Y=0 at bottom, SwiftUI: Y=0 at top.
        static func appKitToSwiftUIGlobal(_ windowRect: CGRect, in window: NSWindow?) -> CGRect {
            guard let contentHeight = window?.contentView?.bounds.height else { return windowRect }
            return flipWindowRectToSwiftUITopLeft(windowRect, referenceHeight: contentHeight)
        }

        func textDidChange(_ notification: Notification) {
            guard !isUpdatingFromSwift else { return }
            guard let textView = notification.object as? NSTextView else { return }
            parent.onContentChange(textView.string)
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            let range = textView.selectedRange()

            if range.length > 0,
               let layoutManager = textView.layoutManager,
               let textContainer = textView.textContainer {
                let glyphRange = layoutManager.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
                let rect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
                let containerOrigin = textView.textContainerOrigin
                let textViewRect = rect.offsetBy(dx: containerOrigin.x, dy: containerOrigin.y)
                // Convert from NSTextView document coords → window coords → SwiftUI global coords
                let windowRect = textView.convert(textViewRect, to: nil)
                let globalRect = Self.appKitToSwiftUIGlobal(windowRect, in: textView.window)
                let selectedText = (textView.string as NSString).substring(with: range)
                parent.onSelectionChange(range, globalRect, selectedText)
            } else {
                parent.onSelectionChange(range, .zero, "")

                // Click on highlight: check if the caret is inside a highlighted range
                let length = (textView.string as NSString).length
                if range.length == 0, let storage = textView.textStorage {
                    let checkPos = range.location < length ? range.location : max(0, range.location - 1)
                    var effectiveRange = NSRange(location: 0, length: 0)
                    if checkPos < length,
                       let highlightId = storage.attribute(
                           MarkdownTextView.highlightIdKey,
                           at: checkPos,
                           effectiveRange: &effectiveRange
                       ) as? String {
                        // Compute the rect of the highlight for anchored positioning
                        var rect = CGRect.zero
                        if let layoutManager = textView.layoutManager,
                           let textContainer = textView.textContainer {
                            let glyphRange = layoutManager.glyphRange(forCharacterRange: effectiveRange, actualCharacterRange: nil)
                            let textRect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
                            let containerOrigin = textView.textContainerOrigin
                            let textViewRect = textRect.offsetBy(dx: containerOrigin.x, dy: containerOrigin.y)
                            let windowRect = textView.convert(textViewRect, to: nil)
                            rect = Self.appKitToSwiftUIGlobal(windowRect, in: textView.window)
                        }
                        parent.onHighlightClick(highlightId, rect)
                    } else {
                        // Clicked on non-highlight text — dismiss any open highlight popover
                        parent.onHighlightClick("", .zero)
                    }
                }
            }
        }
    }
}

/// Custom NSTextView subclass that shows a pointing hand cursor over highlights.
class HighlightCursorTextView: NSTextView {
    private var cursorTrackingArea: NSTrackingArea?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = cursorTrackingArea {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.mouseMoved, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        cursorTrackingArea = area
    }

    override func mouseMoved(with event: NSEvent) {
        // Do NOT call super — NSTextView's mouseMoved reasserts the iBeam cursor
        let point = convert(event.locationInWindow, from: nil)
        let length = (string as NSString).length

        guard length > 0,
              let layoutManager = layoutManager,
              let textContainer = textContainer else {
            NSCursor.iBeam.set()
            return
        }

        let containerPoint = NSPoint(
            x: point.x - textContainerOrigin.x,
            y: point.y - textContainerOrigin.y
        )

        var fraction: CGFloat = 0
        let charIndex = layoutManager.characterIndex(
            for: containerPoint,
            in: textContainer,
            fractionOfDistanceBetweenInsertionPoints: &fraction
        )

        if charIndex < length,
           let storage = textStorage,
           storage.attribute(MarkdownTextView.highlightIdKey, at: charIndex, effectiveRange: nil) != nil {
            NSCursor.pointingHand.set()
        } else {
            NSCursor.iBeam.set()
        }
    }
}

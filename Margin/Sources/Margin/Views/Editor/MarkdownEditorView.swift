import SwiftUI

/// SwiftUI wrapper around a native NSTextView for rendering and editing markdown
/// with multi-color highlight support.
struct MarkdownEditorView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
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
            onHighlightClick: { highlightId in
                appState.focusHighlightId = highlightId
            },
            scrollToOffset: appState.scrollToOffset,
            clearSelection: appState.clearEditorSelection
        )
        .frame(maxWidth: appState.settings.readerWidth.points)
        .padding(.horizontal, 40)
        .frame(maxWidth: .infinity)
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
    var onHighlightClick: (String) -> Void
    var scrollToOffset: Int?
    var clearSelection: Bool

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        let textView = scrollView.documentView as! NSTextView

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

        // Initial content
        setAttributedContent(textView: textView, content: content)

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NSTextView else { return }

        // Only update if content actually changed (avoid feedback loop)
        if context.coordinator.isUpdatingFromSwift { return }
        let currentText = textView.string
        if currentText != content {
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
        let attributed = renderMarkdownSyntaxHighlighted(content)
        textView.textStorage?.setAttributedString(attributed)
    }

    // MARK: - Syntax-Highlighted Markdown Renderer
    //
    // Preserves raw markdown text (textView.string == original markdown).
    // Applies visual styles via attributes; syntax characters (# ** * ` > etc.) are dimmed.

    private func renderMarkdownSyntaxHighlighted(_ markdown: String) -> NSAttributedString {
        let result = NSMutableAttributedString(string: markdown, attributes: defaultAttributes())
        let nsText = markdown as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        guard fullRange.length > 0 else { return result }

        let syntaxColor = NSColor.tertiaryLabelColor
        let fontSize = settings.fontSize.cgFloat

        // --- Block-level styles (line by line) ---
        var lineStart = 0
        for line in markdown.components(separatedBy: "\n") {
            let lineLen = (line as NSString).length
            let lineRange = NSRange(location: lineStart, length: lineLen)

            if let (level, prefixLen) = headingMatch(line) {
                let scales: [CGFloat] = [0, 1.8, 1.4, 1.2, 1.1, 1.05, 1.0]
                let scale = level <= 6 ? scales[level] : 1.0
                let headingFont = NSFont.systemFont(ofSize: fontSize * scale, weight: .semibold)
                let style = NSMutableParagraphStyle()
                style.paragraphSpacing = fontSize * 0.4
                if level > 1 { style.paragraphSpacingBefore = fontSize * 0.8 }
                result.addAttribute(.font, value: headingFont, range: lineRange)
                result.addAttribute(.paragraphStyle, value: style, range: lineRange)
                if prefixLen > 0, prefixLen <= lineLen {
                    result.addAttribute(.foregroundColor, value: syntaxColor,
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
                result.addAttribute(.foregroundColor, value: syntaxColor,
                    range: NSRange(location: lineStart, length: min(2, lineLen)))
            } else if line == "---" || line == "***" || line == "___" {
                result.addAttribute(.foregroundColor, value: NSColor.separatorColor, range: lineRange)
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("+ ") {
                let style = NSMutableParagraphStyle()
                style.headIndent = 24
                style.firstLineHeadIndent = 8
                style.paragraphSpacing = fontSize * 0.2
                result.addAttribute(.paragraphStyle, value: style, range: lineRange)
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
        if let fenceRegex = try? NSRegularExpression(pattern: "```[^\\n]*\\n[\\s\\S]*?```") {
            for match in fenceRegex.matches(in: markdown, range: fullRange) {
                let codeFont = NSFont.monospacedSystemFont(ofSize: fontSize * 0.85, weight: .regular)
                result.addAttribute(.font, value: codeFont, range: match.range)
                result.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: match.range)
                result.addAttribute(.backgroundColor, value: NSColor.quaternaryLabelColor, range: match.range)
            }
        }

        // --- Inline styles ---

        // Inline code: `text`
        if let regex = try? NSRegularExpression(pattern: "(?<!`)`(?!`)([^`\\n]+?)`(?!`)") {
            for match in regex.matches(in: markdown, range: fullRange) {
                let codeFont = NSFont.monospacedSystemFont(ofSize: fontSize * 0.9, weight: .regular)
                result.addAttribute(.font, value: codeFont, range: match.range)
                result.addAttribute(.backgroundColor, value: NSColor.quaternaryLabelColor, range: match.range)
                // Dim backticks
                result.addAttribute(.foregroundColor, value: syntaxColor,
                    range: NSRange(location: match.range.location, length: 1))
                result.addAttribute(.foregroundColor, value: syntaxColor,
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
                // Dim ** delimiters
                result.addAttribute(.foregroundColor, value: syntaxColor,
                    range: NSRange(location: match.range.location, length: 2))
                result.addAttribute(.foregroundColor, value: syntaxColor,
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
                // Dim * delimiters
                result.addAttribute(.foregroundColor, value: syntaxColor,
                    range: NSRange(location: match.range.location, length: 1))
                result.addAttribute(.foregroundColor, value: syntaxColor,
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
                // Dim all syntax around the link text: [, ](url)
                result.addAttribute(.foregroundColor, value: syntaxColor,
                    range: NSRange(location: match.range.location, length: 1))
                let afterText = textRange.location + textRange.length
                let trailingLen = match.range.location + match.range.length - afterText
                if trailingLen > 0 {
                    result.addAttribute(.foregroundColor, value: syntaxColor,
                        range: NSRange(location: afterText, length: trailingLen))
                }
            }
        }

        // Images: ![alt](url) — dim everything, show alt text in italic
        if let regex = try? NSRegularExpression(pattern: "!\\[([^\\]]*)\\]\\(([^)]+)\\)") {
            for match in regex.matches(in: markdown, range: fullRange) {
                result.addAttribute(.foregroundColor, value: syntaxColor, range: match.range)
                let altRange = match.range(at: 1)
                if altRange.length > 0 {
                    result.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: altRange)
                    if let base = result.attribute(.font, at: altRange.location, effectiveRange: nil) as? NSFont {
                        result.addAttribute(.font, value: NSFontManager.shared.convert(base, toHaveTrait: .italicFontMask), range: altRange)
                    }
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
                storage.removeAttribute(Self.highlightTagKey, range: range)
                storage.removeAttribute(Self.highlightIdKey, range: range)
            }
        }

        for highlight in highlights {
            // Try exact position first
            let from = Int(highlight.fromPos)
            let to = Int(highlight.toPos)

            if from >= 0, to <= fullLength, from < to {
                let range = NSRange(location: from, length: to - from)
                let textAtPos = fullText.substring(with: range)
                if textAtPos == highlight.textContent {
                    let color = HighlightColor(rawValue: highlight.color)?.nsColor
                        ?? HighlightColor.yellow.nsColor
                    storage.addAttribute(.backgroundColor, value: color, range: range)
                    storage.addAttribute(Self.highlightTagKey, value: true, range: range)
                    storage.addAttribute(Self.highlightIdKey, value: highlight.id, range: range)
                    continue
                }
            }

            // Fallback: search for the text
            let searchRange = fullText.range(of: highlight.textContent)
            if searchRange.location != NSNotFound {
                let color = HighlightColor(rawValue: highlight.color)?.nsColor
                    ?? HighlightColor.yellow.nsColor
                storage.addAttribute(.backgroundColor, value: color, range: searchRange)
                storage.addAttribute(Self.highlightTagKey, value: true, range: searchRange)
                storage.addAttribute(Self.highlightIdKey, value: highlight.id, range: searchRange)
            }
        }

        storage.endEditing()
    }

    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: MarkdownTextView
        var isUpdatingFromSwift = false
        var lastScrolledOffset: Int?

        init(_ parent: MarkdownTextView) {
            self.parent = parent
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
                // Convert from NSTextView document coords to window coords
                let windowRect = textView.convert(textViewRect, to: nil)
                let selectedText = (textView.string as NSString).substring(with: range)
                parent.onSelectionChange(range, windowRect, selectedText)
            } else {
                parent.onSelectionChange(range, .zero, "")

                // Click on highlight: check if the caret is inside a highlighted range
                let length = (textView.string as NSString).length
                if range.length == 0, let storage = textView.textStorage {
                    let checkPos = range.location < length ? range.location : max(0, range.location - 1)
                    if checkPos < length,
                       let highlightId = storage.attribute(
                           MarkdownTextView.highlightIdKey,
                           at: checkPos,
                           effectiveRange: nil
                       ) as? String {
                        parent.onHighlightClick(highlightId)
                    }
                }
            }
        }
    }
}

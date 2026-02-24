import SwiftUI
import Markdown

/// SwiftUI wrapper around a native NSTextView for rendering and editing markdown
/// with multi-color highlight support.
struct MarkdownEditorView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                MarkdownTextView(
                    content: $appState.content,
                    highlights: appState.highlights,
                    settings: appState.settings,
                    onContentChange: { newContent in
                        appState.updateContent(newContent)
                    },
                    onSelectionChange: { range in
                        // Selection tracking for floating toolbar
                    },
                    onHighlightClick: { highlightId in
                        appState.focusHighlightId = highlightId
                    }
                )
                .frame(maxWidth: appState.settings.readerWidth.points)
                .padding(.horizontal, 40)
                .padding(.vertical, 32)
            }
            .frame(maxWidth: .infinity)
        }
        .overlay(alignment: .topTrailing) {
            // Floating toolbar appears on text selection
            FloatingToolbarView()
                .environmentObject(appState)
        }
        .overlay {
            // Highlight thread popover
            if let highlightId = appState.focusHighlightId,
               let highlight = appState.highlights.first(where: { $0.id == highlightId }) {
                HighlightThreadView(
                    highlight: highlight,
                    notes: appState.notesForHighlight(highlightId)
                )
                .environmentObject(appState)
            }
        }
    }
}

/// NSViewRepresentable wrapping NSTextView for rich markdown editing with highlights.
struct MarkdownTextView: NSViewRepresentable {
    @Binding var content: String
    let highlights: [Highlight]
    let settings: AppSettings
    var onContentChange: (String) -> Void
    var onSelectionChange: (NSRange) -> Void
    var onHighlightClick: (String) -> Void

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
        textView.textContainerInset = NSSize(width: 0, height: 16)
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
            // Restore selection
            let safeRange = NSRange(
                location: min(selectedRange.location, textView.string.count),
                length: 0
            )
            textView.setSelectedRange(safeRange)
            context.coordinator.isUpdatingFromSwift = false
        }

        // Re-apply highlights
        applyHighlights(textView: textView)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    private func defaultAttributes() -> [NSAttributedString.Key: Any] {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineSpacing = settings.fontSize.cgFloat * (settings.lineSpacing.multiplier - 1.0)

        return [
            .font: NSFont(name: "Georgia", size: settings.fontSize.cgFloat)
                ?? NSFont.systemFont(ofSize: settings.fontSize.cgFloat),
            .foregroundColor: NSColor.textColor,
            .paragraphStyle: paragraphStyle,
        ]
    }

    private func setAttributedContent(textView: NSTextView, content: String) {
        let attributed = renderMarkdownToAttributedString(content)
        textView.textStorage?.setAttributedString(attributed)
    }

    /// Convert markdown string to NSAttributedString with proper styling.
    private func renderMarkdownToAttributedString(_ markdown: String) -> NSAttributedString {
        let document = Markdown.Document(parsing: markdown)
        let visitor = MarkdownAttributedStringVisitor(
            fontSize: settings.fontSize.cgFloat,
            lineSpacing: settings.lineSpacing.multiplier
        )
        return visitor.visit(document)
    }

    /// Apply highlight backgrounds from the stored highlights.
    private func applyHighlights(textView: NSTextView) {
        guard let storage = textView.textStorage else { return }
        let fullText = textView.string as NSString
        let fullLength = fullText.length

        // Remove all existing highlight backgrounds first
        storage.beginEditing()
        storage.removeAttribute(.backgroundColor, range: NSRange(location: 0, length: fullLength))

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
                    continue
                }
            }

            // Fallback: search for the text
            let searchRange = fullText.range(of: highlight.textContent)
            if searchRange.location != NSNotFound {
                let color = HighlightColor(rawValue: highlight.color)?.nsColor
                    ?? HighlightColor.yellow.nsColor
                storage.addAttribute(.backgroundColor, value: color, range: searchRange)
            }
        }

        storage.endEditing()
    }

    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: MarkdownTextView
        var isUpdatingFromSwift = false

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
            parent.onSelectionChange(textView.selectedRange())
        }
    }
}

// MARK: - Markdown → NSAttributedString Visitor

/// Walks the swift-markdown AST and produces an NSAttributedString.
class MarkdownAttributedStringVisitor {
    let fontSize: CGFloat
    let lineSpacing: CGFloat

    init(fontSize: CGFloat, lineSpacing: CGFloat) {
        self.fontSize = fontSize
        self.lineSpacing = lineSpacing
    }

    func visit(_ document: Markdown.Document) -> NSAttributedString {
        let result = NSMutableAttributedString()
        for child in document.children {
            result.append(visitBlock(child))
        }
        return result
    }

    private var bodyFont: NSFont {
        NSFont(name: "Georgia", size: fontSize)
            ?? NSFont.systemFont(ofSize: fontSize)
    }

    private var bodyParagraphStyle: NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = fontSize * (lineSpacing - 1.0)
        style.paragraphSpacing = fontSize * 0.6
        return style
    }

    private func visitBlock(_ markup: any Markup) -> NSAttributedString {
        let result = NSMutableAttributedString()

        if let heading = markup as? Heading {
            let size: CGFloat
            switch heading.level {
            case 1: size = fontSize * 1.8
            case 2: size = fontSize * 1.4
            case 3: size = fontSize * 1.2
            default: size = fontSize * 1.1
            }

            let style = NSMutableParagraphStyle()
            style.paragraphSpacing = fontSize * 0.4
            style.paragraphSpacingBefore = heading.level == 1 ? 0 : fontSize * 0.8

            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: size, weight: .semibold),
                .foregroundColor: NSColor.textColor,
                .paragraphStyle: style,
            ]

            for child in heading.children {
                result.append(visitInline(child, baseAttributes: attrs))
            }
            result.append(NSAttributedString(string: "\n"))
        } else if let para = markup as? Paragraph {
            let attrs: [NSAttributedString.Key: Any] = [
                .font: bodyFont,
                .foregroundColor: NSColor.textColor,
                .paragraphStyle: bodyParagraphStyle,
            ]
            for child in para.children {
                result.append(visitInline(child, baseAttributes: attrs))
            }
            result.append(NSAttributedString(string: "\n"))
        } else if let blockquote = markup as? BlockQuote {
            let style = NSMutableParagraphStyle()
            style.headIndent = 24
            style.firstLineHeadIndent = 24
            style.paragraphSpacing = fontSize * 0.4
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont(name: "Georgia-Italic", size: fontSize) ?? bodyFont,
                .foregroundColor: NSColor.secondaryLabelColor,
                .paragraphStyle: style,
            ]
            for child in blockquote.children {
                if let para = child as? Paragraph {
                    for inline in para.children {
                        result.append(visitInline(inline, baseAttributes: attrs))
                    }
                } else {
                    result.append(visitBlock(child))
                }
            }
            result.append(NSAttributedString(string: "\n"))
        } else if markup is ThematicBreak {
            let style = NSMutableParagraphStyle()
            style.paragraphSpacingBefore = fontSize * 0.5
            style.paragraphSpacing = fontSize * 0.5
            result.append(NSAttributedString(
                string: "───\n",
                attributes: [
                    .foregroundColor: NSColor.separatorColor,
                    .font: NSFont.systemFont(ofSize: fontSize * 0.8),
                    .paragraphStyle: style,
                ]
            ))
        } else if let codeBlock = markup as? CodeBlock {
            let style = NSMutableParagraphStyle()
            style.headIndent = 16
            style.firstLineHeadIndent = 16
            style.paragraphSpacing = fontSize * 0.4
            result.append(NSAttributedString(
                string: (codeBlock.code) + "\n",
                attributes: [
                    .font: NSFont.monospacedSystemFont(ofSize: fontSize * 0.85, weight: .regular),
                    .foregroundColor: NSColor.secondaryLabelColor,
                    .backgroundColor: NSColor.quaternaryLabelColor,
                    .paragraphStyle: style,
                ]
            ))
        } else if let list = markup as? UnorderedList {
            for (index, item) in list.listItems.enumerated() {
                let bullet = "•  "
                let style = NSMutableParagraphStyle()
                style.headIndent = 24
                style.firstLineHeadIndent = 8
                style.paragraphSpacing = fontSize * 0.2

                let itemStr = NSMutableAttributedString(string: bullet, attributes: [
                    .font: bodyFont,
                    .foregroundColor: NSColor.textColor,
                    .paragraphStyle: style,
                ])
                for child in item.children {
                    if let para = child as? Paragraph {
                        let attrs: [NSAttributedString.Key: Any] = [
                            .font: bodyFont,
                            .foregroundColor: NSColor.textColor,
                            .paragraphStyle: style,
                        ]
                        for inline in para.children {
                            itemStr.append(visitInline(inline, baseAttributes: attrs))
                        }
                    }
                }
                itemStr.append(NSAttributedString(string: "\n"))
                result.append(itemStr)
            }
        } else if let list = markup as? OrderedList {
            for (index, item) in list.listItems.enumerated() {
                let number = "\(index + 1).  "
                let style = NSMutableParagraphStyle()
                style.headIndent = 28
                style.firstLineHeadIndent = 8
                style.paragraphSpacing = fontSize * 0.2

                let itemStr = NSMutableAttributedString(string: number, attributes: [
                    .font: bodyFont,
                    .foregroundColor: NSColor.textColor,
                    .paragraphStyle: style,
                ])
                for child in item.children {
                    if let para = child as? Paragraph {
                        let attrs: [NSAttributedString.Key: Any] = [
                            .font: bodyFont,
                            .foregroundColor: NSColor.textColor,
                            .paragraphStyle: style,
                        ]
                        for inline in para.children {
                            itemStr.append(visitInline(inline, baseAttributes: attrs))
                        }
                    }
                }
                itemStr.append(NSAttributedString(string: "\n"))
                result.append(itemStr)
            }
        } else {
            // Generic fallback for other block types
            let attrs: [NSAttributedString.Key: Any] = [
                .font: bodyFont,
                .foregroundColor: NSColor.textColor,
                .paragraphStyle: bodyParagraphStyle,
            ]
            for child in markup.children {
                if child.childCount > 0 {
                    result.append(visitBlock(child))
                } else {
                    result.append(visitInline(child, baseAttributes: attrs))
                }
            }
        }

        return result
    }

    private func visitInline(_ markup: any Markup, baseAttributes: [NSAttributedString.Key: Any]) -> NSAttributedString {
        if let text = markup as? Markdown.Text {
            return NSAttributedString(string: text.string, attributes: baseAttributes)
        } else if let strong = markup as? Strong {
            var attrs = baseAttributes
            if let font = attrs[.font] as? NSFont {
                attrs[.font] = NSFontManager.shared.convert(font, toHaveTrait: .boldFontMask)
            }
            let result = NSMutableAttributedString()
            for child in strong.children {
                result.append(visitInline(child, baseAttributes: attrs))
            }
            return result
        } else if let emphasis = markup as? Emphasis {
            var attrs = baseAttributes
            if let font = attrs[.font] as? NSFont {
                attrs[.font] = NSFontManager.shared.convert(font, toHaveTrait: .italicFontMask)
            }
            let result = NSMutableAttributedString()
            for child in emphasis.children {
                result.append(visitInline(child, baseAttributes: attrs))
            }
            return result
        } else if let code = markup as? InlineCode {
            var attrs = baseAttributes
            let size = (attrs[.font] as? NSFont)?.pointSize ?? fontSize
            attrs[.font] = NSFont.monospacedSystemFont(ofSize: size * 0.9, weight: .regular)
            attrs[.backgroundColor] = NSColor.quaternaryLabelColor
            return NSAttributedString(string: code.code, attributes: attrs)
        } else if let link = markup as? Markdown.Link {
            var attrs = baseAttributes
            attrs[.foregroundColor] = NSColor.linkColor
            if let url = link.destination {
                attrs[.link] = URL(string: url)
            }
            let result = NSMutableAttributedString()
            for child in link.children {
                result.append(visitInline(child, baseAttributes: attrs))
            }
            return result
        } else if markup is SoftBreak {
            return NSAttributedString(string: " ", attributes: baseAttributes)
        } else if markup is LineBreak {
            return NSAttributedString(string: "\n", attributes: baseAttributes)
        } else {
            // Fallback: render children
            let result = NSMutableAttributedString()
            for child in markup.children {
                result.append(visitInline(child, baseAttributes: baseAttributes))
            }
            if result.length == 0, let plainText = markup as? any Markup {
                // Try to get plain text representation
                let range = plainText.range
                if let range {
                    // This is a generic node; just render as text
                }
            }
            return result
        }
    }
}

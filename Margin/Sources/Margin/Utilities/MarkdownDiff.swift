import Foundation

// MARK: - Compiled Regex Cache

private let diffRegexes: [(NSRegularExpression, String)] = {
    let patterns: [(String, String)] = [
        ("\\r\\n", "\n"),                           // CRLF → LF
        ("[ \\t]+$", ""),                            // Strip trailing whitespace per line (multiline)
        ("\\n{3,}", "\n\n"),                         // Collapse 3+ blank lines → 2
        ("__(.+?)__", "**$1**"),                     // __bold__ → **bold**
        ("^(\\*{3,}|-{3,}|_{3,})$", "---"),         // Normalize horizontal rules → ---
        ("&nbsp;", " "),                             // &nbsp; → space
        ("\\x{00A0}", " "),                          // Non-breaking space → space
        ("^(\\s*)[+\\-] ", "$1* "),                  // +/- list markers → *
        ("^(\\s*)\\d+[.)\\]] ", "$1" + "1. "),       // Ordered list numbers → 1
        ("^(#{1,6})([^ #])", "$1 $2"),               // Enforce space after # in headings
    ]
    return patterns.compactMap { (pattern, template) in
        guard let regex = try? NSRegularExpression(
            pattern: pattern,
            options: .anchorsMatchLines
        ) else { return nil }
        return (regex, template)
    }
}()

private let indentRegex: NSRegularExpression = {
    try! NSRegularExpression(pattern: "^( +)(\\*|-|\\d+[.)]) ", options: .anchorsMatchLines)
}()

/// Normalize markdown to a canonical form for meaningful diff comparison.
/// Strips cosmetic differences that don't affect rendered output.
func normalizeMarkdown(_ text: String) -> String {
    var result = text

    for (regex, template) in diffRegexes {
        result = regex.stringByReplacingMatches(
            in: result,
            range: NSRange(location: 0, length: (result as NSString).length),
            withTemplate: template
        )
    }

    // Normalize list indent to even spaces (1-2 → 2, 3-4 → 4, etc.)
    let nsResult = result as NSString
    let matches = indentRegex.matches(in: result, range: NSRange(location: 0, length: nsResult.length))
    // Process in reverse so ranges stay valid
    let mutable = NSMutableString(string: result)
    for match in matches.reversed() {
        let indentRange = match.range(at: 1)
        let indent = nsResult.substring(with: indentRange)
        let normalized = String(repeating: " ", count: ((indent.count + 1) / 2) * 2)
        mutable.replaceCharacters(in: indentRange, with: normalized)
    }
    result = mutable as String

    return result.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Compare two markdown strings, ignoring cosmetic differences.
/// Returns true if the content has changed meaningfully.
func hasMeaningfulDiff(_ a: String, _ b: String) -> Bool {
    normalizeMarkdown(a) != normalizeMarkdown(b)
}

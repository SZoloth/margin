import Foundation

/// Anchor data for a text highlight, enabling re-location after document edits.
struct TextAnchor {
    let text: String
    let prefix: String   // ~30 chars before
    let suffix: String   // ~30 chars after
    let from: Int
    let to: Int
    var headingPath: [String] = []
}

enum AnchorConfidence {
    case exact
    case fuzzy
    case orphaned
}

struct AnchorResult {
    let from: Int
    let to: Int
    let confidence: AnchorConfidence
}

// MARK: - Regex Cache

/// File-scope lazy regex cache for normalizeAnchorText
private let markdownInlineRegexes: [(NSRegularExpression, String)] = {
    let patterns: [(String, String)] = [
        ("\\*\\*(.+?)\\*\\*", "$1"),    // **bold**
        ("__(.+?)__", "$1"),             // __bold__
        ("\\*(.+?)\\*", "$1"),           // *italic*
        ("_(.+?)_", "$1"),               // _italic_
        ("`(.+?)`", "$1"),              // `code`
        ("~~(.+?)~~", "$1"),             // ~~strikethrough~~
    ]
    return patterns.compactMap { (pattern, template) in
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        return (regex, template)
    }
}()

private let whitespaceCollapseRegex: NSRegularExpression = {
    try! NSRegularExpression(pattern: "\\s+")
}()

// MARK: - Public API

/// Extract anchoring context from the current document for a selection.
func createAnchor(fullText: String, from: Int, to: Int) -> TextAnchor {
    let nsText = fullText as NSString
    // Validate bounds (UTF-16 units) to prevent crash
    let clampedFrom = max(0, min(from, nsText.length))
    let clampedTo = max(clampedFrom, min(to, nsText.length))
    guard clampedTo > clampedFrom else {
        return TextAnchor(text: "", prefix: "", suffix: "", from: clampedFrom, to: clampedTo)
    }
    let text = nsText.substring(with: NSRange(location: clampedFrom, length: clampedTo - clampedFrom))
    let prefixStart = max(0, clampedFrom - 30)
    let suffixEnd = min(nsText.length, clampedTo + 30)
    let prefix = nsText.substring(with: NSRange(location: prefixStart, length: clampedFrom - prefixStart))
    let suffix = nsText.substring(with: NSRange(location: clampedTo, length: suffixEnd - clampedTo))
    let headingPath = extractHeadingPath(fullText: fullText, from: clampedFrom)

    return TextAnchor(text: text, prefix: prefix, suffix: suffix, from: clampedFrom, to: clampedTo, headingPath: headingPath)
}

/// Re-anchor a text anchor in potentially-changed document content.
///
/// Strategy:
/// 1. Try exact position match first
/// 2. Search for text+context combination
/// 3. Find ALL occurrences, score with weighted multi-signal approach
/// 4. Mark as orphaned if no match
func resolveAnchor(fullText: String, anchor: TextAnchor) -> AnchorResult {
    let nsText = fullText as NSString

    // Use UTF-16 lengths consistently (NSString operates in UTF-16)
    let anchorTextLen = (anchor.text as NSString).length
    let anchorPrefixLen = (anchor.prefix as NSString).length

    // 1. Try exact position match
    if anchor.from >= 0, anchor.from + anchorTextLen <= nsText.length {
        let atOriginal = nsText.substring(with: NSRange(
            location: anchor.from,
            length: anchorTextLen
        ))
        if atOriginal == anchor.text {
            return AnchorResult(
                from: anchor.from,
                to: anchor.from + anchorTextLen,
                confidence: .exact
            )
        }
    }

    // 2. Search for text with full context
    let contextPattern = anchor.prefix + anchor.text + anchor.suffix
    let contextRange = nsText.range(of: contextPattern)
    if contextRange.location != NSNotFound {
        let newFrom = contextRange.location + anchorPrefixLen
        return AnchorResult(
            from: newFrom,
            to: newFrom + anchorTextLen,
            confidence: .exact
        )
    }

    // 3. Find ALL occurrences, score each with weighted multi-signal approach
    let candidates = findAllOccurrences(nsText: nsText, text: anchor.text)

    if !candidates.isEmpty {
        let best = scoreCandidates(nsText: nsText, candidates: candidates, anchor: anchor)
        if let best {
            return AnchorResult(from: best, to: best + anchorTextLen, confidence: .fuzzy)
        }
    }

    // 3b. Secondary pass: try normalized text if no exact text matches
    let normalizedSearch = normalizeAnchorText(anchor.text)
    if normalizedSearch != anchor.text {
        let normalizedFull = normalizeAnchorText(fullText)
        let nsNormalized = normalizedFull as NSString
        let normalizedCandidates = findAllOccurrences(nsText: nsNormalized, text: normalizedSearch)

        if !normalizedCandidates.isEmpty {
            let best = scoreCandidates(nsText: nsNormalized, candidates: normalizedCandidates, anchor: anchor)
            if let best {
                return AnchorResult(from: best, to: best + (normalizedSearch as NSString).length, confidence: .fuzzy)
            }
        }
    }

    // 4. No match found — orphaned
    return AnchorResult(from: anchor.from, to: anchor.to, confidence: .orphaned)
}

// MARK: - Heading Path Extraction

/// Walk lines backward from offset, collecting the heading hierarchy.
/// Returns e.g. ["## Architecture", "### Backend"].
func extractHeadingPath(fullText: String, from offset: Int) -> [String] {
    let nsText = fullText as NSString
    let lines = nsText.components(separatedBy: "\n")

    // Find which line the offset falls on
    var charCount = 0
    var targetLine = 0
    for (i, line) in lines.enumerated() {
        charCount += line.count + 1 // +1 for \n
        if charCount > offset {
            targetLine = i
            break
        }
    }

    // Walk backward, collecting heading hierarchy
    var path: [String] = []
    var currentLevel = Int.max

    for i in stride(from: targetLine, through: 0, by: -1) {
        let line = lines[i].trimmingCharacters(in: .whitespaces)
        guard line.hasPrefix("#") else { continue }

        let level = line.prefix(while: { $0 == "#" }).count
        guard level >= 1, level <= 6 else { continue }
        // Only collect if it's a higher-level heading than what we've seen
        guard level < currentLevel else { continue }

        path.insert(String(line), at: 0)
        currentLevel = level
        if level == 1 { break }
    }

    return path
}

// MARK: - Text Normalization

/// Strip markdown inline formatting and collapse whitespace.
func normalizeAnchorText(_ text: String) -> String {
    var result = text
    for (regex, template) in markdownInlineRegexes {
        result = regex.stringByReplacingMatches(in: result, range: NSRange(location: 0, length: (result as NSString).length), withTemplate: template)
    }
    result = whitespaceCollapseRegex.stringByReplacingMatches(
        in: result,
        range: NSRange(location: 0, length: (result as NSString).length),
        withTemplate: " "
    )
    return result.trimmingCharacters(in: .whitespaces)
}

// MARK: - Private Scoring Helpers

/// Find all occurrences of `text` in `nsText`, returning their start positions.
private func findAllOccurrences(nsText: NSString, text: String) -> [Int] {
    var positions: [Int] = []
    var searchStart = 0
    while searchStart < nsText.length {
        let searchRange = NSRange(location: searchStart, length: nsText.length - searchStart)
        let range = nsText.range(of: text, options: [], range: searchRange)
        guard range.location != NSNotFound else { break }
        positions.append(range.location)
        searchStart = range.location + 1
    }
    return positions
}

/// Score all candidate positions and return the best one.
/// Signals (weights):
///   - Context match (prefix+suffix): 2.0
///   - Heading section match: 1.5
///   - Line proximity (exp decay): 1.0
///   - Char offset proximity (exp decay): 0.5
private func scoreCandidates(nsText: NSString, candidates: [Int], anchor: TextAnchor) -> Int? {
    guard !candidates.isEmpty else { return nil }

    var bestScore = -1.0
    var bestPosition: Int?

    let anchorLine = lineNumberOf(anchor.from, in: nsText)
    // Pre-compute heading line for section matching
    let headingLine: Int? = {
        guard let lastHeading = anchor.headingPath.last else { return nil }
        let lines = (nsText as String).components(separatedBy: "\n")
        for (i, line) in lines.enumerated() {
            if line.trimmingCharacters(in: .whitespaces) == lastHeading { return i }
        }
        return nil
    }()

    for position in candidates {
        var score = 0.0

        // Signal 1: Context match (weight 2.0)
        let pScore = prefixScore(nsText: nsText, at: position, anchor: anchor)
        let sScore = suffixScore(nsText: nsText, at: position + anchor.text.count, anchor: anchor)
        score += (pScore + sScore) * 2.0

        // Signal 2: Heading section match (weight 1.5)
        if let headingLine {
            if isInSection(nsText: nsText, at: position, headingLine: headingLine) {
                score += 1.5
            }
        }

        // Signal 3: Line proximity (weight 1.0, exponential decay)
        let candidateLine = lineNumberOf(position, in: nsText)
        let lineDist = abs(candidateLine - anchorLine)
        score += exp(-Double(lineDist) / 20.0) * 1.0

        // Signal 4: Char offset proximity (weight 0.5, exponential decay)
        let charDist = abs(position - anchor.from)
        score += exp(-Double(charDist) / 500.0) * 0.5

        if score > bestScore {
            bestScore = score
            bestPosition = position
        }
    }

    return bestPosition
}

/// Right-aligned char-by-char prefix comparison. Returns 0.0–1.0.
private func prefixScore(nsText: NSString, at position: Int, anchor: TextAnchor) -> Double {
    guard !anchor.prefix.isEmpty else { return 0.0 }
    let prefixLen = anchor.prefix.count
    let actualStart = max(0, position - prefixLen)
    let actualPrefix = nsText.substring(with: NSRange(location: actualStart, length: position - actualStart))

    var matches = 0
    let minLen = min(actualPrefix.count, prefixLen)
    for i in 0..<minLen {
        let pi = prefixLen - 1 - i
        let ai = actualPrefix.count - 1 - i
        if pi >= 0, ai >= 0,
           anchor.prefix[anchor.prefix.index(anchor.prefix.startIndex, offsetBy: pi)]
           == actualPrefix[actualPrefix.index(actualPrefix.startIndex, offsetBy: ai)] {
            matches += 1
        }
    }
    return Double(matches) / Double(prefixLen)
}

/// Left-aligned char-by-char suffix comparison. Returns 0.0–1.0.
private func suffixScore(nsText: NSString, at suffixStart: Int, anchor: TextAnchor) -> Double {
    guard !anchor.suffix.isEmpty else { return 0.0 }
    let suffixLen = anchor.suffix.count
    let actualEnd = min(nsText.length, suffixStart + suffixLen)
    guard actualEnd > suffixStart else { return 0.0 }
    let actualSuffix = nsText.substring(with: NSRange(location: suffixStart, length: actualEnd - suffixStart))

    var matches = 0
    let minLen = min(actualSuffix.count, suffixLen)
    for i in 0..<minLen {
        if anchor.suffix[anchor.suffix.index(anchor.suffix.startIndex, offsetBy: i)]
           == actualSuffix[actualSuffix.index(actualSuffix.startIndex, offsetBy: i)] {
            matches += 1
        }
    }
    return Double(matches) / Double(suffixLen)
}

/// Convert a UTF-16 offset to a 0-based line number.
private func lineNumberOf(_ offset: Int, in nsText: NSString) -> Int {
    let safeOffset = min(offset, nsText.length)
    let substring = nsText.substring(to: safeOffset)
    return substring.components(separatedBy: "\n").count - 1
}

/// Check whether `offset` falls under the scope of the heading at `headingLine`.
/// A heading's scope extends until the next heading of equal or higher level.
private func isInSection(nsText: NSString, at offset: Int, headingLine: Int) -> Bool {
    let lines = (nsText as String).components(separatedBy: "\n")
    guard headingLine < lines.count else { return false }

    let headingText = lines[headingLine].trimmingCharacters(in: .whitespaces)
    let headingLevel = headingText.prefix(while: { $0 == "#" }).count
    guard headingLevel >= 1 else { return false }

    let candidateLine = lineNumberOf(offset, in: nsText)
    guard candidateLine >= headingLine else { return false }

    // Check that no heading of equal or higher level appears between headingLine and candidateLine
    for i in (headingLine + 1)...candidateLine {
        guard i < lines.count else { break }
        let line = lines[i].trimmingCharacters(in: .whitespaces)
        guard line.hasPrefix("#") else { continue }
        let level = line.prefix(while: { $0 == "#" }).count
        if level >= 1, level <= headingLevel { return false }
    }
    return true
}

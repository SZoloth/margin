import Foundation

/// Anchor data for a text highlight, enabling re-location after document edits.
struct TextAnchor {
    let text: String
    let prefix: String   // ~30 chars before
    let suffix: String   // ~30 chars after
    let from: Int
    let to: Int
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

/// Extract anchoring context from the current document for a selection.
func createAnchor(fullText: String, from: Int, to: Int) -> TextAnchor {
    let nsText = fullText as NSString
    let text = nsText.substring(with: NSRange(location: from, length: to - from))
    let prefixStart = max(0, from - 30)
    let suffixEnd = min(nsText.length, to + 30)
    let prefix = nsText.substring(with: NSRange(location: prefixStart, length: from - prefixStart))
    let suffix = nsText.substring(with: NSRange(location: to, length: suffixEnd - to))

    return TextAnchor(text: text, prefix: prefix, suffix: suffix, from: from, to: to)
}

/// Re-anchor a text anchor in potentially-changed document content.
///
/// Strategy:
/// 1. Try exact position match first
/// 2. Search for text+context combination
/// 3. Search for text alone (disambiguate with prefix/suffix scoring)
/// 4. Mark as orphaned if no match
func resolveAnchor(fullText: String, anchor: TextAnchor) -> AnchorResult {
    let nsText = fullText as NSString

    // 1. Try exact position match
    if anchor.from + anchor.text.count <= nsText.length {
        let atOriginal = nsText.substring(with: NSRange(
            location: anchor.from,
            length: anchor.text.count
        ))
        if atOriginal == anchor.text {
            return AnchorResult(
                from: anchor.from,
                to: anchor.from + anchor.text.count,
                confidence: .exact
            )
        }
    }

    // 2. Search for text with context
    let contextPattern = anchor.prefix + anchor.text + anchor.suffix
    let contextRange = nsText.range(of: contextPattern)
    if contextRange.location != NSNotFound {
        let newFrom = contextRange.location + anchor.prefix.count
        return AnchorResult(
            from: newFrom,
            to: newFrom + anchor.text.count,
            confidence: .exact
        )
    }

    // 3. Search for just the text, score by context similarity
    var searchStart = 0
    var matches: [(index: Int, score: Int)] = []

    while searchStart < nsText.length {
        let searchRange = NSRange(location: searchStart, length: nsText.length - searchStart)
        let range = nsText.range(of: anchor.text, options: [], range: searchRange)
        guard range.location != NSNotFound else { break }

        let idx = range.location
        var score = 0

        // Score prefix match
        let actualPrefixStart = max(0, idx - anchor.prefix.count)
        let actualPrefix = nsText.substring(with: NSRange(
            location: actualPrefixStart,
            length: idx - actualPrefixStart
        ))
        let minPrefixLen = min(actualPrefix.count, anchor.prefix.count)
        for i in 0..<minPrefixLen {
            let pi = anchor.prefix.count - 1 - i
            let ai = actualPrefix.count - 1 - i
            if pi >= 0, ai >= 0,
               anchor.prefix[anchor.prefix.index(anchor.prefix.startIndex, offsetBy: pi)]
               == actualPrefix[actualPrefix.index(actualPrefix.startIndex, offsetBy: ai)] {
                score += 1
            }
        }

        // Score suffix match
        let suffixStart = idx + anchor.text.count
        let actualSuffixEnd = min(nsText.length, suffixStart + anchor.suffix.count)
        let actualSuffix = nsText.substring(with: NSRange(
            location: suffixStart,
            length: actualSuffixEnd - suffixStart
        ))
        let minSuffixLen = min(actualSuffix.count, anchor.suffix.count)
        for i in 0..<minSuffixLen {
            if anchor.suffix[anchor.suffix.index(anchor.suffix.startIndex, offsetBy: i)]
               == actualSuffix[actualSuffix.index(actualSuffix.startIndex, offsetBy: i)] {
                score += 1
            }
        }

        matches.append((index: idx, score: score))
        searchStart = idx + 1
    }

    if !matches.isEmpty {
        let best = matches.max(by: { $0.score < $1.score })!
        return AnchorResult(
            from: best.index,
            to: best.index + anchor.text.count,
            confidence: .fuzzy
        )
    }

    // 4. No match found — orphaned
    return AnchorResult(from: anchor.from, to: anchor.to, confidence: .orphaned)
}

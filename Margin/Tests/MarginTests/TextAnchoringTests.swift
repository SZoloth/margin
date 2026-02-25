import Testing
import Foundation
@testable import MarginCore

struct TextAnchoringTests {

    // MARK: - createAnchor

    @Test("Captures text, prefix, and suffix from middle of document")
    func createAnchorMiddle() {
        let text = "The quick brown fox jumps over the lazy dog near the river bank"
        let anchor = createAnchor(fullText: text, from: 16, to: 19) // "fox"

        #expect(anchor.text == "fox")
        #expect(anchor.from == 16)
        #expect(anchor.to == 19)
        #expect(anchor.prefix.hasSuffix("brown "))
        #expect(anchor.suffix.hasPrefix(" jumps"))
    }

    @Test("Captures prefix when near document start")
    func createAnchorNearStart() {
        let text = "Hi there world"
        let anchor = createAnchor(fullText: text, from: 0, to: 2) // "Hi"

        #expect(anchor.text == "Hi")
        #expect(anchor.prefix == "") // no chars before position 0
        #expect(anchor.suffix.hasPrefix(" there"))
    }

    @Test("Captures suffix when near document end")
    func createAnchorNearEnd() {
        let text = "Hello world"
        let anchor = createAnchor(fullText: text, from: 6, to: 11) // "world"

        #expect(anchor.text == "world")
        #expect(anchor.suffix == "") // nothing after "world"
        #expect(anchor.prefix.hasSuffix("Hello "))
    }

    @Test("Clamps out-of-bounds positions safely")
    func createAnchorOutOfBounds() {
        let text = "Short"
        let anchor = createAnchor(fullText: text, from: -5, to: 100)

        // Should clamp to [0, 5]
        #expect(anchor.from == 0)
        #expect(anchor.to == 5)
        #expect(anchor.text == "Short")
    }

    @Test("Returns empty anchor when from equals to")
    func createAnchorEmptyRange() {
        let text = "Hello"
        let anchor = createAnchor(fullText: text, from: 3, to: 3)

        #expect(anchor.text == "")
        #expect(anchor.from == 3)
        #expect(anchor.to == 3)
    }

    @Test("Returns empty anchor when from > to (inverted range)")
    func createAnchorInvertedRange() {
        let text = "Hello"
        let anchor = createAnchor(fullText: text, from: 4, to: 2)

        // clampedTo = max(clampedFrom, min(to, length)) = max(4, 2) = 4
        #expect(anchor.text == "")
    }

    @Test("Works with emoji (UTF-16 multi-unit characters)")
    func createAnchorEmoji() {
        let text = "Hello 🌍 world" // 🌍 is 2 UTF-16 units
        let nsText = text as NSString
        // Find "world" — it starts after "Hello 🌍 "
        let range = nsText.range(of: "world")
        let anchor = createAnchor(fullText: text, from: range.location, to: range.location + range.length)

        #expect(anchor.text == "world")
    }

    @Test("Works on empty string")
    func createAnchorEmptyString() {
        let anchor = createAnchor(fullText: "", from: 0, to: 0)
        #expect(anchor.text == "")
        #expect(anchor.prefix == "")
        #expect(anchor.suffix == "")
    }

    // MARK: - resolveAnchor

    @Test("Exact match when document unchanged")
    func resolveExactMatch() {
        let text = "Hello world, this is a test"
        let anchor = TextAnchor(text: "world", prefix: "Hello ", suffix: ", this", from: 6, to: 11)
        let result = resolveAnchor(fullText: text, anchor: anchor)

        #expect(result.from == 6)
        #expect(result.to == 11)
        #expect(result.confidence == .exact)
    }

    @Test("Finds text after insertion via context match")
    func resolveAfterInsertion() {
        let original = "Hello world, this is a test"
        let anchor = createAnchor(fullText: original, from: 6, to: 11) // "world"

        let modified = "Hey! Hello world, this is a test" // 5 chars inserted at start
        let result = resolveAnchor(fullText: modified, anchor: anchor)

        #expect(result.from == 11)
        #expect(result.to == 16)
        // Should be exact (prefix+text+suffix still matches) or fuzzy
        #expect(result.confidence != .orphaned)
    }

    @Test("Fuzzy match when text appears multiple times, scores by context")
    func resolveFuzzyWithMultipleMatches() {
        let text = "the cat sat on the mat near the hat"
        // "the" appears 3 times. Anchor with context for the first occurrence.
        let anchor = TextAnchor(text: "the", prefix: "", suffix: " cat sat", from: 0, to: 3)
        let result = resolveAnchor(fullText: text, anchor: anchor)

        #expect(result.from == 0)
        #expect(result.to == 3)
    }

    @Test("Returns orphaned when text is completely gone")
    func resolveOrphaned() {
        let anchor = TextAnchor(text: "vanished text", prefix: "xxx", suffix: "yyy", from: 0, to: 13)
        let result = resolveAnchor(fullText: "completely different content here", anchor: anchor)

        #expect(result.confidence == .orphaned)
    }

    @Test("Round-trip: create then resolve on same document")
    func resolveRoundTrip() {
        let text = "The quick brown fox jumps over the lazy dog"
        let anchor = createAnchor(fullText: text, from: 16, to: 19) // "fox"
        let result = resolveAnchor(fullText: text, anchor: anchor)

        #expect(result.from == 16)
        #expect(result.to == 19)
        #expect(result.confidence == .exact)
    }

    @Test("Round-trip survives text deletion before anchor")
    func resolveAfterDeletion() {
        let original = "AAAA BBBB The quick brown fox jumps"
        let anchor = createAnchor(fullText: original, from: 26, to: 29) // "fox"

        let modified = "The quick brown fox jumps" // removed "AAAA BBBB "
        let result = resolveAnchor(fullText: modified, anchor: anchor)

        #expect(result.confidence != .orphaned)
        let resolved = (modified as NSString).substring(with: NSRange(location: result.from, length: result.to - result.from))
        #expect(resolved == "fox")
    }

    @Test("Handles anchor with empty prefix and suffix")
    func resolveEmptyContext() {
        let text = "fox"
        let anchor = TextAnchor(text: "fox", prefix: "", suffix: "", from: 0, to: 3)
        let result = resolveAnchor(fullText: text, anchor: anchor)

        #expect(result.from == 0)
        #expect(result.to == 3)
        #expect(result.confidence == .exact)
    }
}

import Testing
import Foundation
@testable import MarginCore

struct HeadingExtractionTests {

    @Test("Extracts H1 heading")
    func extractH1() {
        let headings = parseHeadings(from: "# Hello World")

        let entry = try! #require(headings.first)
        #expect(entry.text == "Hello World")
        #expect(entry.level == 1)
        #expect(entry.offset == 0)
    }

    @Test("Extracts H2 heading")
    func extractH2() {
        let headings = parseHeadings(from: "## Section Title")

        let entry = try! #require(headings.first)
        #expect(entry.text == "Section Title")
        #expect(entry.level == 2)
    }

    @Test("Ignores H3 and deeper headings")
    func ignoresH3() {
        let headings = parseHeadings(from: "### Not extracted\n#### Also not")
        #expect(headings.isEmpty)
    }

    @Test("Extracts multiple headings with correct offsets")
    func multipleHeadings() {
        let content = "# Title\n\nSome paragraph.\n\n## Section One\n\nMore text.\n\n## Section Two"
        let headings = parseHeadings(from: content)

        #expect(headings.count == 3)
        #expect(headings[0].text == "Title")
        #expect(headings[0].level == 1)
        #expect(headings[0].offset == 0)
        #expect(headings[1].text == "Section One")
        #expect(headings[1].level == 2)
        #expect(headings[2].text == "Section Two")
        #expect(headings[2].level == 2)
    }

    @Test("Offsets use UTF-16 units")
    func utf16Offsets() {
        // 🌍 is 2 UTF-16 units, so the line "Hello 🌍" is 9 UTF-16 units
        let content = "Hello 🌍\n# Heading"
        let headings = parseHeadings(from: content)

        let entry = try! #require(headings.first)
        #expect(entry.text == "Heading")
        // "Hello 🌍" = 9 UTF-16 units + 1 for \n = offset 10
        let expectedOffset = ("Hello 🌍" as NSString).length + 1
        #expect(entry.offset == expectedOffset)
    }

    @Test("Skips lines that look like headings but aren't")
    func notActualHeadings() {
        let content = "##no space after hashes\n#also no space"
        let headings = parseHeadings(from: content)
        #expect(headings.isEmpty)
    }

    @Test("Trims whitespace from heading text")
    func trimsWhitespace() {
        let headings = parseHeadings(from: "#   Padded Title   ")
        let entry = try! #require(headings.first)
        #expect(entry.text == "Padded Title")
    }

    @Test("Skips empty heading text")
    func emptyHeadingText() {
        let headings = parseHeadings(from: "# \n## ")
        #expect(headings.isEmpty)
    }

    @Test("Empty content returns no headings")
    func emptyContent() {
        #expect(parseHeadings(from: "").isEmpty)
    }

    @Test("Assigns sequential IDs")
    func sequentialIds() {
        let content = "# One\n## Two\n## Three"
        let headings = parseHeadings(from: content)

        #expect(headings[0].id == "heading-0")
        #expect(headings[1].id == "heading-1")
        #expect(headings[2].id == "heading-2")
    }

    @Test("Consecutive headings have strictly increasing offsets")
    func strictlyIncreasingOffsets() {
        let content = "# A\n## B\n# C\n## D"
        let headings = parseHeadings(from: content)

        for i in 1..<headings.count {
            #expect(headings[i].offset > headings[i - 1].offset)
        }
    }
}

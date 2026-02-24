import Testing
@testable import MarginCore

struct BasenameTests {

    @Test("Extracts filename without extension")
    func basicPath() {
        #expect(basename("/Users/sam/notes.md") == "notes")
    }

    @Test("Handles nested path with spaces")
    func pathWithSpaces() {
        #expect(basename("/Users/sam/My Documents/reading notes.md") == "reading notes")
    }

    @Test("Handles .markdown extension")
    func markdownExtension() {
        #expect(basename("/path/to/file.markdown") == "file")
    }

    @Test("Handles filename with dots")
    func dotsInFilename() {
        #expect(basename("/path/my.file.name.md") == "my.file.name")
    }

    @Test("Handles root-level file")
    func rootLevel() {
        #expect(basename("/notes.md") == "notes")
    }
}

struct CountWordsTests {

    @Test("Empty string returns 0")
    func emptyString() {
        #expect(countWords("") == 0)
    }

    @Test("Whitespace-only returns 0")
    func whitespaceOnly() {
        #expect(countWords("   \n\t  ") == 0)
    }

    @Test("Counts simple words")
    func simpleWords() {
        #expect(countWords("hello world") == 2)
    }

    @Test("Handles multiple spaces between words")
    func multipleSpaces() {
        #expect(countWords("hello   world   test") == 3)
    }

    @Test("Handles newlines and mixed whitespace")
    func mixedWhitespace() {
        #expect(countWords("hello\nworld\n\ntest") == 3)
    }

    @Test("Single word")
    func singleWord() {
        #expect(countWords("hello") == 1)
    }

    @Test("Counts markdown content words")
    func markdownContent() {
        let md = "# Heading\n\nSome paragraph text here.\n\n- List item one\n- List item two"
        #expect(countWords(md) >= 9) // heading + paragraph + list items
    }
}

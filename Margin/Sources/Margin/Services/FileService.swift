import Foundation
import AppKit

/// File operations: open, save, read, rename, list markdown files.
struct FileService {

    /// Show an open panel and return the selected markdown file path.
    @MainActor
    func openFileDialog() -> String? {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [
            .init(filenameExtension: "md")!,
            .init(filenameExtension: "markdown")!,
            .init(filenameExtension: "txt")!,
        ]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Open Markdown File"

        guard panel.runModal() == .OK, let url = panel.url else {
            return nil
        }
        return url.path
    }

    func readFile(path: String) throws -> String {
        try String(contentsOfFile: path, encoding: .utf8)
    }

    func saveFile(path: String, content: String) throws {
        try content.write(toFile: path, atomically: true, encoding: .utf8)
    }

    func renameFile(oldPath: String, newName: String) throws -> String {
        let trimmed = newName.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            throw FileServiceError.emptyName
        }
        guard !trimmed.contains("/"), !trimmed.contains("\\") else {
            throw FileServiceError.invalidName
        }

        let finalName: String
        if trimmed.hasSuffix(".md") || trimmed.hasSuffix(".markdown") {
            finalName = trimmed
        } else {
            finalName = "\(trimmed).md"
        }

        let oldURL = URL(fileURLWithPath: oldPath)
        let newURL = oldURL.deletingLastPathComponent().appendingPathComponent(finalName)

        guard !FileManager.default.fileExists(atPath: newURL.path) else {
            throw FileServiceError.alreadyExists(finalName)
        }
        guard FileManager.default.fileExists(atPath: oldPath) else {
            throw FileServiceError.sourceNotFound(oldPath)
        }

        try FileManager.default.moveItem(at: oldURL, to: newURL)
        return newURL.path
    }

}

enum FileServiceError: LocalizedError {
    case emptyName
    case invalidName
    case alreadyExists(String)
    case sourceNotFound(String)

    var errorDescription: String? {
        switch self {
        case .emptyName: return "File name cannot be empty"
        case .invalidName: return "File name cannot contain path separators"
        case .alreadyExists(let name): return "A file named '\(name)' already exists"
        case .sourceNotFound(let path): return "Source file does not exist: \(path)"
        }
    }
}

/// Extract the title from a file path (filename without extension).
func basename(_ filePath: String) -> String {
    URL(fileURLWithPath: filePath).deletingPathExtension().lastPathComponent
}

/// Count words in a string.
func countWords(_ text: String) -> Int64 {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return 0 }
    return Int64(trimmed.components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }.count)
}

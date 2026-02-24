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

    /// List all markdown files recursively under a directory.
    func listMarkdownFiles(dir: String) throws -> [FileEntry] {
        let rootURL = URL(fileURLWithPath: dir)
        guard FileManager.default.fileExists(atPath: dir) else {
            throw FileServiceError.directoryNotFound(dir)
        }
        return try collectMarkdownEntries(dir: rootURL)
            .sorted { a, b in
                if a.isDir != b.isDir { return a.isDir && !b.isDir }
                return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
            }
    }

    private func collectMarkdownEntries(dir: URL) throws -> [FileEntry] {
        var results: [FileEntry] = []
        let contents = try FileManager.default.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        )

        for url in contents {
            let name = url.lastPathComponent
            let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false

            if isDir {
                let children = try collectMarkdownEntries(dir: url)
                if !children.isEmpty {
                    results.append(FileEntry(name: name, path: url.path, isDir: true))
                    results.append(contentsOf: children)
                }
            } else {
                let ext = url.pathExtension.lowercased()
                if ext == "md" || ext == "markdown" {
                    results.append(FileEntry(name: name, path: url.path, isDir: false))
                }
            }
        }
        return results
    }
}

struct FileEntry: Identifiable {
    let id = UUID()
    let name: String
    let path: String
    let isDir: Bool
}

enum FileServiceError: LocalizedError {
    case emptyName
    case invalidName
    case alreadyExists(String)
    case sourceNotFound(String)
    case directoryNotFound(String)

    var errorDescription: String? {
        switch self {
        case .emptyName: return "File name cannot be empty"
        case .invalidName: return "File name cannot contain path separators"
        case .alreadyExists(let name): return "A file named '\(name)' already exists"
        case .sourceNotFound(let path): return "Source file does not exist: \(path)"
        case .directoryNotFound(let dir): return "'\(dir)' is not a directory"
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

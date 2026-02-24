import Foundation

/// Watches a single file for modifications using GCD dispatch sources.
/// Emits notifications when the file content changes externally.
final class FileWatcher: ObservableObject {
    private var source: DispatchSourceFileSystemObject?
    private var fileDescriptor: Int32 = -1
    private var watchedPath: String?

    var onFileChanged: ((String) -> Void)?

    func watch(path: String) {
        unwatch()

        let fd = open(path, O_EVTONLY)
        guard fd >= 0 else { return }

        fileDescriptor = fd
        watchedPath = path

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .rename, .delete],
            queue: .global(qos: .utility)
        )

        source.setEventHandler { [weak self] in
            guard let self, let path = self.watchedPath else { return }
            DispatchQueue.main.async {
                self.onFileChanged?(path)
            }
        }

        source.setCancelHandler { [fd] in
            close(fd)
        }

        source.resume()
        self.source = source
    }

    func unwatch() {
        source?.cancel()
        source = nil
        // File descriptor is closed in the cancel handler
        fileDescriptor = -1
        watchedPath = nil
    }

    deinit {
        unwatch()
    }
}

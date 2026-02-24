import Foundation

/// Watches a single file for modifications using GCD dispatch sources.
/// Emits notifications when the file content changes externally.
/// All mutable state is synchronized through the serial `queue`.
final class FileWatcher: ObservableObject {
    private var source: DispatchSourceFileSystemObject?
    private var fileDescriptor: Int32 = -1
    private var watchedPath: String?
    private var debounceWork: DispatchWorkItem?
    private let queue = DispatchQueue(label: "margin.filewatcher")

    var onFileChanged: ((String) -> Void)?

    func watch(path: String) {
        queue.sync {
            _unwatch()
            _startWatching(path: path)
        }
    }

    func unwatch() {
        queue.sync {
            _unwatch()
        }
    }

    /// Must be called on `queue`.
    private func _unwatch() {
        debounceWork?.cancel()
        debounceWork = nil
        source?.cancel()
        source = nil
        fileDescriptor = -1
        watchedPath = nil
    }

    /// Must be called on `queue`.
    private func _startWatching(path: String) {
        let fd = open(path, O_EVTONLY)
        guard fd >= 0 else { return }

        fileDescriptor = fd
        watchedPath = path

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .rename, .delete],
            queue: queue
        )

        source.setEventHandler { [weak self] in
            guard let self else { return }
            // Already on self.queue — safe to access all properties
            guard let path = self.watchedPath else { return }

            let flags = source.data
            if flags.contains(.rename) || flags.contains(.delete) {
                // File was replaced (e.g., vim save-via-rename). Re-watch and notify.
                self._unwatch()
                self._startWatching(path: path)
                // Also fire the callback — the rename carried the content change
                self.debounceWork?.cancel()
                let work = DispatchWorkItem { [weak self] in
                    self?.onFileChanged?(path)
                }
                self.debounceWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: work)
                return
            }

            self.debounceWork?.cancel()
            let work = DispatchWorkItem { [weak self] in
                self?.onFileChanged?(path)
            }
            self.debounceWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: work)
        }

        source.setCancelHandler { [fd] in
            close(fd)
        }

        source.resume()
        self.source = source
    }

    deinit {
        // deinit can run on any thread — synchronize
        queue.sync {
            _unwatch()
        }
    }
}

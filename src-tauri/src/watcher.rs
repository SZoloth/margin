use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
struct FileChangedPayload {
    path: String,
}

pub struct FileWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_dir: Option<PathBuf>,
}

impl FileWatcher {
    pub fn new() -> Self {
        FileWatcher {
            watcher: None,
            watched_dir: None,
        }
    }

    pub fn watch(&mut self, path: &str, app_handle: &AppHandle) -> Result<(), String> {
        // Stop watching previous path if any
        self.unwatch()?;

        let target = PathBuf::from(path);
        let parent = target
            .parent()
            .ok_or_else(|| format!("Cannot determine parent directory for: {path}"))?
            .to_path_buf();
        // Build the full expected path for matching (handles case-insensitive FS)
        let target_full = parent.join(
            target
                .file_name()
                .ok_or_else(|| format!("Cannot determine filename for: {path}"))?,
        );

        let file_path = path.to_string();
        let handle = app_handle.clone();

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            match res {
                Ok(event) => {
                    if !matches!(
                        event.kind,
                        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                    ) {
                        return;
                    }

                    // Only emit when the event involves our target file (full path match)
                    let is_target = event.paths.iter().any(|p| *p == target_full);
                    if !is_target {
                        return;
                    }

                    let _ = handle.emit(
                        "file-changed",
                        FileChangedPayload {
                            path: file_path.clone(),
                        },
                    );
                }
                Err(e) => {
                    eprintln!("[watcher] notify error: {e}");
                }
            }
        })
        .map_err(|e| format!("Failed to create file watcher: {e}"))?;

        watcher
            .watch(&parent, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch directory: {e}"))?;

        self.watched_dir = Some(parent);
        self.watcher = Some(watcher);

        Ok(())
    }

    pub fn unwatch(&mut self) -> Result<(), String> {
        if let (Some(mut watcher), Some(ref dir)) = (self.watcher.take(), &self.watched_dir) {
            let _ = watcher.unwatch(dir);
        }
        self.watched_dir = None;
        self.watcher = None;
        Ok(())
    }
}

#[tauri::command]
pub fn watch_file(
    path: String,
    state: tauri::State<'_, Mutex<FileWatcher>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let mut watcher = state
        .lock()
        .map_err(|e| format!("Failed to lock watcher state: {e}"))?;
    watcher.watch(&path, &app_handle)
}

#[tauri::command]
pub fn unwatch_file(state: tauri::State<'_, Mutex<FileWatcher>>) -> Result<(), String> {
    let mut watcher = state
        .lock()
        .map_err(|e| format!("Failed to lock watcher state: {e}"))?;
    watcher.unwatch()
}

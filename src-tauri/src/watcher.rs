use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
struct FileChangedPayload {
    path: String,
}

pub struct FileWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_path: Option<String>,
}

impl FileWatcher {
    pub fn new() -> Self {
        FileWatcher {
            watcher: None,
            watched_path: None,
        }
    }

    pub fn watch(&mut self, path: &str, app_handle: &AppHandle) -> Result<(), String> {
        // Stop watching previous path if any
        self.unwatch()?;

        let file_path = path.to_string();
        let handle = app_handle.clone();

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(
                    event.kind,
                    EventKind::Modify(_) | EventKind::Create(_)
                ) {
                    let _ = handle.emit(
                        "file-changed",
                        FileChangedPayload {
                            path: file_path.clone(),
                        },
                    );
                }
            }
        })
        .map_err(|e| format!("Failed to create file watcher: {e}"))?;

        watcher
            .watch(std::path::Path::new(path), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch file: {e}"))?;

        self.watched_path = Some(path.to_string());
        self.watcher = Some(watcher);

        Ok(())
    }

    pub fn unwatch(&mut self) -> Result<(), String> {
        if let (Some(mut watcher), Some(ref path)) = (self.watcher.take(), &self.watched_path) {
            let _ = watcher.unwatch(std::path::Path::new(path));
        }
        self.watched_path = None;
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

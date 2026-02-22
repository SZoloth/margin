pub mod commands;
pub mod db;
pub mod watcher;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Stores file paths received before the frontend is ready.
pub struct PendingOpenFiles(pub Mutex<Vec<String>>);

#[tauri::command]
fn drain_pending_open_files(state: tauri::State<'_, PendingOpenFiles>) -> Vec<String> {
    let mut pending = state.0.lock().unwrap();
    pending.drain(..).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Mutex::new(watcher::FileWatcher::new()))
        .manage(PendingOpenFiles(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![
            commands::files::open_file_dialog,
            commands::files::read_file,
            commands::files::save_file,
            commands::files::list_markdown_files,
            commands::files::rename_file,
            commands::documents::get_recent_documents,
            commands::documents::upsert_document,
            commands::annotations::create_highlight,
            commands::annotations::get_highlights,
            commands::annotations::update_highlight_color,
            commands::annotations::delete_highlight,
            commands::annotations::create_margin_note,
            commands::annotations::get_margin_notes,
            commands::annotations::update_margin_note,
            commands::annotations::delete_margin_note,
            commands::keep_local::keep_local_health,
            commands::keep_local::keep_local_list_items,
            commands::keep_local::keep_local_get_item,
            commands::keep_local::keep_local_get_content,
            commands::search::index_document,
            commands::search::search_documents,
            commands::search::remove_document_index,
            commands::search::search_files_on_disk,
            commands::corrections::persist_corrections,
            commands::tabs::get_open_tabs,
            commands::tabs::save_open_tabs,
            watcher::watch_file,
            watcher::unwatch_file,
            drain_pending_open_files,
        ])
        .setup(|_app| {
            db::migrations::init_db()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    if let Some(path_str) = path.to_str() {
                        let path_string = path_str.to_string();

                        // Try emitting to the frontend (works if webview is ready)
                        let emitted = app_handle.emit("open-file", &path_string).is_ok();

                        // Also queue it in case the frontend isn't ready yet
                        if let Some(state) = app_handle.try_state::<PendingOpenFiles>() {
                            let mut pending = state.0.lock().unwrap();
                            pending.push(path_string);
                        }
                    }
                }
            }
        }
    });
}

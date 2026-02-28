pub mod commands;
pub mod db;
pub mod watcher;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

use commands::keep_local::HttpClient;

/// Stores file paths received before the frontend is ready.
pub struct PendingOpenFiles(pub Mutex<Vec<String>>);

#[tauri::command]
fn drain_pending_open_files(state: tauri::State<'_, PendingOpenFiles>) -> Vec<String> {
    let mut pending = state.0.lock().unwrap_or_else(|e| e.into_inner());
    pending.drain(..).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(HttpClient(
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("failed to build HTTP client"),
        ))
        .manage(Mutex::new(watcher::FileWatcher::new()))
        .manage(PendingOpenFiles(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![
            commands::search::index_all_documents,
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
            commands::annotations::delete_all_highlights_for_document,
            commands::keep_local::keep_local_health,
            commands::keep_local::keep_local_list_items,
            commands::keep_local::keep_local_get_item,
            commands::keep_local::keep_local_get_content,
            commands::search::index_document,
            commands::search::search_documents,
            commands::search::remove_document_index,
            commands::search::search_files_on_disk,
            commands::corrections::persist_corrections,
            commands::corrections::get_all_corrections,
            commands::corrections::get_corrections_count,
            commands::corrections::get_corrections_by_document,
            commands::corrections::update_correction_writing_type,
            commands::corrections::delete_correction,
            commands::corrections::export_corrections_json,
            commands::tabs::get_open_tabs,
            commands::tabs::save_open_tabs,
            watcher::watch_file,
            watcher::unwatch_file,
            drain_pending_open_files,
        ])
        .setup(|app| {
            let pool = db::migrations::init_db()?;
            app.manage(pool);

            // Set window title to "Margin (Dev)" in debug builds
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Margin (Dev)");
            }

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

                        // Only queue if we couldn't emit (e.g. frontend not ready yet).
                        if !emitted {
                            if let Some(state) = app_handle.try_state::<PendingOpenFiles>() {
                                let mut pending =
                                    state.0.lock().unwrap_or_else(|e| e.into_inner());
                                if !pending.contains(&path_string) {
                                    pending.push(path_string);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

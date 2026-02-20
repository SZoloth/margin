pub mod commands;
pub mod db;
pub mod watcher;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(watcher::FileWatcher::new()))
        .invoke_handler(tauri::generate_handler![
            commands::files::open_file_dialog,
            commands::files::read_file,
            commands::files::save_file,
            commands::files::list_markdown_files,
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
            commands::annotations::create_comment_thread,
            commands::annotations::get_comment_threads,
            commands::annotations::resolve_comment_thread,
            commands::annotations::delete_comment_thread,
            commands::annotations::add_comment,
            commands::annotations::get_comments,
            commands::keep_local::keep_local_health,
            commands::keep_local::keep_local_list_items,
            commands::keep_local::keep_local_get_item,
            commands::keep_local::keep_local_get_content,
            commands::search::index_document,
            commands::search::search_documents,
            commands::search::remove_document_index,
            watcher::watch_file,
            watcher::unwatch_file,
        ])
        .setup(|_app| {
            db::migrations::init_db()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

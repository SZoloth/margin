pub mod commands;
pub mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
        ])
        .setup(|_app| {
            db::migrations::init_db()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

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
        ])
        .setup(|app| {
            db::migrations::init_db()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

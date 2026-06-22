// War Room — Tauri shell. The whole app is the React frontend rendered in the
// webview; the Rust side just opens the window. Keep it minimal.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running War Room");
}

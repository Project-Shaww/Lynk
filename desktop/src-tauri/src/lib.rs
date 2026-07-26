pub mod config;
mod addons;
mod commands;
mod fs;
mod models;

use commands::{install_addon, update_addon, uninstall_addon, get_installed_addons, get_addon_override, save_addon_override};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            install_addon,
            update_addon,
            uninstall_addon,
            get_installed_addons,
            get_addon_override,
            save_addon_override
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub mod config;
mod addons;
mod commands;
mod compiler;
mod consts;
mod fs;
mod models;
mod validators;

use tauri::{Emitter, Manager, WindowEvent};
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;

pub struct ServiceHandle(pub Mutex<Option<CommandChild>>);

use commands::{
    install_addon, get_remote_manifest, preview_install_addon, update_addon, check_addon_update,
    uninstall_addon, get_installed_addons, get_addon_override,
    save_addon_override, compile_manifest, validate_addons,
    get_addon_enabled, get_addon_enablements, save_addon_enabled, delete_addon_enabled,
    get_service_status, get_running_servers, reload_compiled_manifest,
    start_service, shutdown_service, get_app_version, get_system_info
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ServiceHandle(Mutex::new(None)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(url) = args.iter().find(|arg| arg.starts_with("lynk://")) {
                let _ = app.emit("lynk-deep-link", url);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let open_i = MenuItem::with_id(app, "open", "Open Lynk", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = MenuBuilder::new(app)
                .item(&open_i)
                .item(&quit_i)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .title("Lynk Client")
                .tooltip("Lynk Client")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            install_addon,
            get_remote_manifest,
            preview_install_addon,
            update_addon,
            check_addon_update,
            uninstall_addon,
            get_installed_addons,
            get_addon_override,
            save_addon_override,
            get_addon_enabled,
            get_addon_enablements,
            save_addon_enabled,
            delete_addon_enabled,
            compile_manifest,
            validate_addons,
            get_service_status,
            get_running_servers,
            reload_compiled_manifest,
            start_service,
            shutdown_service,
            get_app_version,
            get_system_info
        ])
        .build(tauri::generate_context!())
        .expect("error building app")
        .run(move |app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } => {
                if let Some(child) = app_handle.state::<ServiceHandle>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            },
            _ => {}
        });
}

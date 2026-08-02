use crate::models::InstalledAddonManifest;
use crate::models::config::EnabledAddonDefinition;
use crate::models::overrides::OverrideDefinition;
use crate::addons::loader;
use crate::config::handler::ConfigHandler;
use std::collections::HashMap;

#[tauri::command]
pub async fn get_installed_addons() -> Result<Vec<InstalledAddonManifest>, String> {
    loader::get_installed_addons().await
}

#[tauri::command]
pub async fn get_addon_override(addon_slug: String) -> Result<Option<OverrideDefinition>, String> {
    let config_handler = ConfigHandler::load().await?;
    let config = config_handler.config();
    Ok(config.overrides.get(&addon_slug).cloned())
}

#[tauri::command]
pub async fn save_addon_override(addon_slug: String, override_def: OverrideDefinition) -> Result<(), String> {
    let mut config_handler = ConfigHandler::load().await?;
    config_handler.set_override(addon_slug, override_def);
    config_handler.save().await
}

#[tauri::command]
pub async fn get_addon_enabled(addon_slug: String) -> Result<Option<EnabledAddonDefinition>, String> {
    let config_handler = ConfigHandler::load().await?;
    let config = config_handler.config();
    Ok(config.enabled.get(&addon_slug).cloned())
}

#[tauri::command]
pub async fn get_addon_enablements() -> Result<HashMap<String, EnabledAddonDefinition>, String> {
    let config_handler = ConfigHandler::load().await?;
    let config = config_handler.config();
    Ok(config.enabled.clone())
}

#[tauri::command]
pub async fn save_addon_enabled(addon_slug: String, enabled_def: Option<EnabledAddonDefinition>) -> Result<(), String> {
    let mut config_handler = ConfigHandler::load().await?;

    match enabled_def {
        Some(enabled) => config_handler.set_enabled(addon_slug, enabled),
        None => {
            config_handler.delete_enabled(&addon_slug);
        }
    }

    config_handler.save().await
}

#[tauri::command]
pub async fn delete_addon_enabled(addon_slug: String) -> Result<(), String> {
    let mut config_handler = ConfigHandler::load().await?;
    config_handler.delete_enabled(&addon_slug);
    config_handler.save().await
}

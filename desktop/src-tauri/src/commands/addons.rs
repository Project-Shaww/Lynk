use crate::models::InstalledAddonManifest;
use crate::models::overrides::OverrideDefinition;
use crate::addons::loader;
use crate::config::handler::ConfigHandler;

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

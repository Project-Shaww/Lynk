use crate::models::InstalledAddonManifest;
use crate::addons::update;

#[tauri::command]
pub async fn update_addon(addon_slug: String) -> Result<InstalledAddonManifest, String> {
	update::update_addon(addon_slug).await
}

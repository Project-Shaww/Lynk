use crate::models::InstalledAddonManifest;
use crate::addons::install;

#[tauri::command]
pub async fn install_addon(manifest_url: String) -> Result<InstalledAddonManifest, String> {
	install::install_addon(manifest_url).await
}

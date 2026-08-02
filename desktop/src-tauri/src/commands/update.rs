use crate::models::InstalledAddonManifest;
use crate::models::version::is_version_newer;
use crate::addons::update;

#[tauri::command]
pub async fn update_addon(addon_slug: String) -> Result<InstalledAddonManifest, String> {
	update::update_addon(addon_slug).await
}

#[tauri::command]
pub async fn check_addon_update(addon_slug: String) -> Result<Option<String>, String> {
	let client = reqwest::Client::new();
	let installed_addon_manifest = crate::addons::installer::installer::load_installed_addon_manifest(&addon_slug).await?;
	let manifest_url = match installed_addon_manifest.origin {
		crate::models::OriginDefinition::Url(origin) => origin.url,
	};
	let remote_manifest = crate::addons::installer::installer::fetch_remote_manifest(&client, &manifest_url).await?;
	if is_version_newer(&remote_manifest.version, &installed_addon_manifest.version) {
		Ok(Some(remote_manifest.version))
	} else {
		Ok(None)
	}
}

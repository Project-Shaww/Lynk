use crate::models::InstalledAddonManifest;

use super::installer::installer;

pub async fn update_addon(addon_slug: String) -> Result<InstalledAddonManifest, String> {
	installer::update_addon(addon_slug).await
}

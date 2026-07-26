use crate::models::InstalledAddonManifest;

use super::installer::installer;

pub async fn install_addon(manifest_url: String) -> Result<InstalledAddonManifest, String> {
	installer::install_addon_from_url(manifest_url).await
}

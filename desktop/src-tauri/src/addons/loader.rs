use crate::config::handler::ConfigHandler;
use crate::models::InstalledAddonManifest;
use crate::fs::paths::addons_dir;

pub async fn get_installed_addons() -> Result<Vec<InstalledAddonManifest>, String> {
    let config_handler = ConfigHandler::load().await?;
    let config = config_handler.config();
    let mut addons = Vec::new();
    let addons_root = addons_dir().ok_or_else(|| "Unable to resolve addons directory".to_string())?;

    for (slug, _def) in &config.installed {
        let manifest_path = addons_root.join(slug).join("manifest.json");
        if manifest_path.exists() {
            let manifest_bytes = tokio::fs::read(&manifest_path).await.map_err(|e| e.to_string())?;
            let manifest: InstalledAddonManifest = serde_json::from_slice(&manifest_bytes).map_err(|e| e.to_string())?;
            addons.push(manifest);
        }
    }
    Ok(addons)
}

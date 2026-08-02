use crate::config::handler::ConfigHandler;

pub async fn uninstall_addon(addon_slug: String) -> Result<(), String> {
	if let Some(addons_dir) = crate::fs::paths::addons_dir() {
		let addon_path = addons_dir.join(&addon_slug);
		if addon_path.exists() {
			tokio::fs::remove_dir_all(&addon_path).await.map_err(|e| e.to_string())?;

			let mut config_handler = ConfigHandler::load().await?;
			config_handler.delete_installed(&addon_slug);
			config_handler.delete_enabled(&addon_slug);
			config_handler.delete_override(&addon_slug);
			config_handler.save().await?;
		}else{
			return Err(format!("Addon {} not found", addon_slug));
		}
	}else{
		return Err("Unable to find addons directory".to_string());
	}
	Ok(())
}

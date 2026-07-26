use crate::addons::uninstall;

#[tauri::command]
pub async fn uninstall_addon(addon_slug: String) -> Result<(), String> {
	uninstall::uninstall_addon(addon_slug).await
}

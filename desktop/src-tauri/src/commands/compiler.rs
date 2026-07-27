use crate::compiler;
use crate::models::compiler::{CompiledManifest, EnabledAddons};

#[tauri::command]
pub async fn validate_addons() -> Result<EnabledAddons, String> {
    let addons = compiler::get_addons().await?;
    let enabled_addons = compiler::get_enabled_addons(&addons).await?;
    let _ = compiler::validate_enabled_addons(&enabled_addons)?;
    Ok(enabled_addons)
}

#[tauri::command]
pub async fn compile_manifest() -> Result<CompiledManifest, String> {
    compiler::compile_manifest().await
}
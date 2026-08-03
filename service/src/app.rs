use crate::addons::CompiledManifest;
use crate::servers::ServersMap;
use crate::consts::APP_FOLDER_NAME;

use std::sync::Arc;
use tokio::sync::oneshot;
use tokio::sync::Mutex;
use directories::BaseDirs;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct AppState {
    pub manifest: Arc<Mutex<CompiledManifest>>,
    pub servers: ServersMap,
    pub shutdown_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    pub bearer_token: Arc<String>,
}

pub fn app_data_dir() -> Option<PathBuf> {
    BaseDirs::new().map(|dirs| dirs.data_dir().join(APP_FOLDER_NAME))
}

pub fn bearer_token_path() -> Option<PathBuf> {
    app_data_dir().map(|dir| dir.join("bearer"))
}

pub async fn load_or_create_bearer_token() -> Result<String, String> {
    let token_path = bearer_token_path().ok_or_else(|| "Failed to find app data directory".to_string())?;

    if let Ok(existing_token) = tokio::fs::read_to_string(&token_path).await {
        let trimmed = existing_token.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }

    if let Some(parent) = token_path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }

    let token = uuid::Uuid::new_v4().simple().to_string();
    tokio::fs::write(&token_path, &token).await.map_err(|e| e.to_string())?;
    Ok(token)
}
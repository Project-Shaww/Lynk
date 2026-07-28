use crate::app::{app_data_dir, AppState};

use axum::{extract::State, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{collections::{HashMap, HashSet}, path::PathBuf};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeInfo {
	#[serde(default)]
	pub id: String,
	#[serde(default)]
	pub full_id: String,
	#[serde(default)]
	pub addon_id: String,
	#[serde(default)]
	pub addon_uid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
	#[serde(default)]
	pub id: String,
	#[serde(default)]
	pub addon_id: String,
	#[serde(default)]
	pub addon_uid: String,
	#[serde(default)]
	pub full_id: String,
	#[serde(default)]
	pub runtime: Option<RuntimeInfo>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CompiledManifestFile {
    #[serde(default, rename = "compiler_version")]
    pub compiler_version: String,
    #[serde(default)]
    pub servers: HashMap<String, String>,
    #[serde(default)]
    pub servers_info: HashMap<String, ServerInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompiledManifest {
    pub compiler_version: String,
    pub servers: HashMap<String, String>,
	pub servers_info: HashMap<String, ServerInfo>,
}

impl CompiledManifest {
    pub fn from_file(file: CompiledManifestFile) -> Self {
        Self {
            compiler_version: file.compiler_version,
            servers: file.servers,
			servers_info: file.servers_info,
        }
    }
}

fn manifest_path() -> Option<PathBuf> {
    app_data_dir().map(|dir| dir.join("manifest.compiled.json"))
}

pub fn load_manifest() -> Result<CompiledManifest, String> {
    let manifest_path = manifest_path().ok_or_else(|| "Failed to find app data directory".to_string())?;
    
    if !manifest_path.exists() {
        let dummy_manifest = CompiledManifest {
            compiler_version: "<not found>".to_string(),
            servers: HashMap::new(),
			servers_info: HashMap::new(),
        };
        return Ok(dummy_manifest);
    }

    let content = std::fs::read_to_string(&manifest_path)
        .map_err(|error| format!("failed to read compiled manifest: {}", error))?;

    let manifest_file = serde_json::from_str::<CompiledManifestFile>(&content)
        .map_err(|error| format!("failed to parse compiled manifest: {}", error))?;

    Ok(CompiledManifest::from_file(manifest_file))
}

pub async fn get_manifest(State(state): State<AppState>) -> impl IntoResponse {
    let manifest = state.manifest.lock().await;
    (axum::http::StatusCode::OK, Json(json!(manifest.clone())))
}

pub async fn list_protocols(State(state): State<AppState>) -> impl IntoResponse {
    let manifest = state.manifest.lock().await;
    let mut protocols = Vec::with_capacity(manifest.servers.len() + 4);
    let mut seen = HashSet::new();

    protocols.push("http".to_string());
    protocols.push("https".to_string());
    protocols.push("ftp".to_string());
    protocols.push("file".to_string());

    for protocol in manifest.servers.keys() {
        if seen.insert(protocol.clone()) {
            protocols.push(protocol.clone());
        }
    }

    (axum::http::StatusCode::OK, Json(json!(protocols)))
}

pub async fn reload_manifest(State(state): State<AppState>) -> impl IntoResponse {
    match load_manifest() {
        Ok(new_manifest) => {
            info!("loaded compiled manifest: {} servers", new_manifest.servers.len());
            let mut guard = state.manifest.lock().await;
            *guard = new_manifest;
            
            (axum::http::StatusCode::OK, Json(json!({ "reloaded": true })))
        }
        Err(error) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "reloaded": false, "error": error })),
        ),
    }
}
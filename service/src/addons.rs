use crate::app::{app_data_dir, AppState};

use axum::{extract::State, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{collections::{HashMap, HashSet}, path::PathBuf};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RuntimeDefinition {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub command: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerDefinition {
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub runtime_engine: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CompiledManifestFile {
    #[serde(default, rename = "compiler_version")]
    pub compiler_version: String,
    #[serde(default)]
    pub runtimes: Vec<RuntimeDefinition>,
    #[serde(default)]
    pub servers: Vec<ServerDefinition>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompiledManifest {
    pub compiler_version: String,
    pub runtimes: HashMap<String, RuntimeDefinition>,
    pub servers: HashMap<String, ServerDefinition>,
}

impl CompiledManifest {
    pub fn from_file(file: CompiledManifestFile) -> Self {
        let runtimes = file
            .runtimes
            .into_iter()
            .filter(|runtime| !runtime.id.is_empty())
            .map(|runtime| (runtime.id.clone(), runtime))
            .collect();

        let servers = file
            .servers
            .into_iter()
            .filter(|server| !server.protocol.is_empty())
            .map(|server| (server.protocol.clone(), server))
            .collect();

        Self {
            compiler_version: file.compiler_version,
            runtimes,
            servers,
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
            runtimes: HashMap::new(),
            servers: HashMap::new(),
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
    let mut protocols = Vec::with_capacity(manifest.servers.len());
    let mut seen = HashSet::new();

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
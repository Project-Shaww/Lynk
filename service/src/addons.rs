use crate::app::AppDataFile;
use crate::app::AppState;

use axum::{extract::State, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AddonDefinition {
    #[serde(default, rename = "name")]
    pub _name: String,
    #[serde(default, rename = "description")]
    pub _description: Option<String>,
    #[serde(default, rename = "manifest")]
    pub _manifest: String,
    #[serde(default, rename = "version")]
    pub _version: String,
    #[serde(default, rename = "dependencies")]
    pub _dependencies: Option<Vec<String>>,
    #[serde(default)]
    pub runtimes: Option<Vec<RuntimeDefinition>>,
    #[serde(default)]
    pub servers: Option<Vec<ServerDefinition>>,
}

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
    pub args: Option<Vec<String>>,
}

pub fn load_addons() -> HashMap<String, AddonDefinition> {
    let mut addons = HashMap::new();
    let file_name = "app-data.json";

    if let Ok(content) = std::fs::read_to_string(file_name) {
        if let Ok(app_data) = serde_json::from_str::<AppDataFile>(&content) {
            for (id, addon) in app_data.addons {
                addons.insert(id, addon);
            }
        }
    }

    if addons.is_empty() {
        if let Ok(entries) = std::fs::read_dir("addons") {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(app_data) = serde_json::from_str::<AppDataFile>(&content) {
                        for (id, addon) in app_data.addons {
                            addons.insert(id, addon);
                        }
                    }
                }
            }
        }
    }

    addons
}

pub async fn list_addons(State(state): State<AppState>) -> impl IntoResponse {
    let map = state.addons.as_ref();
    let mut out = serde_json::Map::new();
    for (id, addon) in map.iter() {
        out.insert(id.clone(), serde_json::to_value(addon).unwrap_or(json!({})));
    }
    (axum::http::StatusCode::OK, Json(json!({ "addons": out })))
}

pub async fn list_protocols(State(state): State<AppState>) -> impl IntoResponse {
    let mut protocols = Vec::new();
    for (_id, addon) in state.addons.as_ref().iter() {
        if let Some(ser_list) = &addon.servers {
            for srv in ser_list.iter() {
                if !srv.protocol.is_empty() && !protocols.contains(&srv.protocol) {
                    protocols.push(srv.protocol.clone());
                }
            }
        }
    }
    (axum::http::StatusCode::OK, Json(json!({ "protocols": protocols })))
}
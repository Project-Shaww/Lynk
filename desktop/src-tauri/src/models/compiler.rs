use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::common::{RuntimeDefinition, ServerDefinition};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfoDefinition {
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
	pub runtime: Option<InfoDefinition>,
}

impl ServerInfo {
    pub fn from_info(info: &InfoDefinition, runtime: Option<InfoDefinition>) -> Self {
        Self {
            id: info.id.clone(),
            addon_id: info.addon_id.clone(),
            addon_uid: info.addon_uid.clone(),
            full_id: info.full_id.clone(),
            runtime: runtime.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompiledManifest {
    #[serde(default, rename = "compiler_version")]
    pub compiler_version: String,
    #[serde(default)]
    pub servers: HashMap<String, String>,
    #[serde(default)]
    pub servers_info: HashMap<String, ServerInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinimalAddonDefinition {
    #[serde(default, rename = "addon_id")]
    pub addon_id: String,
    #[serde(default)]
    pub runtimes: Vec<RuntimeDefinition>,
    #[serde(default)]
    pub servers: Vec<ServerDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnabledAddons {
    #[serde(default)]
    pub runtimes: Vec<RuntimeDefinition>,
    #[serde(default)]
    pub servers: Vec<ServerDefinition>,
    #[serde(default)]
    pub runtimes_info: HashMap<String, InfoDefinition>,
    #[serde(default)]
    pub servers_info: HashMap<String, InfoDefinition>,
}
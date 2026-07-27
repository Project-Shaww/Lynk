use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::common::{RuntimeDefinition, ServerDefinition};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompiledManifest {
    #[serde(default, rename = "compiler_version")]
    pub compiler_version: String,
    #[serde(default)]
    pub servers: HashMap<String, String>,
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
}
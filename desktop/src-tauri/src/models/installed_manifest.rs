use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use super::overrides::*;
use super::common::*;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct InstalledAddonManifest {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
	pub installed_id: String,
    #[serde(default)]
	pub origin: OriginDefinition,
    #[serde(default)]
	pub name: String,
    #[serde(default)]
	pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
	pub version: String,
    #[serde(default)]
	pub dependencies: Option<Vec<DependencieDefinition>>,
    #[serde(default)]
	pub runtimes: Option<Vec<RuntimeDefinition>>,
    #[serde(default)]
	pub servers: Option<Vec<ServerDefinition>>,
    #[serde(default)]
    pub presets: Option<HashMap<String, PresetDefinition>>,
}
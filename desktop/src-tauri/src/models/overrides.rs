use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OverrideDefinition {
    #[serde(default)]
    pub runtimes: Option<HashMap<String, RuntimeOverrideDefinition>>,
    #[serde(default)]
    pub servers: Option<HashMap<String, ServerOverrideDefinition>>,
	#[serde(default)]
	pub skip_dependencies: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RuntimeOverrideDefinition {
	#[serde(default)]
	pub id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerOverrideDefinition {
	#[serde(default)]
	pub protocol: Option<String>,
    #[serde(default)]
    pub runtime_engine: Option<String>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PresetDefinition {
    #[serde(default)]
    pub name: Option<String>,
	#[serde(default)]
	pub description: Option<String>,
	#[serde(default, rename = "override")]
	pub override_setting: Option<OverrideDefinition>,
}
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

use super::overrides::OverrideDefinition;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InstalledAddonDefinition {
    #[serde(default)]
	pub id: String,
    #[serde(default)]
	pub path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EnabledAddonDefinition {
    #[serde(default)]
	pub runtimes: Option<Vec<String>>,
    #[serde(default)]
	pub servers: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
	pub installed: HashMap<String, InstalledAddonDefinition>,
    #[serde(default)]
	pub overrides: HashMap<String, OverrideDefinition>,
    #[serde(default)]
	pub enabled: HashMap<String, EnabledAddonDefinition>,
}
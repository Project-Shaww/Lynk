use crate::addons::AddonDefinition;
use crate::servers::ServersMap;

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Deserialize)]
pub struct AppDataFile {
    #[serde(name="version")]
    pub _version: String,
    #[serde(default)]
    pub addons: HashMap<String, AddonDefinition>,
}

#[derive(Clone)]
pub struct AppState {
    pub addons: Arc<HashMap<String, AddonDefinition>>,
    pub servers: ServersMap,
}
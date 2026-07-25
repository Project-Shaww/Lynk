use crate::addons::CompiledManifest;
use crate::servers::ServersMap;

use std::sync::Arc;
use tokio::sync::Mutex;
use directories::BaseDirs;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct AppState {
    pub manifest: Arc<Mutex<CompiledManifest>>,
    pub servers: ServersMap,
}

pub fn app_data_dir() -> Option<PathBuf> {
    BaseDirs::new().map(|dirs| dirs.data_dir().join("lynk").to_owned())
}
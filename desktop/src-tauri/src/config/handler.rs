use std::path::PathBuf;

use crate::fs::paths::app_data_dir;
use crate::models::config::{Config, EnabledAddonDefinition, InstalledAddonDefinition};
use crate::models::overrides::OverrideDefinition;

#[derive(Debug, Clone)]
pub struct ConfigHandler {
    path: PathBuf,
    config: Config,
}

impl ConfigHandler {
    pub async fn load() -> Result<Self, String> {
        let path = config_path()?;
        let config = load_config_from_path(&path).await?;

        Ok(Self { path, config })
    }

    pub async fn load_or_default() -> Result<Self, String> {
        Self::load().await
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    pub fn config_mut(&mut self) -> &mut Config {
        &mut self.config
    }

    pub async fn reload(&mut self) -> Result<(), String> {
        self.config = load_config_from_path(&self.path).await?;
        Ok(())
    }

    pub async fn save(&self) -> Result<(), String> {
        save_config_to_path(&self.path, &self.config).await
    }

    pub fn add_installed(&mut self, key: impl Into<String>, installed: InstalledAddonDefinition) {
        self.config.installed.insert(key.into(), installed);
    }

    pub fn delete_installed(&mut self, key: &str) -> Option<InstalledAddonDefinition> {
        self.config.installed.remove(key)
    }

    pub fn set_enabled(&mut self, key: impl Into<String>, enabled: EnabledAddonDefinition) {
        self.config.enabled.insert(key.into(), enabled);
    }

    pub fn delete_enabled(&mut self, key: &str) -> Option<EnabledAddonDefinition> {
        self.config.enabled.remove(key)
    }

    pub fn set_override(&mut self, key: impl Into<String>, override_definition: OverrideDefinition) {
        self.config.overrides.insert(key.into(), override_definition);
    }

    pub fn delete_override(&mut self, key: &str) -> Option<OverrideDefinition> {
        self.config.overrides.remove(key)
    }
}

async fn load_config_from_path(path: &PathBuf) -> Result<Config, String> {
    if !tokio::fs::try_exists(path).await.map_err(|e| e.to_string())? {
        return Ok(Config::default());
    }

    let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let config = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    Ok(config)
}

async fn save_config_to_path(path: &PathBuf, config: &Config) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }

    let bytes = serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?;
    tokio::fs::write(path, bytes).await.map_err(|e| e.to_string())
}

fn config_path() -> Result<PathBuf, String> {
    let app_data_dir = app_data_dir().ok_or_else(|| "Unable to resolve app data directory".to_string())?;
    Ok(app_data_dir.join("config.json"))
}
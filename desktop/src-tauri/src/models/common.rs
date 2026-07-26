use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct RuntimeDefinition {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ServerDefinition {
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub runtime_engine: Option<String>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct DependencieDefinition {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub optional: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct OriginUrlDefinition {
    #[serde(default)]
    pub url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag="type")]
pub enum OriginDefinition {
    #[serde(rename="url")]
	Url(OriginUrlDefinition),
}

impl Default for OriginDefinition {
    fn default() -> Self {
        Self::Url(OriginUrlDefinition::default())
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct FileDefinition {
    #[serde(default)]
    pub origin: OriginDefinition,
    #[serde(default)]
	pub sha256: String,
}
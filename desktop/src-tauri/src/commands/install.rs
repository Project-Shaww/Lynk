use crate::addons::{install, uninstall};
use crate::config::handler::ConfigHandler;
use crate::models::{InstalledAddonManifest, RemoteAddonManifest};
use crate::models::version::{is_version_at_least, is_version_newer};
use crate::addons::installer::validate::validate_remote_manifest;
use crate::addons::installer::installer::{fetch_remote_manifest, load_installed_addon_manifest};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct InstalledAddonSummary {
	pub installed_id: String,
	pub id: String,
	pub name: String,
	pub version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DependencyPreview {
	pub id: String,
	pub version: Option<String>,
	pub optional: bool,
	pub installed_version: Option<String>,
	pub status: String,
	pub resolved_origin_url: Option<String>,
	pub origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallPreview {
	pub manifest: RemoteAddonManifest,
	pub conflicts: Vec<InstalledAddonSummary>,
	pub dependencies: Vec<DependencyPreview>,
}

async fn get_installed_summaries_by_id(base_id: &str) -> Result<Vec<InstalledAddonSummary>, String> {
	let config_handler = ConfigHandler::load().await?;
	let config = config_handler.config();
	let mut matches = Vec::new();

	for (installed_id, installed_def) in config.installed.iter() {
		if installed_def.id == base_id {
			let manifest = load_installed_addon_manifest(installed_id).await?;
			matches.push(InstalledAddonSummary {
				installed_id: installed_id.clone(),
				id: installed_def.id.clone(),
				name: manifest.name,
				version: manifest.version,
			});
		}
	}

	Ok(matches)
}

async fn resolve_dependency_preview(client: &reqwest::Client, dependency: &crate::models::DependencieDefinition) -> Result<DependencyPreview, String> {
	let origins = dependency.origins.clone().unwrap_or_default();
	let mut resolved_origin_url = None;
	let mut installed_version: Option<String> = None;
	let mut status = String::from("unresolved");

	let config_handler = ConfigHandler::load().await?;
	let config = config_handler.config();
	for (installed_id, installed_def) in config.installed.iter() {
		if installed_def.id != dependency.id {
			continue;
		}
		let manifest = load_installed_addon_manifest(installed_id).await?;
		let should_replace = installed_version
			.as_ref()
			.map(|current| is_version_newer(&manifest.version, current))
			.unwrap_or(true);
		if should_replace {
			installed_version = Some(manifest.version);
		}
	}

	if let Some(required_version) = dependency.version.as_ref() {
		if let Some(current_version) = installed_version.as_ref() {
			if is_version_at_least(current_version, required_version) {
				status = String::from("satisfied");
			} else {
				status = String::from("needs-install");
			}
		} else {
			status = String::from("needs-install");
		}
	} else if installed_version.is_some() {
		status = String::from("satisfied");
	}

	if status != "satisfied" {
		for origin in origins.iter() {
			let origin_url = match origin {
				crate::models::OriginDefinition::Url(url) => url.url.clone(),
			};
			if origin_url.is_empty() {
				continue;
			}
			if let Ok(manifest) = fetch_remote_manifest(client, &origin_url).await {
				if validate_remote_manifest(&manifest).is_err() {
					continue;
				}
				if manifest.id == dependency.id {
					if let Some(required_version) = dependency.version.as_ref() {
						if is_version_at_least(&manifest.version, required_version) {
							resolved_origin_url = Some(origin_url.clone());
							status = String::from("ready");
							break;
						}
					} else {
						resolved_origin_url = Some(origin_url.clone());
						status = String::from("ready");
						break;
					}
				}
			}
		}
	}

	Ok(DependencyPreview {
		id: dependency.id.clone(),
		version: dependency.version.clone(),
		optional: dependency.optional.unwrap_or(false),
		installed_version,
		status,
		resolved_origin_url,
		origins: origins
			.into_iter()
			.map(|origin| match origin {
				crate::models::OriginDefinition::Url(url) => url.url,
			})
			.collect(),
	})
}

#[tauri::command]
pub async fn preview_install_addon(manifest_url: String) -> Result<InstallPreview, String> {
	let client = reqwest::Client::new();
	let manifest = crate::addons::installer::installer::fetch_remote_manifest(&client, &manifest_url).await?;
	validate_remote_manifest(&manifest)?;
	let conflicts = get_installed_summaries_by_id(&manifest.id).await?;
	let mut dependencies = Vec::new();

	if let Some(manifest_dependencies) = &manifest.dependencies {
		for dependency in manifest_dependencies {
			dependencies.push(resolve_dependency_preview(&client, dependency).await?);
		}
	}

	Ok(InstallPreview {
		manifest,
		conflicts,
		dependencies,
	})
}

#[tauri::command]
pub async fn install_addon(manifest_url: String, replace_existing: Option<bool>) -> Result<InstalledAddonManifest, String> {
	let res = install::install_addon(manifest_url.clone()).await;
	if res.is_ok() && replace_existing.unwrap_or(false) {
		let preview = preview_install_addon(manifest_url).await?;
		for conflict in preview.conflicts {
			let _ = uninstall::uninstall_addon(conflict.installed_id).await;
		}
	}
	res
}

#[tauri::command]
pub async fn get_remote_manifest(manifest_url: String) -> Result<RemoteAddonManifest, String> {
	let client = reqwest::Client::new();
	crate::addons::installer::installer::fetch_remote_manifest(&client, &manifest_url).await
}

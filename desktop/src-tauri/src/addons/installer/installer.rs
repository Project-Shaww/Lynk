use rand::{distributions::Alphanumeric, Rng};
use reqwest::Client;
use std::path::Path;

use crate::fs::{download::download_to_file, extract::extract_if_needed, paths::{addons_dir, temp_dir}, verify::verify_sha256};
use crate::models::{config, InstalledAddonManifest, OriginDefinition, OriginUrlDefinition, RemoteAddonManifest};
use crate::config::handler::ConfigHandler;

use super::validate::validate_remote_manifest;

pub async fn install_addon_from_url(manifest_url: String) -> Result<InstalledAddonManifest, String> {
	let client = Client::new();
	let manifest = fetch_remote_manifest(&client, &manifest_url).await?;
	validate_remote_manifest(&manifest)?;

	let temp_root = temp_dir().ok_or_else(|| "Unable to resolve temp directory".to_string())?;
	let addons_root = addons_dir().ok_or_else(|| "Unable to resolve addons directory".to_string())?;
	tokio::fs::create_dir_all(&temp_root).await.map_err(|e| e.to_string())?;
	tokio::fs::create_dir_all(&addons_root).await.map_err(|e| e.to_string())?;

	let uid = generate_uid();
	let staging_dir = temp_root.join(&uid);
	tokio::fs::create_dir_all(&staging_dir).await.map_err(|e| e.to_string())?;

	let result = install_staged_addon(&client, &manifest, &staging_dir, &addons_root, &uid).await;

	if result.is_err() {
		cleanup_dir(&staging_dir).await;
	} else {
        let mut config_handler = ConfigHandler::load().await?;
        config_handler.add_installed(format!("{}-{}", manifest.id, uid), config::InstalledAddonDefinition {
            id: manifest.id.clone(),
            path: format!("{}-{}/", manifest.id, uid),
        });
		config_handler.set_enabled(format!("{}-{}", manifest.id, uid), config::EnabledAddonDefinition::default());
        config_handler.save().await?;
    }

	result
}

pub async fn update_addon(addon_slug: String) -> Result<InstalledAddonManifest, String> {
    let client = Client::new();
    let installed_addon_manifest = load_installed_addon_manifest(&addon_slug).await?;

    let manifest_url = match installed_addon_manifest.origin {
        OriginDefinition::Url(origin) => origin.url,
    };

	let manifest = fetch_remote_manifest(&client, &manifest_url).await?;
	validate_remote_manifest(&manifest)?;

    if manifest.version == installed_addon_manifest.version {
        return Err(format!("Addon is already installed at v{} for this update.", manifest.version));
    }

	let temp_root = temp_dir().ok_or_else(|| "Unable to resolve temp directory".to_string())?;
	let addons_root = addons_dir().ok_or_else(|| "Unable to resolve addons directory".to_string())?;
	tokio::fs::create_dir_all(&temp_root).await.map_err(|e| e.to_string())?;
	tokio::fs::create_dir_all(&addons_root).await.map_err(|e| e.to_string())?;

	let uid = addon_slug.clone().split("-").last().unwrap_or_default().to_string();
	let staging_dir = temp_root.join(&uid);
	tokio::fs::create_dir_all(&staging_dir).await.map_err(|e| e.to_string())?;
    tokio::fs::rename(&addons_root.join(&addon_slug), &addons_root.join(format!("{}-old-{}", uid, installed_addon_manifest.version))).await.map_err(|e| e.to_string())?;

	let result = install_staged_addon(&client, &manifest, &staging_dir, &addons_root, &uid).await;

	if result.is_err() {
		cleanup_dir(&staging_dir).await;
        let _ = tokio::fs::rename(&addons_root.join(format!("{}-old-{}", uid, installed_addon_manifest.version)), &addons_root.join(&addon_slug)).await;
        return Err(format!("Update failed: {}", result.err().unwrap_or_default()));
    } else {
        cleanup_dir(&addons_root.join(format!("{}-old-{}", uid, installed_addon_manifest.version))).await;
    }
    
	result
}

async fn install_staged_addon(client: &Client, manifest: &RemoteAddonManifest, staging_dir: &Path, addons_root: &Path, uid: &str) -> Result<InstalledAddonManifest, String> {
	download_manifest_files(client, manifest, staging_dir).await?;

	let installed_id = format!("{}-{}", manifest.id, uid);
	let installed_manifest = InstalledAddonManifest {
		id: manifest.id.clone(),
		installed_id: installed_id.clone(),
		origin: manifest.origin.clone(),
		name: manifest.name.clone(),
		description: manifest.description.clone(),
		version: manifest.version.clone(),
		dependencies: manifest.dependencies.clone(),
		runtimes: manifest.runtimes.clone(),
		servers: manifest.servers.clone(),
		presets: manifest.presets.clone(),
	};

	let manifest_path = staging_dir.join("manifest.json");
	let manifest_bytes = serde_json::to_vec_pretty(&installed_manifest).map_err(|e| e.to_string())?;
	tokio::fs::write(&manifest_path, manifest_bytes).await.map_err(|e| e.to_string())?;

	let final_dir = addons_root.join(&installed_id);
	if tokio::fs::try_exists(&final_dir).await.map_err(|e| e.to_string())? {
		return Err(format!("Addon '{}' is already installed", installed_id));
	}

	tokio::fs::rename(staging_dir, &final_dir).await.map_err(|e| e.to_string())?;

	Ok(installed_manifest)
}

async fn download_manifest_files(client: &Client, manifest: &RemoteAddonManifest, staging_dir: &Path) -> Result<(), String> {
	for (relative_path, file_definition) in &manifest.files {
        if relative_path == "manifest.json" {
            continue;
        }
		let destination = staging_dir.join(relative_path);
		let download_url = match &file_definition.origin {
			OriginDefinition::Url(origin) => origin.url.clone(),
		};

		download_to_file(client, download_url, destination.clone()).await?;
		verify_sha256(&destination, &file_definition.sha256).await?;
		extract_if_needed(&destination, staging_dir).await?;
	}

	Ok(())
}

pub async fn fetch_remote_manifest(client: &Client, manifest_url: &str) -> Result<RemoteAddonManifest, String> {
	let response = client.get(manifest_url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
	let origin_url = response.url().to_string();
	let manifest_text = response.text().await.map_err(|e| e.to_string())?;
	let mut manifest: RemoteAddonManifest = serde_json::from_str(&manifest_text).map_err(|e| e.to_string())?;
	manifest.origin = OriginDefinition::Url(OriginUrlDefinition { url: origin_url });
	Ok(manifest)
}

pub async fn load_installed_addon_manifest(installed_id: &str) -> Result<InstalledAddonManifest, String> {
    let addons_root = addons_dir().ok_or_else(|| "Unable to resolve addons directory".to_string())?;
    let manifest_path = addons_root.join(installed_id).join("manifest.json");
    let manifest_bytes = tokio::fs::read(&manifest_path).await.map_err(|e| e.to_string())?;
    let manifest: InstalledAddonManifest = serde_json::from_slice(&manifest_bytes).map_err(|e| e.to_string())?;
    Ok(manifest)
}

fn generate_uid() -> String {
	rand::thread_rng().sample_iter(&Alphanumeric).take(16).map(char::from).collect()
}

async fn cleanup_dir(path: &Path) {
	let _ = tokio::fs::remove_dir_all(path).await;
}

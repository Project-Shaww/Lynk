use crate::fs::paths::app_data_dir;
use crate::models::identifier::System;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tokio::time::{sleep, Duration, timeout};

const SERVICE_ADDR: &str = "http://127.0.0.1:51738";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub service: String,
    pub running: bool,
    pub service_version: String,
    pub compiler_version: String,
    pub active_servers: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningServer {
    pub id: String,
    pub metadata: serde_json::Value,
}



fn bearer_token_path() -> Result<PathBuf, String> {
    app_data_dir()
        .map(|dir| dir.join("bearer"))
        .ok_or_else(|| "Unable to resolve Lynk app data directory".to_string())
}

async fn fetch_service_status() -> Result<ServiceStatus, String> {
    let client = Client::new();
    let response = timeout(Duration::from_secs(2), client.get(format!("{SERVICE_ADDR}/status")).send())
        .await
        .map_err(|_| "Service status request timed out".to_string())?
        .map_err(|e| e.to_string())?;

    let payload = response.text().await.map_err(|e| e.to_string())?;
    let status = serde_json::from_str::<ServiceStatus>(&payload).map_err(|e| e.to_string())?;
    Ok(status)
}

#[tauri::command]
pub async fn get_service_status() -> Result<ServiceStatus, String> {
    match fetch_service_status().await {
        Ok(status) => Ok(status),
        Err(_) => Ok(ServiceStatus {
            service: "lynk-service".to_string(),
            running: false,
            service_version: String::new(),
            compiler_version: String::new(),
            active_servers: 0,
        }),
    }
}

#[tauri::command]
pub async fn get_running_servers() -> Result<Vec<RunningServer>, String> {
    let client = Client::new();
    let response = client
        .get(format!("{SERVICE_ADDR}/api/servers"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    let payload = response.text().await.map_err(|e| e.to_string())?;
    let servers = serde_json::from_str::<Vec<RunningServer>>(&payload).map_err(|e| e.to_string())?;
    Ok(servers)
}

#[tauri::command]
pub async fn reload_compiled_manifest() -> Result<(), String> {
    let client = Client::new();
    client
        .post(format!("{SERVICE_ADDR}/api/manifest/reload"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn start_service(app: AppHandle) -> Result<ServiceStatus, String> {
    if let Ok(status) = fetch_service_status().await {
        if status.running {
            return Ok(status);
        }
    }

    let (_, _child) = app.shell()
        .sidecar("lynk_service")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    for _ in 0..20 {
        if let Ok(status) = fetch_service_status().await {
            if status.running {
                return Ok(status);
            }
        }
        sleep(Duration::from_millis(200)).await;
    }

    Err("Service started but did not report healthy status in time".to_string())
}

#[tauri::command]
pub async fn shutdown_service() -> Result<(), String> {
    let token_path = bearer_token_path()?;
    let bearer_token = tokio::fs::read_to_string(&token_path)
        .await
        .map_err(|e| format!("Failed to read bearer token file: {}", e))?;

    let client = Client::new();
    client
        .post(format!("{SERVICE_ADDR}/shutdown"))
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", bearer_token.trim()))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_system_info() -> String {
    System::get_current()
}
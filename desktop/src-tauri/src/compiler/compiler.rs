use std::collections::HashMap;
use std::path::PathBuf;

use crate::fs::paths::{app_data_dir, addons_dir};
use crate::config::ConfigHandler;
use crate::models::common::{ServerDefinition, RuntimeDefinition};
use crate::models::compiler::{CompiledManifest, EnabledAddons, MinimalAddonDefinition};
use crate::models::InstalledAddonManifest;
use crate::validators::{validate_runtime, validate_server};

pub async fn get_addons() -> Result<Vec<MinimalAddonDefinition>, String> {
    let config_handler = ConfigHandler::load().await?;
    let config = config_handler.config();
    let mut addons: Vec<MinimalAddonDefinition> = Vec::new();

    for (id, _addon) in config.installed.iter() {
        match load_installed_addon_manifest(id).await {
            Ok(manifest) => {
                addons.push(MinimalAddonDefinition {
                    addon_id: id.clone(),
                    runtimes: manifest.runtimes.unwrap_or_default(),
                    servers: manifest.servers.unwrap_or_default(),
                });
            }
            Err(_) => {}
        }
    }

    for (id, override_def) in config.overrides.iter() {
        if let Some(addon) = addons.iter_mut().find(|a| &a.addon_id == id) {
            if let Some(override_runtimes) = override_def.runtimes.as_ref() {
                for (runtime_id, runtime_override_def) in override_runtimes.iter() {
                    if let Some(runtime) = addon.runtimes.iter_mut().find(|r| &r.id == runtime_id) {
                        if let Some(new_id) = runtime_override_def.id.clone() {
                            runtime.id = new_id;
                        }
                    }
                }
            }

            if let Some(override_servers) = override_def.servers.as_ref() {
                for (server_id, server_override_def) in override_servers.iter() {
                    if let Some(server) = addon.servers.iter_mut().find(|s| &s.id == server_id) {
                        if let Some(new_id) = server_override_def.id.clone() {
                            server.id = new_id;
                        }
                        if let Some(new_runtime_engine) = server_override_def.runtime_engine.clone() {
                            server.runtime_engine = Some(new_runtime_engine);
                        }
                        if let Some(new_args) = server_override_def.args.clone() {
                            server.args = Some(new_args);
                        }
                    }
                }
            }
        }
    }
    
    Ok(addons)
}

pub async fn get_enabled_addons(addons: &Vec<MinimalAddonDefinition>) -> Result<EnabledAddons, String> {
    let config_handler = ConfigHandler::load().await?;
    let config = config_handler.config();

    let mut enabled_runtimes = Vec::new();
    let mut enabled_servers = Vec::new();

    for addon in addons.iter() {
        if let Some(enabled) = config.enabled.get(&addon.addon_id) {
            let enable_all = enabled.runtimes.is_none() && enabled.servers.is_none();

            for runtime in addon.runtimes.iter() {
                let explicitly_enabled = enabled
                    .runtimes
                    .as_ref()
                    .map(|ids| ids.contains(&runtime.id))
                    .unwrap_or(false);

                if enable_all || explicitly_enabled {
                    enabled_runtimes.push(runtime.clone());
                }
            }

            for server in addon.servers.iter() {
                let explicitly_enabled = enabled
                    .servers
                    .as_ref()
                    .map(|ids| ids.contains(&server.id))
                    .unwrap_or(false);

                if enable_all || explicitly_enabled {
                    enabled_servers.push(server.clone());
                }
            }
        }
    }

    Ok(EnabledAddons {
        runtimes: enabled_runtimes,
        servers: enabled_servers,
    })
}

async fn load_installed_addon_manifest(installed_id: &str) -> Result<InstalledAddonManifest, String> {
    let addons_root = addons_dir().ok_or_else(|| "Unable to resolve addons directory".to_string())?;
    let manifest_path = addons_root.join(installed_id).join("manifest.json");
    let manifest_bytes = tokio::fs::read(&manifest_path).await.map_err(|e| e.to_string())?;
    let manifest: InstalledAddonManifest = serde_json::from_slice(&manifest_bytes).map_err(|e| e.to_string())?;
    Ok(manifest)
}

pub fn validate_enabled_addons(enabled: &EnabledAddons) -> Result<(), String> {
    for runtime in &enabled.runtimes {
        validate_runtime(runtime)
            .map_err(|e| format!("Invalid runtime '{}': {}", runtime.id, e))?;
    }

    let known_runtime_ids: std::collections::HashSet<&str> = enabled
        .runtimes
        .iter()
        .map(|r| r.id.as_str())
        .collect();

    for server in &enabled.servers {
        validate_server(server)
            .map_err(|e| format!("Invalid server '{}': {}", server.id, e))?;

        if let Some(engine) = &server.runtime_engine {
            if !known_runtime_ids.contains(engine.as_str()) {
                return Err(format!(
                    "Server '{}' references runtime_engine '{}' which is not present in the enabled runtimes",
                    server.id, engine
                ));
            }
        }
    }

    Ok(())
}

async fn save_compiled_manifest(path: &PathBuf, compiled: &CompiledManifest) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }

    let bytes = serde_json::to_vec_pretty(compiled).map_err(|e| e.to_string())?;
    tokio::fs::write(path, bytes).await.map_err(|e| e.to_string())
}

fn compiled_manifest_path() -> Result<PathBuf, String> {
    let app_data_dir = app_data_dir().ok_or_else(|| "Unable to resolve app data directory".to_string())?;
    Ok(app_data_dir.join("manifest.compiled.json"))
}

fn compile_server(server: &ServerDefinition, enabled_addons: &EnabledAddons, addons: &Vec<MinimalAddonDefinition>) -> Result<String, String> {
    let addons_dir = addons_dir().ok_or_else(|| "Unable to resolve addons directory".to_string())?;

    let get_server_addon_id = |server: &ServerDefinition, addons: &Vec<MinimalAddonDefinition>| -> Option<String> {
        for addon in addons {
            for addon_server in &addon.servers {
                if addon_server.id == server.id {
                    return Some(addon.addon_id.clone());
                }
            }
        }
        None
    };

    let compiled_args: Option<String> = server.args.as_ref().map(|args| {
        args.split(' ')
            .map(|arg| {
                if arg.starts_with("%ADDON_PATH%") {
                    let addon_path = arg["%ADDON_PATH%".len()..].trim_start_matches(['/', '\\']);
                    addons_dir.join(get_server_addon_id(server, addons).unwrap()).join(addon_path).display().to_string()
                } else {
                    arg.to_string()
                }
            })
            .collect::<Vec<String>>()
            .join(" ")
    });

    let with_args = |cmd: String| -> String {
        match compiled_args.as_deref() {
            Some(args) if !args.is_empty() => format!("{} {}", cmd, args),
            _ => cmd,
        }
    };

    let get_runtime_addon_id = |runtime: &RuntimeDefinition, addons: &Vec<MinimalAddonDefinition>| -> Option<String> {
        for addon in addons {
            for addon_runtime in &addon.runtimes {
                if addon_runtime.id == runtime.id {
                    return Some(addon.addon_id.clone());
                }
            }
        }
        None
    };

    if let Some(runtime_engine) = &server.runtime_engine {
        if let Some(runtime) = enabled_addons.runtimes.iter().find(|r| r.id == *runtime_engine) {
            let runtime_path = addons_dir.join(get_runtime_addon_id(runtime, addons).unwrap()).join(runtime.path.clone().unwrap_or_default());
            return Ok(with_args(runtime_path.display().to_string()));
        }
        return Err(format!(
            "Server '{}' references runtime_engine '{}' which was not found",
            server.id, runtime_engine
        ));
    }

    if let Some(path) = &server.path {
        return Ok(with_args(path.clone()));
    }

    Err(format!("Server '{}' needs either a runtime_engine or a path", server.id))
}

pub async fn compile_manifest() -> Result<CompiledManifest, String> {
    let addons: Vec<MinimalAddonDefinition> = get_addons().await?;
    let enabled_addons = get_enabled_addons(&addons).await?;
    validate_enabled_addons(&enabled_addons)?;

    let enabled_addons_copy = enabled_addons.clone();

    let servers: HashMap<String, String> = enabled_addons
        .servers
        .into_iter()
        .map(|server| {
            let id = server.id.clone();
            compile_server(&server, &enabled_addons_copy, &addons)
                .map(|cmd| (id, cmd))
        })
        .collect::<Result<HashMap<_, _>, String>>()?;

    let compiled_manifest = CompiledManifest {
        compiler_version: "0.1.0".to_string(),
        servers,
    };

    save_compiled_manifest(&compiled_manifest_path()?, &compiled_manifest).await?;

    Ok(compiled_manifest)
}

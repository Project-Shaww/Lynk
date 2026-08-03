use std::collections::HashMap;
use std::path::PathBuf;

use crate::fs::paths::{app_data_dir, addons_dir};
use crate::fs::os_specific_type::os_specific_file_type;
use crate::config::ConfigHandler;
use crate::models::common::{ServerDefinition, RuntimeDefinition};
use crate::models::compiler::{CompiledManifest, EnabledAddons, MinimalAddonDefinition, InfoDefinition, ServerInfo};
use crate::models::InstalledAddonManifest;
use crate::models::identifier::Identifier;
use crate::models::version::is_version_at_least;
use crate::validators::{validate_runtime, validate_server};
use crate::consts::COMPILER_VERSION;

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

    let mut runtimes_info: HashMap<String, InfoDefinition> = HashMap::new();
    let mut servers_info: HashMap<String, InfoDefinition> = HashMap::new();

    let is_compatible = |id: &str| {
        Identifier::from_string(id).is_current_system_compatible()
    };

    for addon in addons.iter() {
        if let Some(enabled) = config.enabled.get(&addon.addon_id) {
            let enable_all = enabled.runtimes.is_none() && enabled.servers.is_none();
            let mut runtimes_level: HashMap<String, u8> = HashMap::new();
            let mut servers_level: HashMap<String, u8> = HashMap::new();

            for runtime in addon.runtimes.iter() {
                let explicitly_enabled = enabled
                    .runtimes
                    .as_ref()
                    .map(|ids| ids.contains(&runtime.id))
                    .unwrap_or(false);

                if (enable_all || explicitly_enabled) && is_compatible(&runtime.id) {
                    let mut current = runtime.clone();
                    let runtime_id = runtime.id.clone();
                    let id = Identifier::from_string(&runtime_id).get_minimal();
                    let specification_level = Identifier::from_string(&runtime_id).specification_level();
                    current.id = id.clone();
                    if let Some(position) = enabled_runtimes.iter().position(|r: &RuntimeDefinition| r.id == current.id) {
                        if specification_level > *runtimes_level.get(&id).unwrap() {
                            runtimes_level.insert(id.clone(), specification_level);
                            runtimes_info.insert(id.clone(), InfoDefinition {
                                id: id.clone(),
                                full_id: runtime_id.clone(),
                                addon_id: addon.addon_id.clone().rsplit_once("-").map(|(id, _)| id.to_string()).unwrap_or(addon.addon_id.clone()),
                                addon_uid: addon.addon_id.clone(),
                            });
                            enabled_runtimes[position] = current;
                        }
                    } else {
                        runtimes_level.insert(id.clone(), specification_level);
                        runtimes_info.insert(id.clone(), InfoDefinition {
                            id: id.clone(),
                            full_id: runtime_id.clone(),
                            addon_id: addon.addon_id.clone().rsplit_once("-").map(|(id, _)| id.to_string()).unwrap_or(addon.addon_id.clone()),
                            addon_uid: addon.addon_id.clone(),
                        });
                        enabled_runtimes.push(current);
                    }
                }
            }

            for server in addon.servers.iter() {
                let explicitly_enabled = enabled
                    .servers
                    .as_ref()
                    .map(|ids| ids.contains(&server.id))
                    .unwrap_or(false);

                if (enable_all || explicitly_enabled) && is_compatible(&server.id) {
                    let mut current = server.clone();
                    let server_id = server.id.clone();
                    let id = Identifier::from_string(&server_id).get_minimal();
                    let specification_level = Identifier::from_string(&server_id).specification_level();
                    current.id = id.clone();
                    if let Some(position) = enabled_servers.iter().position(|r: &ServerDefinition| r.id == current.id) {
                        if specification_level > *servers_level.get(&id).unwrap() {
                            servers_level.insert(id.clone(), specification_level);
                            servers_info.insert(id.clone(), InfoDefinition {
                                id: id.clone(),
                                full_id: server_id.clone(),
                                addon_id: addon.addon_id.clone().rsplit_once("-").map(|(id, _)| id.to_string()).unwrap_or(addon.addon_id.clone()),
                                addon_uid: addon.addon_id.clone(),
                            });
                            enabled_servers[position] = current;
                        }
                    } else {
                        servers_level.insert(id.clone(), specification_level);
                        servers_info.insert(id.clone(), InfoDefinition {
                            id: id.clone(),
                            full_id: server_id.clone(),
                            addon_id: addon.addon_id.clone().rsplit_once("-").map(|(id, _)| id.to_string()).unwrap_or(addon.addon_id.clone()),
                            addon_uid: addon.addon_id.clone(),
                        });
                        enabled_servers.push(current);
                    }
                }
            }
        }
    }

    Ok(EnabledAddons {
        runtimes: enabled_runtimes,
        servers: enabled_servers,
        runtimes_info,
        servers_info,
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
    let mut runtimes_ids: Vec<String> = Vec::new();
    let mut servers_ids: Vec<String> = Vec::new();
    let integrated_servers_ids: Vec<String> = vec!["http".to_string(),"ws".to_string(),"tcp".to_string(),"udp".to_string()];
        

    for runtime in &enabled.runtimes {
        validate_runtime(runtime)
            .map_err(|e| format!("Invalid runtime '{}': {}", runtime.id, e))?;
        if !runtimes_ids.contains(&runtime.id) {
            runtimes_ids.push(runtime.id.clone());
        } else {
            return Err(format!("Duplicate runtime id '{}' in enabled addons", runtime.id));
        }
    }

    let known_runtime_ids: std::collections::HashSet<&str> = enabled
        .runtimes
        .iter()
        .map(|r| r.id.as_str())
        .collect();

    for server in &enabled.servers {
        validate_server(server)
            .map_err(|e| format!("Invalid server '{}': {}", server.id, e))?;
        if integrated_servers_ids.contains(&server.id) {
            return Err(format!("Server id '{}' is integrated and cannot be used", server.id));
        }
        if !servers_ids.contains(&server.id) {
            servers_ids.push(server.id.clone());
        } else {
            return Err(format!("Duplicate server id '{}' in enabled addons", server.id));
        }
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

async fn validate_required_dependencies() -> Result<(), String> {
    let config_handler = ConfigHandler::load().await?;
    let config = config_handler.config();
    let mut installed_manifests = Vec::new();

    for (installed_id, installed_def) in config.installed.iter() {
        let manifest = load_installed_addon_manifest(installed_id).await?;
        installed_manifests.push((installed_def.id.clone(), manifest));
    }

    for (base_id, manifest) in installed_manifests.iter() {
        if let Some(override_def) = config.overrides.get(&manifest.installed_id) {
            if override_def.skip_dependencies.unwrap_or(false) {
                continue;
            }
        }
        if let Some(dependencies) = manifest.dependencies.as_ref() {
            for dependency in dependencies {
                if dependency.optional.unwrap_or(false) {
                    continue;
                }

                let satisfied = installed_manifests.iter().any(|(candidate_base_id, candidate_manifest)| {
                    candidate_base_id == &dependency.id
                        && dependency
                            .version
                            .as_ref()
                            .map(|required| is_version_at_least(&candidate_manifest.version, required))
                            .unwrap_or(true)
                });

                if !satisfied {
                    return Err(format!(
                        "Addon '{}' requires dependency '{}'{}",
                        base_id,
                        dependency.id,
                        dependency
                            .version
                            .as_ref()
                            .map(|version| format!(" >= {}", version))
                            .unwrap_or_default()
                    ));
                }
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

fn compile_server(server: &ServerDefinition, enabled_addons: &EnabledAddons, addons: &Vec<MinimalAddonDefinition>, servers_info: &mut HashMap<String, ServerInfo>) -> Result<String, String> {
    let addons_dir = addons_dir().ok_or_else(|| "Unable to resolve addons directory".to_string())?;
    let server_info = enabled_addons.servers_info.get(&server.id).ok_or_else(|| "Unable to find server info".to_string())?;

    let get_server_addon_id = |server: &ServerDefinition, addons: &Vec<MinimalAddonDefinition>, servers_info: &HashMap<String, InfoDefinition>| -> Option<String> {
        for addon in addons {
            for addon_server in &addon.servers {
                if addon_server.id == server.id {
                    return Some(addon.addon_id.clone());
                }
                if let Some(server_info) = servers_info.get(&server.id) {
                    if server_info.full_id.to_string() == addon_server.id.to_string() {
                        return Some(addon.addon_id.clone());
                    }
                }
            }
        }
        None
    };

    let compiled_args: Option<String> = server.args.as_ref().map(|args| {
        args.split(' ')
            .map(|arg| {
                if arg.starts_with("%ADDON_PATH%") {
                    let addon_path = os_specific_file_type(&arg["%ADDON_PATH%".len()..].trim_start_matches(['/', '\\']));
                    addons_dir.join(get_server_addon_id(server, addons, &enabled_addons.servers_info).unwrap()).join(addon_path).display().to_string()
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

    let get_runtime_addon_id = |runtime: &RuntimeDefinition, addons: &Vec<MinimalAddonDefinition>, runtime_info: &HashMap<String, InfoDefinition>| -> Option<String> {
        for addon in addons {
            for addon_runtime in &addon.runtimes {
                if addon_runtime.id == runtime.id {
                    return Some(addon.addon_id.clone());
                }
                if let Some(runtime_info) = runtime_info.get(&runtime.id) {
                    if runtime_info.full_id == addon_runtime.id {
                        return Some(addon.addon_id.clone());
                    }
                }
            }
        }
        None
    };

    if let Some(runtime_engine) = &server.runtime_engine {
        if let Some(runtime) = enabled_addons.runtimes.iter().find(|r| r.id == *runtime_engine) {
            let runtime_path = addons_dir.join(get_runtime_addon_id(runtime, addons, &enabled_addons.runtimes_info).unwrap()).join(os_specific_file_type(&runtime.path.clone().unwrap_or_default()));
            let runtime_info = enabled_addons.runtimes_info.get(runtime_engine).ok_or_else(|| "Unable to find runtime info".to_string())?;
            servers_info.insert(server_info.id.clone(), ServerInfo::from_info(&server_info, Some(runtime_info.clone())));
            return Ok(with_args(runtime_path.display().to_string()));
        }
        return Err(format!(
            "Server '{}' references runtime_engine '{}' which was not found",
            server.id, runtime_engine
        ));
    }

    if let Some(path) = &server.path {
        servers_info.insert(server_info.id.clone(), ServerInfo::from_info(&server_info, None));
        return Ok(with_args(os_specific_file_type(&path)));
    }

    Err(format!("Server '{}' needs either a runtime_engine or a path", server.id))
}

pub async fn compile_manifest() -> Result<CompiledManifest, String> {
    let addons: Vec<MinimalAddonDefinition> = get_addons().await?;
    let enabled_addons = get_enabled_addons(&addons).await?;
    validate_required_dependencies().await?;
    validate_enabled_addons(&enabled_addons)?;

    let enabled_addons_copy = enabled_addons.clone();
    let mut servers_info: HashMap<String, ServerInfo> = HashMap::new();

    let servers: HashMap<String, String> = enabled_addons
        .servers
        .into_iter()
        .map(|server| {
            let id = server.id.clone();
            compile_server(&server, &enabled_addons_copy, &addons, &mut servers_info)
                .map(|cmd| (id, cmd))
        })
        .collect::<Result<HashMap<_, _>, String>>()?;

    let compiled_manifest = CompiledManifest {
        compiler_version: COMPILER_VERSION.to_string(),
        servers,
        servers_info,
    };

    save_compiled_manifest(&compiled_manifest_path()?, &compiled_manifest).await?;

    Ok(compiled_manifest)
}

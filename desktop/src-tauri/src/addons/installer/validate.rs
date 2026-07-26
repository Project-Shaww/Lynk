use std::collections::HashSet;

use crate::models::{RemoteAddonManifest, ServerDefinition, RuntimeDefinition};

use super::check::{validate_relative_path, validate_slug};

pub fn validate_remote_manifest(manifest: &RemoteAddonManifest) -> Result<(), String> {
	validate_slug(&manifest.id, "manifest.id")?;

	let mut runtime_ids = HashSet::new();
	if let Some(runtimes) = &manifest.runtimes {
		for runtime in runtimes {
			validate_runtime(runtime)?;
			if !runtime_ids.insert(runtime.id.as_str()) {
				return Err(format!("Duplicate runtime id '{}' in manifest", runtime.id));
			}
		}
	}

	let mut server_protocols = HashSet::new();
	if let Some(servers) = &manifest.servers {
		for server in servers {
			validate_server(server)?;
			if !server_protocols.insert(server.protocol.as_str()) {
				return Err(format!("Duplicate server protocol '{}' in manifest", server.protocol));
			}
		}
	}

	for path in manifest.files.keys() {
		validate_relative_path(path, &format!("file path '{}'", path))?;
	}

    let mut dependency_ids = HashSet::new();
    if let Some(addons_dependencies) = &manifest.dependencies {
        for dependency in addons_dependencies {
            validate_slug(&dependency.id, "dependency id")?;
            if !dependency_ids.insert(dependency.id.as_str()) {
                return Err(format!("Duplicate dependency id '{}' in manifest", dependency.id));
            }
        }
    }

	Ok(())
}

fn validate_runtime(runtime: &RuntimeDefinition) -> Result<(), String> {
	validate_slug(&runtime.id, "runtime.id")?;

	let path = runtime.path.as_deref().ok_or_else(|| format!("runtime '{}' must define a path", runtime.id))?;
	validate_relative_path(path, &format!("runtime '{}' path", runtime.id))
}

fn validate_server(server: &ServerDefinition) -> Result<(), String> {
	validate_slug(&server.protocol, "server.protocol")?;

	if let Some(runtime_engine) = &server.runtime_engine {
		validate_slug(runtime_engine, &format!("server '{}' runtime_engine", server.protocol))?;
	}

	if let Some(path) = &server.path {
		validate_relative_path(path, &format!("server '{}' path", server.protocol))?;
	} else if server.runtime_engine.is_none() {
		return Err(format!("server '{}' needs either a runtime_engine or a path", server.protocol));
	}

    if let Some(args) = &server.args {
        for arg in args {
            if arg.starts_with("%ADDON_PATH%") {
                validate_relative_path(&arg["%ADDON_PATH%".len()..], &format!("server '{}' argument's addon path '{}'", server.protocol, arg))?;
            }
        }
    }

	Ok(())
}

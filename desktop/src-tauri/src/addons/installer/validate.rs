use std::collections::HashSet;

use crate::models::RemoteAddonManifest;
use crate::validators::{validate_relative_path, validate_slug, validate_runtime, validate_server};

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
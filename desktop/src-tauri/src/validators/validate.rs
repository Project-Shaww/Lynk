use std::path::{Component, Path};

use crate::models::{ServerDefinition, RuntimeDefinition};

pub fn validate_slug(value: &str, field: &str) -> Result<(), String> {
	if value.is_empty() {
		return Err(format!("{} cannot be empty", field));
	}

	if value.chars().all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-') {
		Ok(())
	} else {
		Err(format!("{} must contain only lowercase letters, numbers, and hyphens", field))
	}
}

pub fn validate_relative_path(path: &str, field: &str) -> Result<(), String> {
	if path.is_empty() {
		return Err(format!("{} cannot be empty", field));
	}

	let candidate = Path::new(path);

	if candidate.is_absolute() || candidate.components().any(|component| matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_) | Component::CurDir)) {
		Err(format!("{} must stay inside the addon base folder", field))
	} else {
		Ok(())
	}
}

pub fn validate_runtime(runtime: &RuntimeDefinition) -> Result<(), String> {
	validate_slug(&runtime.id, "runtime.id")?;

	let path = runtime.path.as_deref().ok_or_else(|| format!("runtime '{}' must define a path", runtime.id))?;
	validate_relative_path(path, &format!("runtime '{}' path", runtime.id))
}

pub fn validate_server(server: &ServerDefinition) -> Result<(), String> {
	validate_slug(&server.id, "server.id")?;

	if let Some(runtime_engine) = &server.runtime_engine {
		validate_slug(runtime_engine, &format!("server '{}' runtime_engine", server.id))?;
	}

	if let Some(path) = &server.path {
		validate_relative_path(path, &format!("server '{}' path", server.id))?;
	} else if server.runtime_engine.is_none() {
		return Err(format!("server '{}' needs either a runtime_engine or a path", server.id));
	}

    if let Some(args) = &server.args {
        for arg in args.split(' ') {
            if arg.starts_with("%ADDON_PATH%") {
				let addon_path = arg["%ADDON_PATH%".len()..].trim_start_matches(['/', '\\']);
				validate_relative_path(addon_path, &format!("server '{}' argument's addon path '{}'", server.id, arg))?;
            }
        }
    }

	Ok(())
}
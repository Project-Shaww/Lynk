use std::path::{Component, Path};

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

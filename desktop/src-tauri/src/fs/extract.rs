use std::fs::File;
use std::path::Path;

pub async fn extract_if_needed(path: &Path, destination: &Path) -> Result<(), String> {
	if !is_zip_archive(path) {
		return Ok(());
	}

	let archive_path = path.to_path_buf();
	let destination_path = destination.to_path_buf();
	tokio::task::spawn_blocking(move || extract_zip_archive(&archive_path, &destination_path))
		.await
		.map_err(|e| e.to_string())?
}

fn is_zip_archive(path: &Path) -> bool {
	path.extension()
		.and_then(|ext| ext.to_str())
		.map(|ext| ext.eq_ignore_ascii_case("zip"))
		.unwrap_or(false)
}

fn extract_zip_archive(path: &Path, destination: &Path) -> Result<(), String> {
	let file = File::open(path).map_err(|e| e.to_string())?;
	let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

	for index in 0..archive.len() {
		let mut zipped_file = archive.by_index(index).map_err(|e| e.to_string())?;
		let enclosed_name = zipped_file
			.enclosed_name()
			.ok_or_else(|| "ZIP contains an invalid path".to_string())?;
		let out_path = destination.join(enclosed_name);

		if zipped_file.is_dir() {
			std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
			continue;
		}

		if let Some(parent) = out_path.parent() {
			std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
		}

		let mut output = File::create(&out_path).map_err(|e| e.to_string())?;
		std::io::copy(&mut zipped_file, &mut output).map_err(|e| e.to_string())?;
	}

	std::fs::remove_file(path).map_err(|e| e.to_string())?;
	Ok(())
}

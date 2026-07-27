use directories::BaseDirs;
use std::path::PathBuf;

pub fn app_data_dir() -> Option<PathBuf> {
    BaseDirs::new().map(|dirs| dirs.data_dir().join("Lynk"))
}

pub fn temp_dir() -> Option<PathBuf> {
    app_data_dir().map(|dirs| dirs.join("temp"))
}

pub fn addons_dir() -> Option<PathBuf> {
    app_data_dir().map(|dirs| dirs.join("addons"))
}
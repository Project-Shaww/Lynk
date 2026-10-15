use directories::BaseDirs;
use std::path::PathBuf;
use crate::consts::APP_FOLDER_NAME;

pub fn app_data_dir() -> Option<PathBuf> {
    BaseDirs::new().map(|dirs| dirs.data_dir().join(APP_FOLDER_NAME))
}

pub fn temp_dir() -> Option<PathBuf> {
    app_data_dir().map(|dirs| dirs.join("temp"))
}

pub fn addons_dir() -> Option<PathBuf> {
    app_data_dir().map(|dirs| dirs.join("addons"))
}
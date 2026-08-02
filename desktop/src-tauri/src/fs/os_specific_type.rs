pub fn os_specific_executable(path: &str) -> String {
    match std::env::consts::OS {
        "windows" => path.to_string().replace("%EXE%", ".exe"),
        _ => path.to_string().replace("%EXE%", ""),
    }
}

pub fn os_specific_library(path: &str) -> String {
    match std::env::consts::OS {
        "windows" => path.to_string().replace("%LIB%", ".dll"),
        "linux" => path.to_string().replace("%LIB%", ".so"),
        "macos" => path.to_string().replace("%LIB%", ".dylib"),
        _ => path.to_string().replace("%LIB%", ""),
    }
}

pub fn os_specific_file_type(path: &str) -> String {
    if path.ends_with("%EXE%") {
        return os_specific_executable(&path);
    }
    if path.ends_with("%LIB%") {
        return os_specific_library(&path);
    }
    path.to_string()
}
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum System {
    Any,
    X86,
    X64,
    Arm,
    Arm64,
    Windows,
    WindowsX86,
    WindowsX64,
    WindowsArm64,
    Linux,
    LinuxX86,
    LinuxX64,
    LinuxArm64,
    Macos,
    Macosx64,
    MacosArm64,
}

impl System {
    pub fn from_string(s: &str) -> Self {
        match s {
            "x86" => Self::X86,
            "x64" => Self::X64,
            "arm" => Self::Arm,
            "arm64" => Self::Arm64,
            "windows" => Self::Windows,
            "windows-x86" => Self::WindowsX86,
            "windows-x64" => Self::WindowsX64,
            "windows-arm64" => Self::WindowsArm64,
            "linux" => Self::Linux,
            "linux-x86" => Self::LinuxX86,
            "linux-x64" => Self::LinuxX64,
            "linux-arm64" => Self::LinuxArm64,
            "macos" => Self::Macos,
            "macos-x64" => Self::Macosx64,
            "macos-arm64" => Self::MacosArm64,
            _ => Self::Any,
        }
    }

    pub fn to_string(&self) -> String {
        match self {
            Self::Any => "*".to_string(),
            Self::X86 => "x86".to_string(),
            Self::X64 => "x64".to_string(),
            Self::Arm => "arm".to_string(),
            Self::Arm64 => "arm64".to_string(),
            Self::Windows => "windows".to_string(),
            Self::WindowsX86 => "windows-x86".to_string(),
            Self::WindowsX64 => "windows-x64".to_string(),
            Self::WindowsArm64 => "windows-arm64".to_string(),
            Self::Linux => "linux".to_string(),
            Self::LinuxX86 => "linux-x86".to_string(),
            Self::LinuxX64 => "linux-x64".to_string(),
            Self::LinuxArm64 => "linux-arm64".to_string(),
            Self::Macos => "macos".to_string(),
            Self::Macosx64 => "macos-x64".to_string(),
            Self::MacosArm64 => "macos-arm64".to_string(),
        }
    }

    pub fn is_compatible(&self, os: &str, arch: &str) -> bool {
        match self {
            Self::Any => true,
            Self::X86 => arch == "x86",
            Self::X64 => arch == "x64",
            Self::Arm => arch == "arm",
            Self::Arm64 => arch == "arm64",
            Self::Windows => os == "windows",
            Self::WindowsX86 => os == "windows" && arch == "x86",
            Self::WindowsX64 => os == "windows" && arch == "x64",
            Self::WindowsArm64 => os == "windows" && arch == "arm64",
            Self::Linux => os == "linux",
            Self::LinuxX86 => os == "linux" && arch == "x86",
            Self::LinuxX64 => os == "linux" && arch == "x64",
            Self::LinuxArm64 => os == "linux" && arch == "arm64",
            Self::Macos => os == "macos",
            Self::Macosx64 => os == "macos" && arch == "x64",
            Self::MacosArm64 => os == "macos" && arch == "arm64",
        }
    }

    pub fn especification_level(&self) -> u8 {
        match self {
            Self::Any => 0,
            Self::X86 => 1,
            Self::X64 => 1,
            Self::Arm => 1,
            Self::Arm64 => 1,
            Self::Windows => 2,
            Self::WindowsX86 => 3,
            Self::WindowsX64 => 3,
            Self::WindowsArm64 => 3,
            Self::Linux => 2,
            Self::LinuxX86 => 3,
            Self::LinuxX64 => 3,
            Self::LinuxArm64 => 3,
            Self::Macos => 2,
            Self::Macosx64 => 3,
            Self::MacosArm64 => 3,
        }
    }

    pub fn get_current() -> Self {
        let target = std::env::consts::ARCH.to_string();
        let os = std::env::consts::OS.to_string();
        Self::from_string(&format!("{}-{}", os, target))
    }

    pub fn is_current_compatible(&self) -> bool {
        let target = std::env::consts::ARCH.to_string();
        let os = std::env::consts::OS.to_string();
        self.is_compatible(&os, &target)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Identifier {
    pub id: String,
    pub variant: Option<String>,
    pub system: Option<System>,
}

impl Identifier {
    pub fn from_string(s: &str) -> Self {
        let parts: Vec<&str> = s.split(':').collect();
        match parts.len() {
            1 => {
                let id = parts[0];
                let varsys:Vec<&str> = s.split('/').collect();
                match varsys.len() {
                    1 => Self {
                        id: id.to_string(),
                        variant: Some(varsys[0].to_string()),
                        system: None,
                    },
                    2 => Self {
                        id: id.to_string(),
                        variant: Some(varsys[0].to_string()),
                        system: Some(System::from_string(varsys[1])),
                    },
                    _ => Self {
                        id: s.to_string(),
                        variant: None,
                        system: None,
                    },
                }
            },
            2 => {
                let idsys:Vec<&str> = s.split('/').collect();
                match idsys.len() {
                    1 => Self {
                        id: idsys[0].to_string(),
                        variant: None,
                        system: None,
                    },
                    2 => Self {
                        id: idsys[0].to_string(),
                        variant: None,
                        system: Some(System::from_string(idsys[1])),
                    },
                    _ => Self {
                        id: s.to_string(),
                        variant: None,
                        system: None,
                    },
                }
            },
            _ => Self {
                id: s.to_string(),
                variant: None,
                system: None,
            },
        }
    }

    pub fn is_current_system_compatible(&self) -> bool {
        match &self.system {
            Some(system) => system.is_current_compatible(),
            None => true,
        }
    }

    pub fn get_minimal(&self) -> String {
        if let Some(variant) = &self.variant {
            format!("{}:{}", self.id, variant)
        } else {
            self.id.clone()
        }
    }

    pub fn specification_level(&self) -> u8 {
        match &self.system {
            Some(system) => system.especification_level(),
            None => 0,
        }
    }
}

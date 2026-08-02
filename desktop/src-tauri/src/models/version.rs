use std::cmp::Ordering;

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct Version {
    major: u64,
    minor: u64,
    patch: u64,
    pre: Option<PreRelease>,
}

#[derive(Debug, Clone, Eq, PartialEq)]
struct PreRelease {
    kind: PreReleaseKind,
    number: u64,
    raw: String,
}

#[derive(Debug, Clone, Eq, PartialEq)]
enum PreReleaseKind {
    Nightly,
    Alpha,
    Beta,
    Other,
}

impl Version {
    pub fn parse(input: &str) -> Option<Self> {
        let trimmed = input.trim().to_lowercase();
        if trimmed.is_empty() {
            return None;
        }

        let mut numeric = String::new();
        let mut suffix = String::new();
        let mut in_suffix = false;

        for character in trimmed.chars() {
            if !in_suffix && (character.is_ascii_digit() || character == '.') {
                numeric.push(character);
            } else {
                in_suffix = true;
                if !matches!(character, '-' | '_' | '+' | ' ' | '.') {
                    suffix.push(character);
                }
            }
        }

        let mut parts = numeric.split('.');
        let major = parts.next()?.parse::<u64>().ok()?;
        let minor = parts.next().unwrap_or("0").parse::<u64>().ok()?;
        let patch = parts.next().unwrap_or("0").parse::<u64>().ok()?;

        let pre = if suffix.is_empty() {
            None
        } else {
            Some(parse_pre_release(&suffix))
        };

        Some(Self {
            major,
            minor,
            patch,
            pre,
        })
    }

    pub fn is_at_least(&self, required: &Self) -> bool {
        self >= required
    }

    pub fn is_newer_than(&self, other: &Self) -> bool {
        self > other
    }
}

fn parse_pre_release(suffix: &str) -> PreRelease {
    let suffix = suffix.trim_start_matches(['-', '_', '+', ' ', '.']);
    let mut digits = String::new();
    let mut label = String::new();

    for character in suffix.chars() {
        if character.is_ascii_digit() {
            digits.push(character);
        } else {
            label.push(character);
        }
    }

    let number = digits.parse::<u64>().unwrap_or(0);
    let kind = if label.starts_with("nightly") || label == "n" {
        PreReleaseKind::Nightly
    } else if label.starts_with("alpha") || label == "a" {
        PreReleaseKind::Alpha
    } else if label.starts_with("beta") || label == "b" {
        PreReleaseKind::Beta
    } else {
        PreReleaseKind::Other
    };

    PreRelease {
        kind,
        number,
        raw: label,
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        match self.major.cmp(&other.major) {
            Ordering::Equal => {}
            order => return order,
        }
        match self.minor.cmp(&other.minor) {
            Ordering::Equal => {}
            order => return order,
        }
        match self.patch.cmp(&other.patch) {
            Ordering::Equal => {}
            order => return order,
        }

        match (&self.pre, &other.pre) {
            (None, None) => Ordering::Equal,
            (None, Some(_)) => Ordering::Greater,
            (Some(_), None) => Ordering::Less,
            (Some(left), Some(right)) => match left.kind.rank().cmp(&right.kind.rank()) {
                Ordering::Equal => match left.number.cmp(&right.number) {
                    Ordering::Equal => left.raw.cmp(&right.raw),
                    order => order,
                },
                order => order,
            },
        }
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PreReleaseKind {
    fn rank(&self) -> u8 {
        match self {
            Self::Nightly => 0,
            Self::Alpha => 1,
            Self::Beta => 2,
            Self::Other => 3,
        }
    }
}

pub fn is_version_at_least(installed: &str, required: &str) -> bool {
    match (Version::parse(installed), Version::parse(required)) {
        (Some(installed), Some(required)) => installed.is_at_least(&required),
        _ => installed.trim().eq_ignore_ascii_case(required.trim()),
    }
}

pub fn is_version_newer(installed: &str, other: &str) -> bool {
    match (Version::parse(installed), Version::parse(other)) {
        (Some(installed), Some(other)) => installed.is_newer_than(&other),
        _ => installed.trim() != other.trim(),
    }
}
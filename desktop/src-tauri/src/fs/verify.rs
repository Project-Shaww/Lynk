use sha2::{Digest, Sha256};

pub async fn verify_sha256(path: &std::path::Path, sha256: &str) -> Result<(), String> {
    let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let hash = Sha256::digest(&bytes);
    let hash = hex::encode(hash);
    if hash.to_lowercase() == sha256.to_lowercase() {
        Ok(())
    } else {
        Err(format!("Incorrect SHA256 for file {}", path.display()))
    }
}
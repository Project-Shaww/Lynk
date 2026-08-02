use crate::app::AppState;

use axum::{extract::State, http::{header, HeaderMap, StatusCode}, response::IntoResponse, Json};
use serde::Serialize;
use serde_json::json;

#[derive(Serialize)]
struct ServiceStatus {
    service: String,
    running: bool,
    service_version: &'static str,
    compiler_version: String,
    active_servers: usize,
}

pub async fn status(State(state): State<AppState>) -> impl IntoResponse {
    let manifest = state.manifest.lock().await;
    let servers = state.servers.lock().await;

    Json(ServiceStatus {
        service: "lynk-service".to_string(),
        running: true,
        service_version: env!("CARGO_PKG_VERSION"),
        compiler_version: manifest.compiler_version.clone(),
        active_servers: servers.len(),
    })
}

pub async fn shutdown(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let expected_token = state.bearer_token.as_str();
    let authorization = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()).unwrap_or("");
    let provided_token = authorization.strip_prefix("Bearer ").unwrap_or("");

    if provided_token.is_empty() || provided_token != expected_token {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "shutdown": false, "error": "invalid bearer token" })),
        );
    }

    let mut shutdown_tx = state.shutdown_tx.lock().await;
    if let Some(tx) = shutdown_tx.take() {
        let _ = tx.send(());
        (StatusCode::OK, Json(json!({ "shutdown": true })))
    } else {
        (
            StatusCode::CONFLICT,
            Json(json!({ "shutdown": false, "error": "service is already shutting down" })),
        )
    }
}
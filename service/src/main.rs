mod app;
mod addons;
mod servers;
mod socket;
mod integrated;

use crate::addons::{load_manifest, get_manifest, list_protocols, reload_manifest};
use crate::servers::list_servers;
use crate::app::AppState;
use crate::socket::ws_handler;

use axum::{routing::{get, post, any}, Router};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::Mutex;
use tracing::info;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt::init();

    let manifest = load_manifest()?;
    info!("loaded compiled manifest: {} servers", manifest.servers.len());

    let app_state = AppState { manifest: Arc::new(Mutex::new(manifest)), servers: Arc::new(Mutex::new(HashMap::new())) };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/socket", any(ws_handler))
        .route("/api/servers", get(list_servers))
        .route("/api/manifest", get(get_manifest))
        .route("/api/protocols", get(list_protocols))
        .route("/api/manifest/reload", post(reload_manifest))
        .with_state(app_state)
        .layer(cors);

    let addr = "0.0.0.0:51738";
    info!(%addr, "Starting Lynk Rust service");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
mod app;
mod addons;
mod servers;
mod socket;

use crate::addons::{load_addons, list_addons, list_protocols};
use crate::servers::list_servers;
use crate::app::AppState;
use crate::socket::ws_handler;

use axum::{routing::get, Router};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::Mutex;
use tracing::info;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt::init();

    let addons = load_addons();
    info!("loaded {} addons", addons.len());

    let app_state = AppState { addons: Arc::new(addons), servers: Arc::new(Mutex::new(HashMap::new())) };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/socket", get(ws_handler))
        .route("/api/servers", get(list_servers))
        .route("/api/addons", get(list_addons))
        .route("/api/protocols", get(list_protocols))
        .with_state(app_state)
        .layer(cors);

    let addr = "0.0.0.0:51738";
    info!(%addr, "Starting Lynk Rust service");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
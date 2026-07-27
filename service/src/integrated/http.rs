use crate::servers::{ChildSend, ServersMap};

use axum::{
    body::{Body, Bytes},
    extract::{State, ws::Message},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    Router,
};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::Duration;

#[derive(Clone)]
struct HttpState {
    requests: Arc<Mutex<HashMap<u64, oneshot::Sender<Response>>>>,
    next_rid: Arc<AtomicU64>,
    out_tx: mpsc::UnboundedSender<Message>,
    sid: String,
}

pub async fn spawn_http_server(
    sid: String,
    config: Value,
    servers: ServersMap,
    out_tx: mpsc::UnboundedSender<Message>,
    mut writer_rx: mpsc::UnboundedReceiver<ChildSend>,
) -> Result<u16, String> {
    let port = config.get("port").and_then(|p| p.as_u64()).unwrap_or(0) as u16;
    
    // Bind listener
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Failed to bind TCP listener for integrated HTTP: {}", e))?;
    
    let bound_port = listener.local_addr()
        .map_err(|e| format!("Failed to get local address for integrated HTTP: {}", e))?
        .port();

    let requests = Arc::new(Mutex::new(HashMap::<u64, oneshot::Sender<Response>>::new()));
    let next_rid = Arc::new(AtomicU64::new(0));

    let state = HttpState {
        requests: requests.clone(),
        next_rid,
        out_tx: out_tx.clone(),
        sid: sid.clone(),
    };

    let app = Router::new()
        .fallback(handle_any_request)
        .with_state(state);

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    // Spawn server task
    let server_task = tokio::spawn(async move {
        let serve_future = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });
        if let Err(e) = serve_future.await {
            tracing::error!("HTTP server serve error: {}", e);
        }
    });

    // Spawn control messages listener task
    let out_tx_clone = out_tx.clone();
    let sid_clone = sid.clone();
    let requests_clone = requests.clone();

    tokio::spawn(async move {
        let mut shutdown_tx = Some(shutdown_tx);
        while let Some(msg) = writer_rx.recv().await {
            match msg {
                ChildSend::Json(val) => {
                    if let Some(t) = val.get("type").and_then(|x| x.as_str()) {
                        if t == "message" {
                            if let Some(payload_val) = val.get("payload") {
                                let payload = match payload_val {
                                    Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(Value::Null),
                                    other => other.clone(),
                                };
                                if let Some(pt) = payload.get("type").and_then(|x| x.as_str()) {
                                    if pt == "response" {
                                        if let Some(rid) = payload.get("rid").and_then(|x| x.as_u64()) {
                                            let status = payload.get("status").and_then(|x| x.as_u64()).unwrap_or(200) as u16;
                                            let body = payload.get("body").and_then(|x| x.as_str()).unwrap_or("");
                                            
                                            let mut builder = Response::builder()
                                                .status(StatusCode::from_u16(status).unwrap_or(StatusCode::OK));
                                            
                                            if let Some(headers_obj) = payload.get("headers").and_then(|x| x.as_object()) {
                                                for (k, v) in headers_obj {
                                                    if let Some(v_str) = v.as_str() {
                                                        if let (Ok(h_name), Ok(h_val)) = (
                                                            HeaderName::from_bytes(k.as_bytes()),
                                                            HeaderValue::from_str(v_str)
                                                        ) {
                                                            builder = builder.header(h_name, h_val);
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            let response = builder.body(Body::from(body.to_string()))
                                                .unwrap_or_else(|_| {
                                                    Response::new(Body::from("Internal response builder error"))
                                                });
                                            
                                            let mut reqs = requests_clone.lock().await;
                                            if let Some(tx) = reqs.remove(&rid) {
                                                let _ = tx.send(response);
                                            }
                                        }
                                    }
                                }
                            }
                        } else if t == "close" {
                            break;
                        }
                    }
                }
            }
        }

        if let Some(tx) = shutdown_tx.take() {
            let _ = tx.send(());
        }
        let _ = server_task.await;

        // Cleanup
        let mut map = servers.lock().await;
        if map.remove(&sid_clone).is_some() {
            let resp = serde_json::json!({
                "type": "server_closed",
                "sid": sid_clone
            });
            let _ = out_tx_clone.send(Message::Text(resp.to_string().into()));
        }
    });

    Ok(bound_port)
}

async fn handle_any_request(
    State(state): State<HttpState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let rid = state.next_rid.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = oneshot::channel::<Response>();

    state.requests.lock().await.insert(rid, tx);

    let mut headers_map = serde_json::Map::new();
    for (name, value) in headers.iter() {
        if let Ok(val_str) = value.to_str() {
            headers_map.insert(name.to_string(), Value::String(val_str.to_string()));
        }
    }

    let body_str = String::from_utf8_lossy(&body).into_owned();

    let payload = serde_json::json!({
        "type": "request",
        "rid": rid,
        "method": method.to_string(),
        "url": uri.to_string(),
        "headers": headers_map,
        "body": body_str
    });

    let forward = serde_json::json!({
        "type": "server_message",
        "sid": state.sid,
        "payload": payload
    });

    if let Err(e) = state.out_tx.send(Message::Text(forward.to_string().into())) {
        tracing::error!("Failed to send HTTP request to host: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Host WebSocket connection lost").into_response();
    }

    match tokio::time::timeout(Duration::from_secs(60), rx).await {
        Ok(Ok(response)) => response,
        Ok(Err(_)) => {
            (StatusCode::INTERNAL_SERVER_ERROR, "HTTP request sender dropped").into_response()
        }
        Err(_) => {
            state.requests.lock().await.remove(&rid);
            (StatusCode::GATEWAY_TIMEOUT, "Gateway Timeout").into_response()
        }
    }
}

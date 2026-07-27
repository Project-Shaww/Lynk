use crate::servers::{ChildSend, ServersMap};

use axum::{
    extract::{State, ws::{Message, WebSocket, WebSocketUpgrade}},
    response::IntoResponse,
    Router,
};
use base64::Engine;
use futures::{sink::SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};

#[derive(Clone)]
struct WsState {
    clients: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Message>>>>,
    out_tx: mpsc::UnboundedSender<Message>,
    sid: String,
}

pub async fn spawn_ws_server(
    sid: String,
    config: Value,
    servers: ServersMap,
    out_tx: mpsc::UnboundedSender<Message>,
    mut writer_rx: mpsc::UnboundedReceiver<ChildSend>,
) -> Result<u16, String> {
    let port = config.get("port").and_then(|p| p.as_u64()).unwrap_or(0) as u16;
    
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Failed to bind TCP listener for integrated WS: {}", e))?;
    
    let bound_port = listener.local_addr()
        .map_err(|e| format!("Failed to get local addr for integrated WS: {}", e))?
        .port();

    let clients = Arc::new(Mutex::new(HashMap::<String, mpsc::UnboundedSender<Message>>::new()));
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    let state = WsState {
        clients: clients.clone(),
        out_tx: out_tx.clone(),
        sid: sid.clone(),
    };

    let app = Router::new()
        .fallback(ws_route_handler)
        .with_state(state);

    let server_task = tokio::spawn(async move {
        let serve_future = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });
        if let Err(e) = serve_future.await {
            tracing::error!("WS server serve error: {}", e);
        }
    });

    let out_tx_clone = out_tx.clone();
    let sid_clone = sid.clone();
    let clients_clone = clients.clone();

    // Command listener loop
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
                                
                                let send_val = payload.get("payload").and_then(|x| x.as_str()).unwrap_or("");
                                let msg_to_send = Message::Text(send_val.to_string().into());
                                
                                if let Some(pt) = payload.get("type").and_then(|x| x.as_str()) {
                                    if pt == "message" {
                                        if let Some(cid) = payload.get("cid").and_then(|x| x.as_str()) {
                                            let guard = clients_clone.lock().await;
                                            if let Some(c_tx) = guard.get(cid) {
                                                let _ = c_tx.send(msg_to_send);
                                            }
                                        }
                                    } else if pt == "broadcast" {
                                        let guard = clients_clone.lock().await;
                                        for c_tx in guard.values() {
                                            let _ = c_tx.send(msg_to_send.clone());
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

        // Close all clients
        {
            let mut guard = clients_clone.lock().await;
            for c_tx in guard.values() {
                let _ = c_tx.send(Message::Close(None));
            }
            guard.clear();
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

async fn ws_route_handler(
    State(state): State<WsState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: WsState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let cid = uuid::Uuid::new_v4().to_string()[..8].to_string();

    let (c_tx, mut c_rx) = mpsc::unbounded_channel::<Message>();
    
    // Register client
    {
        state.clients.lock().await.insert(cid.clone(), c_tx);
    }

    // Send connect event to host
    let connect_payload = serde_json::json!({
        "type": "connect",
        "cid": cid
    });
    let forward_connect = serde_json::json!({
        "type": "server_message",
        "sid": state.sid,
        "payload": connect_payload
    });
    let _ = state.out_tx.send(Message::Text(forward_connect.to_string().into()));

    // Task to send messages from channel to websocket client
    let cid_clone = cid.clone();
    let ws_send_task = tokio::spawn(async move {
        while let Some(msg) = c_rx.recv().await {
            if let Message::Close(_) = msg {
                let _ = ws_sender.send(msg).await;
                break;
            }
            if let Err(e) = ws_sender.send(msg).await {
                tracing::error!("Error sending to WS client {}: {}", cid_clone, e);
                break;
            }
        }
    });

    // Receive messages from websocket client
    let state_clone = state.clone();
    let cid_recv = cid.clone();
    let ws_recv_task = tokio::spawn(async move {
        use futures::StreamExt;
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    let msg_payload = serde_json::json!({
                        "type": "message",
                        "cid": cid_recv.clone(),
                        "payload": text.to_string()
                    });
                    let forward = serde_json::json!({
                        "type": "server_message",
                        "sid": state_clone.sid,
                        "payload": msg_payload
                    });
                    let _ = state_clone.out_tx.send(Message::Text(forward.to_string().into()));
                }
                Message::Binary(bytes) => {
                    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    let msg_payload = serde_json::json!({
                        "type": "message",
                        "cid": cid_recv.clone(),
                        "payload": encoded,
                        "is_bytes": true
                    });
                    let forward = serde_json::json!({
                        "type": "server_message",
                        "sid": state_clone.sid,
                        "payload": msg_payload
                    });
                    let _ = state_clone.out_tx.send(Message::Text(forward.to_string().into()));
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Wait for receive loop or send loop to finish
    tokio::select! {
        _ = ws_send_task => {}
        _ = ws_recv_task => {}
    }

    // Client disconnected, cleanup
    {
        state.clients.lock().await.remove(&cid);
    }

    let disconnect_payload = serde_json::json!({
        "type": "disconnect",
        "cid": cid
    });
    let forward_disconnect = serde_json::json!({
        "type": "server_message",
        "sid": state.sid,
        "payload": disconnect_payload
    });
    let _ = state.out_tx.send(Message::Text(forward_disconnect.to_string().into()));
}

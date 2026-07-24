use crate::addons::AddonDefinition;
use crate::servers::{spawn_server, ServersMap, ChildSend};
use crate::app::AppState;

use axum::{extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State}, response::IntoResponse};
use futures::{sink::SinkExt, stream::StreamExt};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::mpsc;
use uuid::Uuid;
use tracing::{info, error};
use base64::Engine;

pub async fn ws_handler(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    let state = state.clone();
    ws.on_upgrade(move |socket| handle_socket_with_state(socket, state))
}

async fn handle_socket_with_state(socket: WebSocket, state: AppState) {
    handle_socket(socket, state).await
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Message>();

    tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if let Err(e) = sender.send(msg).await {
                error!("error sending ws message: {}", e);
                break;
            }
        }
    });

    let id = Uuid::new_v4().to_string();
    let welcome = serde_json::json!({"type":"welcome","id": id});
    let _ = out_tx.send(Message::Text(welcome.to_string().into()));

    let servers = state.servers.clone();

    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(t) => {
                if let Ok(v) = serde_json::from_str::<Value>(&t) {
                    handle_host_message(v, &id, servers.clone(), out_tx.clone(), state.addons.clone()).await;
                }
            }
            Message::Binary(b) => {
                let encoded = base64::engine::general_purpose::STANDARD.encode(&b);
                let err = serde_json::json!({"type":"error","message":"binary_not_supported","detail":"Binary payload received; encode as base64 in JSON payload"});
                let _ = out_tx.send(Message::Text(err.to_string().into()));
                info!("received binary message (base64_len={})", encoded.len());
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    {
        let map = servers.lock().await;
        let mut senders = Vec::new();
        for (_, inst) in map.iter() {
            if inst.host_id == id {
                senders.push(inst.writer.clone());
            }
        }
        for s in senders {
            let _ = s.send(ChildSend::Json(serde_json::json!({"type":"close"})));
        }
    }

    info!("host {} disconnected", id);
}

async fn handle_host_message(v: Value, host_id: &str, servers: ServersMap, out_tx: mpsc::UnboundedSender<Message>, addons: Arc<HashMap<String, AddonDefinition>>) {
    let obj = match v.as_object() {
        Some(o) => o,
        None => return,
    };
    let msg_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let id_field = obj.get("id").and_then(|s| s.as_str()).unwrap_or("");
    let pid = obj.get("pid").and_then(|p| p.as_u64()).unwrap_or(0) as u32;

    if id_field != host_id {
        let resp = serde_json::json!({"type":"error","error":"invalid_id","message":"id mismatch","pid": pid});
        let _ = out_tx.send(Message::Text(resp.to_string().into()));
        return;
    }

    match msg_type {
        "ping" => {
            let resp = serde_json::json!({"type":"pong","pid": pid});
            let _ = out_tx.send(Message::Text(resp.to_string().into()));
        }
        "create_server" => {
            let protocol = obj.get("protocol").and_then(|p| p.as_str()).unwrap_or("");
            let config = obj.get("config").cloned().unwrap_or(Value::Null);
            if protocol.is_empty() {
                let resp = serde_json::json!({"type":"error","error":"create_server:protocol","message":"Invalid protocol","pid": pid});
                let _ = out_tx.send(Message::Text(resp.to_string().into()));
                return;
            }

            match spawn_server(protocol.to_string(), config, &host_id, servers.clone(), out_tx.clone(), addons.clone()).await {
                Ok((sid, port, _child_pid)) => {
                    let resp = serde_json::json!({"type":"server_created","pid": pid, "sid": sid, "port": port, "protocol": protocol, "config": obj.get("config").cloned().unwrap_or(Value::Null)});
                    let _ = out_tx.send(Message::Text(resp.to_string().into()));
                }
                Err(err_msg) => {
                    let resp = serde_json::json!({"type":"error","error":"create_server:internal","message":"Error while creating server","error_message": err_msg, "pid": pid});
                    let _ = out_tx.send(Message::Text(resp.to_string().into()));
                }
            }
        }
        "close_server" => {
            if let Some(sid) = obj.get("sid").and_then(|s| s.as_str()) {
                let mut map = servers.lock().await;
                if let Some(inst) = map.remove(sid) {
                    let _ = inst.writer.send(ChildSend::Json(serde_json::json!({"type":"close"})));
                    let resp = serde_json::json!({"type":"server_closed","pid": pid, "sid": sid});
                    let _ = out_tx.send(Message::Text(resp.to_string().into()));
                } else {
                    let resp = serde_json::json!({"type":"error","error":"close_server:not_found","message":"Server not found","pid": pid});
                    let _ = out_tx.send(Message::Text(resp.to_string().into()));
                }
            } else {
                let resp = serde_json::json!({"type":"error","error":"close_server:not_found","message":"Server not found","pid": pid});
                let _ = out_tx.send(Message::Text(resp.to_string().into()));
            }
        }
        "message_server" => {
            if let Some(sid) = obj.get("sid").and_then(|s| s.as_str()) {
                let payload = obj.get("payload").cloned().unwrap_or(Value::Null);
                let map = servers.lock().await;
                if let Some(inst) = map.get(sid) {
                    let mut child_payload = serde_json::json!({"type": "message", "payload": null});
                    let mut is_bytes = false;
                    let value = if payload.is_string() {
                        payload.clone()
                    } else if payload.is_object() {
                        if let Some(bytes_val) = payload.get("bytes") {
                            if let Some(arr) = bytes_val.as_array() {
                                let mut v: Vec<u8> = Vec::with_capacity(arr.len());
                                for item in arr {
                                    if let Some(n) = item.as_u64() {
                                        v.push(n as u8);
                                    }
                                }
                                is_bytes = true;
                                Value::String(base64::engine::general_purpose::STANDARD.encode(&v))
                            } else {
                                match serde_json::to_string(&payload) {
                                    Ok(s) => Value::String(s),
                                    Err(_) => Value::Null,
                                }
                            }
                        } else {
                            payload.clone()
                        }
                    } else {
                        payload.clone()
                    };
                    child_payload["payload"] = value;
                    if is_bytes {
                        child_payload["is_bytes"] = Value::Bool(true);
                    }
                    let _ = inst.writer.send(ChildSend::Json(child_payload));
                    let resp = serde_json::json!({"type":"message_server_sent","pid": pid, "sid": sid});
                    let _ = out_tx.send(Message::Text(resp.to_string().into()));
                } else {
                    let resp = serde_json::json!({"type":"error","error":"message_server:not_found","message":"Server not found","pid": pid});
                    let _ = out_tx.send(Message::Text(resp.to_string().into()));
                }
            } else {
                let resp = serde_json::json!({"type":"error","error":"message_server:not_found","message":"Server not found","pid": pid});
                let _ = out_tx.send(Message::Text(resp.to_string().into()));
            }
        }

        "update_server" => {
            if let (Some(sid), Some(config_val)) = (obj.get("sid").and_then(|s| s.as_str()), obj.get("config")) {
                let mut map = servers.lock().await;
                if let Some(inst) = map.get_mut(sid) {
                    inst.config = config_val.clone();
                    let resp = serde_json::json!({"type":"server_updated","pid": pid, "sid": sid});
                    let _ = out_tx.send(Message::Text(resp.to_string().into()));
                } else {
                    let resp = serde_json::json!({"type":"error","error":"update_server:not_found","message":"Server not found","pid": pid});
                    let _ = out_tx.send(Message::Text(resp.to_string().into()));
                }
            } else {
                let resp = serde_json::json!({"type":"error","error":"update_server:invalid_request","message":"Invalid update request","pid": pid});
                let _ = out_tx.send(Message::Text(resp.to_string().into()));
            }
        }

        _ => {
            let resp = serde_json::json!({"type":"error","error":"unknown_command","message":"Unknown command","pid": pid});
            let _ = out_tx.send(Message::Text(resp.to_string().into()));
        }
    }
}

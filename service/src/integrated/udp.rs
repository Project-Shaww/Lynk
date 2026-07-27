use crate::servers::{ChildSend, ServersMap};

use axum::extract::ws::Message;
use base64::Engine;
use serde_json::Value;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};

pub async fn spawn_udp_server(
    sid: String,
    config: Value,
    servers: ServersMap,
    out_tx: mpsc::UnboundedSender<Message>,
    mut writer_rx: mpsc::UnboundedReceiver<ChildSend>,
) -> Result<u16, String> {
    let port = config.get("port").and_then(|p| p.as_u64()).unwrap_or(0) as u16;

    let socket = tokio::net::UdpSocket::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Failed to bind UDP socket: {}", e))?;

    let bound_port = socket.local_addr()
        .map_err(|e| format!("Failed to get UDP local port: {}", e))?
        .port();

    let socket = Arc::new(socket);

    let client_addrs = Arc::new(Mutex::new(HashMap::<String, SocketAddr>::new()));
    let seen_addrs = Arc::new(Mutex::new(HashMap::<SocketAddr, String>::new()));
    
    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();

    let socket_recv = socket.clone();
    let client_addrs_clone = client_addrs.clone();
    let seen_addrs_clone = seen_addrs.clone();
    let out_tx_clone = out_tx.clone();
    let sid_clone = sid.clone();

    // Recv task
    let recv_task = tokio::spawn(async move {
        let mut buf = [0u8; 65535];
        loop {
            tokio::select! {
                res = socket_recv.recv_from(&mut buf) => {
                    match res {
                        Ok((n, addr)) => {
                            let mut seen_guard = seen_addrs_clone.lock().await;
                            let cid = match seen_guard.get(&addr) {
                                Some(existing_cid) => existing_cid.clone(),
                                None => {
                                    let new_cid = uuid::Uuid::new_v4().to_string()[..8].to_string();
                                    seen_guard.insert(addr, new_cid.clone());
                                    client_addrs_clone.lock().await.insert(new_cid.clone(), addr);

                                    // Send connect event
                                    let connect_payload = serde_json::json!({
                                        "type": "connect",
                                        "cid": new_cid
                                    });
                                    let forward_connect = serde_json::json!({
                                        "type": "server_message",
                                        "sid": sid_clone.clone(),
                                        "payload": connect_payload
                                    });
                                    let _ = out_tx_clone.send(Message::Text(forward_connect.to_string().into()));
                                    new_cid
                                }
                            };

                            let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                            let msg_payload = serde_json::json!({
                                "type": "message",
                                "cid": cid,
                                "payload": text
                            });
                            let forward = serde_json::json!({
                                "type": "server_message",
                                "sid": sid_clone.clone(),
                                "payload": msg_payload
                            });
                            let _ = out_tx_clone.send(Message::Text(forward.to_string().into()));
                        }
                        Err(e) => {
                            tracing::error!("UDP recv_from error: {}", e);
                            break;
                        }
                    }
                }
                _ = &mut cancel_rx => {
                    break;
                }
            }
        }
    });

    let socket_send = socket.clone();
    let client_addrs_send = client_addrs.clone();
    let seen_addrs_send = seen_addrs.clone();

    // Command listener task
    tokio::spawn(async move {
        let mut cancel_tx = Some(cancel_tx);
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

                                let send_str = payload.get("payload").and_then(|x| x.as_str()).unwrap_or("");
                                let is_bytes = payload.get("is_bytes").and_then(|b| b.as_bool()).unwrap_or(false);

                                let bytes_to_send = if is_bytes {
                                    base64::engine::general_purpose::STANDARD.decode(send_str).unwrap_or_default()
                                } else {
                                    send_str.as_bytes().to_vec()
                                };

                                if let Some(pt) = payload.get("type").and_then(|x| x.as_str()) {
                                    if pt == "message" {
                                        if let Some(cid) = payload.get("cid").and_then(|x| x.as_str()) {
                                            let guard = client_addrs_send.lock().await;
                                            if let Some(addr) = guard.get(cid) {
                                                if let Err(e) = socket_send.send_to(&bytes_to_send, addr).await {
                                                    tracing::error!("UDP send_to error for {}: {}", cid, e);
                                                }
                                            }
                                        }
                                        if let Some(addrs) = payload.get("addrs") {
                                            let addrs = addrs.as_array().unwrap();
                                            for addr in addrs {
                                                if let Some(addr) = client_addrs_send.lock().await.get(&addr.as_str().unwrap().to_string()) {
                                                    if let Err(e) = socket_send.send_to(&bytes_to_send, addr).await {
                                                        tracing::error!("UDP send_to error for {}: {}", addr, e);
                                                    }
                                                }
                                            }
                                        }
                                    } else if pt == "broadcast" {
                                        let guard = seen_addrs_send.lock().await;
                                        for addr in guard.keys() {
                                            if let Err(e) = socket_send.send_to(&bytes_to_send, addr).await {
                                                tracing::error!("UDP send_to broadcast error for {}: {}", addr, e);
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

        if let Some(tx) = cancel_tx.take() {
            let _ = tx.send(());
        }
        let _ = recv_task.await;

        // Cleanup
        let mut map = servers.lock().await;
        if map.remove(&sid).is_some() {
            let resp = serde_json::json!({
                "type": "server_closed",
                "sid": sid
            });
            let _ = out_tx.send(Message::Text(resp.to_string().into()));
        }
    });

    Ok(bound_port)
}

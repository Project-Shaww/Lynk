use crate::servers::{ChildSend, ServersMap};

use axum::extract::ws::Message;
use base64::Engine;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};

pub async fn spawn_tcp_server(
    sid: String,
    config: Value,
    servers: ServersMap,
    out_tx: mpsc::UnboundedSender<Message>,
    mut writer_rx: mpsc::UnboundedReceiver<ChildSend>,
) -> Result<u16, String> {
    let port = config.get("port").and_then(|p| p.as_u64()).unwrap_or(0) as u16;

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Failed to bind TCP listener: {}", e))?;

    let bound_port = listener.local_addr()
        .map_err(|e| format!("Failed to get TCP local port: {}", e))?
        .port();

    let clients = Arc::new(Mutex::new(HashMap::<String, mpsc::UnboundedSender<Vec<u8>>>::new()));
    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();

    let sid_clone = sid.clone();
    let clients_clone = clients.clone();
    let out_tx_clone = out_tx.clone();

    // Connection acceptor loop
    let server_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                res = listener.accept() => {
                    match res {
                        Ok((stream, _addr)) => {
                            let cid = uuid::Uuid::new_v4().to_string()[..8].to_string();
                            let clients = clients_clone.clone();
                            let out_tx = out_tx_clone.clone();
                            let sid = sid_clone.clone();
                            tokio::spawn(handle_tcp_client(stream, cid, sid, clients, out_tx));
                        }
                        Err(e) => {
                            tracing::error!("TCP accept error: {}", e);
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
                                            let guard = clients.lock().await;
                                            if let Some(c_tx) = guard.get(cid) {
                                                let _ = c_tx.send(bytes_to_send);
                                            }
                                        }
                                    } else if pt == "broadcast" {
                                        let guard = clients.lock().await;
                                        for c_tx in guard.values() {
                                            let _ = c_tx.send(bytes_to_send.clone());
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

        // Close all clients by clearing map and letting streams finish
        {
            let mut guard = clients.lock().await;
            guard.clear();
        }

        if let Some(tx) = cancel_tx.take() {
            let _ = tx.send(());
        }
        let _ = server_task.await;

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

async fn handle_tcp_client(
    stream: tokio::net::TcpStream,
    cid: String,
    sid: String,
    clients: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Vec<u8>>>>>,
    out_tx: mpsc::UnboundedSender<Message>,
) {
    let (c_tx, mut c_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    {
        clients.lock().await.insert(cid.clone(), c_tx);
    }

    // Send connect event
    let connect_payload = serde_json::json!({
        "type": "connect",
        "cid": cid
    });
    let forward_connect = serde_json::json!({
        "type": "server_message",
        "sid": sid,
        "payload": connect_payload
    });
    let _ = out_tx.send(Message::Text(forward_connect.to_string().into()));

    let (mut reader, mut writer) = tokio::io::split(stream);

    // Send task (writes to TCP socket)
    let cid_clone = cid.clone();
    let send_task = tokio::spawn(async move {
        use tokio::io::AsyncWriteExt;
        while let Some(bytes) = c_rx.recv().await {
            if let Err(e) = writer.write_all(&bytes).await {
                tracing::error!("Error writing to TCP client {}: {}", cid_clone, e);
                break;
            }
        }
    });

    // Recv task (reads from TCP socket and forwards to out_tx)
    let cid_recv = cid.clone();
    let sid_recv = sid.clone();
    let out_tx_recv = out_tx.clone();
    let recv_task = tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let msg_payload = serde_json::json!({
                        "type": "message",
                        "cid": cid_recv.clone(),
                        "payload": text
                    });
                    let forward = serde_json::json!({
                        "type": "server_message",
                        "sid": sid_recv.clone(),
                        "payload": msg_payload
                    });
                    let _ = out_tx_recv.send(Message::Text(forward.to_string().into()));
                }
                Err(e) => {
                    tracing::error!("Error reading from TCP client {}: {}", cid_recv, e);
                    break;
                }
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    {
        clients.lock().await.remove(&cid);
    }

    // Send disconnect event
    let disconnect_payload = serde_json::json!({
        "type": "disconnect",
        "cid": cid
    });
    let forward_disconnect = serde_json::json!({
        "type": "server_message",
        "sid": sid,
        "payload": disconnect_payload
    });
    let _ = out_tx.send(Message::Text(forward_disconnect.to_string().into()));
}

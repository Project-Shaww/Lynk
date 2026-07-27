pub mod http;
pub mod ws;
pub mod tcp;
pub mod udp;

use crate::servers::{ChildSend, ServerInstance, ServersMap};

use axum::extract::ws::Message;
use serde_json::Value;
use tokio::sync::mpsc;

pub async fn spawn_integrated_server(
    protocol: String,
    config: Value,
    host_id: &str,
    servers: ServersMap,
    out_tx: mpsc::UnboundedSender<Message>,
) -> Result<(String, u16, u32), String> {
    let sid = uuid::Uuid::new_v4().to_string();
    let (writer_tx, writer_rx) = mpsc::unbounded_channel::<ChildSend>();

    let port = match protocol.as_str() {
        "http" => {
            http::spawn_http_server(sid.clone(), config.clone(), servers.clone(), out_tx.clone(), writer_rx).await?
        }
        "ws" => {
            ws::spawn_ws_server(sid.clone(), config.clone(), servers.clone(), out_tx.clone(), writer_rx).await?
        }
        "tcp" => {
            tcp::spawn_tcp_server(sid.clone(), config.clone(), servers.clone(), out_tx.clone(), writer_rx).await?
        }
        "udp" => {
            udp::spawn_udp_server(sid.clone(), config.clone(), servers.clone(), out_tx.clone(), writer_rx).await?
        }
        _ => return Err(format!("Unsupported integrated protocol: {}", protocol)),
    };

    let pid = std::process::id();
    let instance = ServerInstance {
        host_id: String::from(host_id),
        _sid: sid.clone(),
        _pid: pid,
        writer: writer_tx,
        protocol: protocol.clone(),
        port,
        config: config.clone(),
    };

    {
        let mut map = servers.lock().await;
        map.insert(sid.clone(), instance);
    }

    Ok((sid, port, pid))
}

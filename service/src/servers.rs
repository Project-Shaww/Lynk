use crate::addons::CompiledManifest;
use crate::app::AppState;

use axum::{extract::{ws::Message, State}, response::IntoResponse, Json};
use serde_json::{Value, Map};
use std::{collections::HashMap, sync::Arc};
use tokio::{io::{AsyncBufReadExt, BufReader, AsyncWriteExt}, process::Command, sync::{mpsc, Mutex, oneshot}, time};
use std::time::Duration;
use uuid::Uuid;
use tracing::{info, error};

pub type ServersMap = Arc<Mutex<HashMap<String, ServerInstance>>>;

pub enum ChildSend {
    Json(Value),
}

#[derive(Debug, Clone)]
pub struct ServerInstance {
    pub host_id: String,
    pub _sid: String,
    pub _pid: u32,
    pub writer: mpsc::UnboundedSender<ChildSend>,
    pub protocol: String,
    pub port: u16,
    pub config: Value,
}

fn resolve_server_command(protocol: &str, manifest: &CompiledManifest) -> Result<(String, Vec<String>, Option<String>), String> {
    let raw_command = manifest
        .servers
        .get(protocol)
        .cloned()
        .ok_or_else(|| format!("no server entry found for protocol {}", protocol))?;

    let parts: Vec<String> = raw_command.split(' ').map(|s| s.to_string()).collect();
    let program = parts[0].clone();
    if parts.len() > 1 {
        let args = parts[1..].to_vec();
        return Ok((program, args, None));
    }

    Ok((program, Vec::new(), None))
}

pub async fn spawn_server(protocol: String, config: Value, host_id: &str, servers: ServersMap, out_tx: mpsc::UnboundedSender<Message>, manifest: Arc<Mutex<CompiledManifest>>) -> Result<(String, u16, u32), String> {
    if matches!(protocol.as_str(), "http" | "ws" | "tcp" | "udp") {
        return crate::integrated::spawn_integrated_server(protocol, config, host_id, servers, out_tx).await;
    }

    let manifest = manifest.lock().await;
    let (program, args_extra, cwd) = resolve_server_command(&protocol, &manifest)?;

    let mut command = Command::new(program);
    command.args(args_extra);
    command.arg("--protocol").arg(&protocol);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    command.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit());

    let child = command.spawn().map_err(|e| format!("failed to spawn child: {}", e))?;
    let pid = child.id().unwrap_or(0);
    let child = Arc::new(Mutex::new(child));

    let stdin = {
        let mut child_guard = child.lock().await;
        child_guard.stdin.take().ok_or("child stdin not available")?
    };
    let mut stdin = tokio::io::BufWriter::new(stdin);
    let (writer_tx, mut writer_rx) = mpsc::unbounded_channel::<ChildSend>();

    tokio::spawn(async move {
        while let Some(ChildSend::Json(v)) = writer_rx.recv().await {
            if let Ok(s) = serde_json::to_string(&v) {
                if let Err(e) = stdin.write_all(s.as_bytes()).await {
                    error!("error writing json to child stdin: {}", e);
                    break;
                }
                if let Err(e) = stdin.write_all(b"\n").await {
                    error!("error writing newline to child stdin: {}", e);
                    break;
                }
            }
            if let Err(e) = stdin.flush().await {
                error!("error flushing child stdin: {}", e);
                break;
            }
        }
    });

    let stdout = {
        let mut child_guard = child.lock().await;
        child_guard.stdout.take().ok_or("child stdout not available")?
    };
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    let (ready_tx, ready_rx) = oneshot::channel::<u16>();
    let mut ready_tx = Some(ready_tx);

    let out_tx_clone = out_tx.clone();
    let sid = Uuid::new_v4().to_string();
    let sid_clone = sid.clone();

    tokio::spawn(async move {
        while let Ok(Some(line)) = lines.next_line().await {
            match serde_json::from_str::<Value>(&line) {
                Ok(val) => {
                    if let Some(t) = val.get("type").and_then(|x| x.as_str()) {
                        if t == "ready" {
                            if let Some(p) = val.get("port").and_then(|x| x.as_u64()) {
                                let port_u16 = p as u16;
                                if let Some(tx) = ready_tx.take() {
                                    let _ = tx.send(port_u16);
                                }
                                info!("child {} ready on port {}", sid_clone, port_u16);
                            }
                        }
                    }

                    let forward = serde_json::json!({"type":"server_message","sid": sid_clone, "payload": val});
                    let _ = out_tx_clone.send(Message::Text(forward.to_string().into()));
                }
                Err(e) => {
                    error!("failed parse child json: {} -- line: {}", e, line);
                }
            }
        }
        info!("child stdout reader exiting for sid {}", sid_clone);
    });

    let out_tx_process = out_tx.clone();
    let servers_clone = servers.clone();
    let sid_clone_process = sid.clone();
    let child_clone = child.clone();
    let child_wait = async move {
        let mut child_guard = child_clone.lock().await;
        let status = child_guard.wait().await;
        let exited = match status {
            Ok(s) => s,
            Err(e) => {
                error!("failed waiting for child {}: {}", sid_clone_process, e);
                let mut map = servers_clone.lock().await;
                if map.remove(&sid_clone_process).is_some() {
                    let resp = serde_json::json!({"type":"server_closed","sid": sid_clone_process, "error": "child_process_failed", "message": e.to_string()});
                    let _ = out_tx_process.send(Message::Text(resp.to_string().into()));
                }
                return;
            }
        };

        if !exited.success() {
            error!("child {} exited with status {}", sid_clone_process, exited);
            let mut map = servers_clone.lock().await;
            if map.remove(&sid_clone_process).is_some() {
                let resp = serde_json::json!({"type":"server_closed","sid": sid_clone_process, "error": "child_exit", "message": format!("exit status: {}", exited)});
                let _ = out_tx_process.send(Message::Text(resp.to_string().into()));
            }
        } else {
            let mut map = servers_clone.lock().await;
            map.remove(&sid_clone_process);
        }
    };

    let mut port: u16 = 0;
    match time::timeout(Duration::from_secs(5), ready_rx).await {
        Ok(Ok(p)) => {
            port = p;
        }
        Ok(Err(_)) => {
            error!("ready oneshot canceled for child {}", sid);
        }
        Err(_) => {
            error!("timeout waiting for child ready for sid {}", sid);
        }
    }

    if port == 0 {
        let mut child_guard = child.lock().await;
        if let Err(e) = child_guard.kill().await {
            error!("failed to kill child {} after ready failure: {}", sid, e);
        }
        return Err("server failed to report ready port".to_string());
    }

    tokio::spawn(child_wait);

    let instance = ServerInstance { host_id: String::from(host_id), _sid: sid.clone(), _pid: pid, writer: writer_tx.clone(), protocol: protocol.clone(), port: port.clone(), config: config.clone() };
    {
        let mut map = servers.lock().await;
        map.insert(sid.clone(), instance);
    }

    Ok((sid, port, pid))
}

pub async fn list_servers(State(state): State<AppState>) -> impl IntoResponse {
    let map = state.servers.lock().await;
    let mut servers = Vec::with_capacity(map.len());

    for (sid, inst) in map.iter() {
        let mut metadata = match inst.config.clone() {
            Value::Object(o) => Value::Object(o),
            other => {
                let mut obj = Map::new();
                obj.insert("config".into(), other);
                Value::Object(obj)
            }
        };

        if let Value::Object(ref mut obj) = metadata {
            obj.insert("port".into(), Value::Number(serde_json::Number::from(inst.port)));
            obj.insert("protocol".into(), Value::String(inst.protocol.clone()));
        }

        servers.push(serde_json::json!({
            "id": sid,
            "metadata": metadata,
        }));
    }

    Json(servers)
}
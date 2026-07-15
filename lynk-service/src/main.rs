use axum::{extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State}, response::IntoResponse, routing::get, Json, Router};
use futures::{sink::SinkExt, stream::StreamExt};
use serde_json::{Value, Map};
use shell_words;
use std::{collections::HashMap, env, sync::Arc};
use tokio::{io::{AsyncBufReadExt, BufReader, AsyncWriteExt}, process::Command, sync::{mpsc, Mutex, oneshot}, time};
use std::time::Duration;
use uuid::Uuid;
use tracing::{info, error};
use base64::Engine;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt::init();

    let mut servers_cmds_map: HashMap<String, String> = HashMap::new();
    if let Ok(s) = std::fs::read_to_string("servers.json") {
        if let Ok(json_map) = serde_json::from_str::<HashMap<String, String>>(&s) {
            servers_cmds_map = json_map;
            info!("loaded servers.json with {} entries", servers_cmds_map.len());
        }
    }

    let app_state = AppState { servers_cmds: Arc::new(servers_cmds_map), servers: Arc::new(Mutex::new(HashMap::new())) };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/socket", get(ws_handler))
        .route("/api/servers", get(list_servers))
        .with_state(app_state)
        .layer(cors);

    let addr = "0.0.0.0:51738";
    info!(%addr, "Starting Lynk Rust service");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

#[derive(Clone)]
struct AppState {
    servers_cmds: Arc<HashMap<String, String>>,
    servers: ServersMap,
}

type ServersMap = Arc<Mutex<HashMap<String, ServerInstance>>>;

enum ChildSend {
    Json(Value),
}

struct ServerInstance {
    host_id: String,
    _sid: String,
    _pid: u32,
    writer: mpsc::UnboundedSender<ChildSend>,
    protocol: String,
    port: u16,
    config: Value,
}

async fn ws_handler(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
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
                    handle_host_message(v, &id, servers.clone(), out_tx.clone(), state.servers_cmds.clone()).await;
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

async fn handle_host_message(v: Value, host_id: &str, servers: ServersMap, out_tx: mpsc::UnboundedSender<Message>, servers_cmds: Arc<HashMap<String, String>>) {
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

            match spawn_server(protocol.to_string(), config, &host_id, servers.clone(), out_tx.clone(), servers_cmds.clone()).await {
                Ok((sid, port, _child_pid)) => {
                    let resp = serde_json::json!({"type":"server_created","pid": pid, "sid": sid, "port": port, "protocol": protocol});
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

async fn spawn_server(protocol: String, config: Value, host_id: &str, servers: ServersMap, out_tx: mpsc::UnboundedSender<Message>, servers_cmds: Arc<HashMap<String, String>>) -> Result<(String, u16, u32), String> {
    let mut cmd_opt: Option<String> = None;
    if let Some(c) = servers_cmds.get(&protocol) {
        cmd_opt = Some(c.clone());
    }
    if cmd_opt.is_none() {
        let key = format!("LYNK_SERVER_CMD_{}", protocol.to_uppercase());
        if let Ok(env_cmd) = env::var(&key) {
            cmd_opt = Some(env_cmd);
        }
    }
    let cmd = cmd_opt.ok_or_else(|| format!("server command not configured: set servers.json or env LYNK_SERVER_CMD_{}", protocol.to_uppercase()))?;

    let parts = match shell_words::split(&cmd) {
        Ok(p) if !p.is_empty() => p,
        _ => return Err(format!("invalid command configured: {}", cmd)),
    };

    let program = &parts[0];
    let args_extra = &parts[1..];

    let mut command = Command::new(program);
    command.args(args_extra);
    command.arg("--protocol").arg(&protocol);
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

async fn list_servers(State(state): State<AppState>) -> impl IntoResponse {
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

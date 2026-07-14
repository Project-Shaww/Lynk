Lynk Rust Service
=================

This is a minimal Axum-based service that implements the Lynk host-facing protocol over WebSocket
and delegates actual server implementations to external subprocesses.

Usage
-----

- Build: `cargo build --release`
- Run: `LYNK_SERVER_CMD_WS=./path/to/ws_server_binary cargo run --release`

Protocol for external servers
-----------------------------

External servers are standalone programs that communicate with this service over stdin/stdout
using newline-delimited JSON (JSON-lines). The service spawns the program and forwards host
commands to it. The expected messages from the child include:

- On start, announce readiness: `{ "type": "ready", "port": 12345, "pid": 4321 }`
- To send events to the host, the child can write any JSON value; the service will wrap it and
  forward as `{ "type": "server_message", "sid": "...", "payload": <child-value> }`.

Messages sent from the service to the child are JSON objects, for example:

- `{ "type": "message_server", "sid": "...", "payload": { ... } }`
- `{ "type": "close" }`

Binary payloads
---------------

Because the communication channel is JSON-lines, binary payloads should be encoded as base64
and included in the `payload` field with an additional hint if needed, for example:
`{"data":"<base64>","binary":true}`.

Environment
-----------

- `LYNK_SERVER_CMD_<PROTOCOL>`: command or executable for the given protocol. Example:
  `LYNK_SERVER_CMD_WS` for `protocol = "ws"`.

Notes & Improvements
--------------------

- The current implementation returns port `0` at creation time and forwards the child's `ready`
  message (with real port) to the host as a `server_message` payload. You may adapt the
  child to print the port early so the host sees it quickly.
- Consider using a length-delimited binary framing if you need to transfer raw bytes efficiently.
- You can add commands for installing or managing external servers in this service later.

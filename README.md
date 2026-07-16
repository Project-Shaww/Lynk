# Lynk: Local LAN Server Host & Discovery Framework

**Lynk** is an in-development framework designed to allow browser-based web applications to create, host, manage, and discover local LAN servers and services directly from the client side. By bridging web apps with a lightweight local background service, Lynk allows developers to build local-first peer-to-peer and hosted solutions (like real-time local games, chat platforms, or local tools) with standard web technologies.

---

## Key Concepts & Architecture

Lynk is divided into two primary layers:
1. **`lynk-service` (Backend Service)**: A local Rust daemon running on host's machine. It listens on port `51738` and is responsible for launching server processes (addons), monitoring their life cycles, and routing messages.
2. **`lynk-sdk` (Frontend SDK)**: A TypeScript/JavaScript library that a web application imports to connect to `lynk-service` over WebSockets, control server processes, listen for traffic, and discover other instances on the LAN.

```mermaid
graph TD
    subgraph Browser Application (Host)
        A[Lynk Web App] <-->|Import SDK| B[Lynk SDK Host Class]
    end

    subgraph Local Machine (Background Daemon)
        B <-->|WS on localhost:51738/socket| C[Lynk Rust Service]
        C <-->|stdin / stdout JSON-Lines| D[Spawned Addon Server Process]
    end

    subgraph Local Area Network (LAN)
        E[LAN Client App] <-->|Direct HTTP/WS Traffic| D
        E <-->|LAN Discovery GET /api/servers| C
    end
```

---

## Repository Structure

*   [lynk-service/](/lynk-service) — Rust background daemon built with Axum, Tokio, and Serde.
    *   [src/main.rs](/lynk-service/src/main.rs) — Core server initialization, routing, and HTTP/WebSocket endpoints.
    *   [src/servers.rs](/lynk-service/src/servers.rs) — Command resolution, server spawning, child process IO, and state management.
    *   [src/socket.rs](/lynk-service/src/socket.rs) — WebSocket request/message handler for the SDK.
    *   [app-data.json](/lynk-service/app-data.json) — System-wide configuration map for available runtimes and server protocols.
    *   [examples/](/lynk-service/examples) — Predefined Node.js server scripts for `http` and `ws` protocols.
*   [lynk-sdk/](/lynk-sdk) — TypeScript SDK for the web host and clients.
    *   [src/lib/host/host.ts](/lynk-sdk/src/lib/host/host.ts) — The primary control client for interfacing with the Rust service.
    *   [src/lib/server/protocols/](/lynk-sdk/src/lib/server/protocols) — Protocol abstractions wrapping HTTP and WebSocket connections.
    *   [src/lib/client/index.ts](/lynk-sdk/src/lib/client/index.ts) — Discovery utilities for finding running servers on the local network.
*   [examples/chat/](/lynk-sdk/examples/chat) — A complete proof-of-concept multi-user chat room application demonstrating LAN server hosting and discovery.

---

## Current Project Status

Although the project is in active development, the core messaging and server-spawning architecture is fully operational and ready for testing.

### Completed / Working Features
*   **Process Spawning & Handling**: `lynk-service` can run servers on dynamic ports.
*   **JSON-Lines Communication**: Zero-configuration stdin/stdout translation. The spawned child processes speak JSON-Lines, which the Rust backend safely proxies to the SDK over WebSockets.
*   **HTTP Protocol Server**: Create an HTTP server on a dynamic port and respond to incoming HTTP requests directly inside your browser application's JS/TS code.
*   **WebSocket Protocol Server**: Create a WebSocket server, accept client connections, track lifecycle events, send private payloads, and broadcast messages to all connected sockets.
*   **Discovery APIs**: Discover local web servers running on a specific IP using the built-in HTTP server registry.

### Features in Development (Roadmap)
*   **Addon Installation & Handling**: Automatically install, configure, and sand-box addon engines.
*   **App State & Configuration Management**: Manage persistent service configuration, local server profiles, and global state files.
*   **Automated LAN Discovery**: Multicast DNS (mDNS) or SSDP for automated, zero-configuration local network scanning (currently requires passing target IP addresses).
*   **Application GUI**: Desktop shell interface to toggle the service status, monitor active servers, and manage installed addons.
*   **SDK Browser-Native Implementation**: Update the SDK to be used as a package imported directly into the web application.
*   **And More...**

---

## Getting Started & Building for Testing

To run the project and test the existing functionality, follow these build and execution steps:

### 1. Build and Run the Rust Service
First, compile and run the backend daemon:
```bash
cd lynk-service
cargo run
```
By default, the service starts and binds to `0.0.0.0:51738`.

### 2. Compile the TypeScript SDK
Next, build the SDK library files (make sure you have Node.js and TypeScript installed):
```bash
cd lynk-sdk
npm install
npx -p typescript tsc ./src/index.ts -d --outDir ./dist/
```
This generates the JavaScript output along with declaration files (`.d.ts`) in the `lynk-sdk/dist` folder.

### 3. Test the Chat Example
To run the chat application:
1. Double-click or open [examples/chat/index.html](file:///c:/Users/doria/Documents/CurrentProjects/Lynk/examples/chat/index.html) in your browser.
2. Select **Host** to create a chat room. The SDK connects to `lynk-service` and launches the Node.js websocket child server dynamically.
3. Open another browser tab or have a colleague on the same network open the page, enter the Host's local IP address, and discover/connect to the room.

The Chat Example needs to import the SDK package. This is not done in the current version. In the near future, the SDK will be used as a package imported directly into the web application.

---

## API & SDK Reference

### 1. Connecting as a Host
The `Host` class manages the WebSocket handshake with the `lynk-service` background daemon.

```typescript
import { Host } from 'lynk-sdk';

const host = new Host();
await host.connect();
console.log('Connected to Lynk local service. Host ID:', host.getConnectionId());
```

### 2. Creating an HTTP Server
Spawns an HTTP server that delegates routing and response rendering back to the JavaScript context.

```typescript
// Create an HTTP server instance
const server = await host.createServer('http', {
    name: 'My Personal Webpage',
    service: 'custom_http_service'
});

console.log(`Server launched on port: ${server.getPort()}`);

// Listen to incoming HTTP requests
server.on('request', (req) => {
    console.log(`Received request: ${req.method} ${req.path}`);

    // Respond to the client
    req.res(
        200, 
        { 'Content-Type': 'application/json' }, 
        JSON.stringify({ status: 'success', message: 'Hello from Lynk SDK!' })
    );
}, 'my-request-handler');

// To tear down the server
// server.close();
```

### 3. Creating a WebSocket Server
Spawns a WebSocket server capable of real-time peer communication.

```typescript
const server = await host.createServer('ws', {
    name: 'LAN Chatroom',
    service: 'lynk_chat'
});

// Event triggered when a client joins
server.on('clientJoined', (data) => {
    console.log(`Client connected: ${data.cid}`);
    
    // Send a message to just this client
    data.client.send({ welcome: 'Hello!' });
}, 'join-listener');

// Event triggered when a client sends a message
server.on('clientMessage', (data) => {
    console.log(`Received message from ${data.cid}:`, data.payload);
    
    // Broadcast the message to all clients
    server.broadcast(data.payload);
}, 'message-listener');

// Event triggered when a client disconnects
server.on('clientLeft', (data) => {
    console.log(`Client disconnected: ${data.cid}`);
}, 'leave-listener');
```

### 4. Discovering Services on the LAN
You can query a specific IP address on your local network to discover the available Lynk services it is running.

```typescript
import { discover_all, search } from 'lynk-sdk';

const hostIp = '192.168.1.45'; // target machine IP

// Discover all active servers on the target machine
const services = await discover_all(hostIp);
console.log('Active services:', services);

// Search specifically for chat servers
const chatRooms = await search('lynk_chat', hostIp);
console.log('Found chat rooms:', chatRooms);
```

---

## License

This project is licensed under the [MIT License](/LICENSE).
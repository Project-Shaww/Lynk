import { Server, ServerConfig } from "./server.js";
import WSServer from "./ws.js";

const ServerMap = {
    ws: WSServer,
} as const;

type ServerMap = typeof ServerMap;

export {
    Server, ServerConfig,
    ServerMap,
    WSServer
}
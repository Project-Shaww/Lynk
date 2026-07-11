import { Server, ServerConfig } from "./server.js";
import LynkWSServer from "./ws.js";
import LynkHTTPServer from "./http.js";


const ServerMap = {
    ws: LynkWSServer,
    http: LynkHTTPServer
} as const;

type ServerMap = typeof ServerMap;

export {
    Server, ServerConfig,
    ServerMap,
    LynkWSServer, LynkHTTPServer
}
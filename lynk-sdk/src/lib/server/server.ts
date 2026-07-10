import type { Host } from "../host/host.js";
import type { Listener } from "../types/listener.js";
import type { ServerEvent } from "../types/events.js";

export type ServerProtocol = 'http' | 'ws';
export interface ServerConfig {
    protocol: ServerProtocol;
    name?: string;
}

class Server {
    private _host: Host;
    private _listeners: Map<ServerEvent, Listener[]> = new Map<ServerEvent, Listener[]>();
    private _id: string;
    private _port: number;
    private _protocol: ServerProtocol;
    private _config: ServerConfig;
    constructor(host: Host, id: string, port: number, protocol: ServerProtocol, config: ServerConfig) {
        this._host = host;
        this._id = id;
        this._port = port;
        this._protocol = protocol;
        this._config = config;
    }

    private callListeners(event: ServerEvent, ...args: any[]) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try { listener.callback(...args); }
                catch (error) { console.error(`Error occurred while executing listener '${listener.name}' for event '${event}':`, error); }
            });
        }
    }

    on = (event: ServerEvent, callback: (...args: any[]) => void, name: string) => {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event)?.push({ name, callback });
    }

    off = (event: ServerEvent, name: string) => {
        const listeners = this._listeners.get(event);
        if (listeners) this._listeners.set(event, listeners.filter(listener => listener.name !== name));
    }
}

export { Server };
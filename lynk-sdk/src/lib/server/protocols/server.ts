import type { Host } from "../../host/host.js";
import type { Listener } from "../../types/listener.js";
import type { ServerEvent } from "../../types/events.js";

export interface ServerConfig {
    name?: string;
}

class Server<E extends string = ServerEvent> {
    protected _host: Host;
    protected _listeners: Map<E, Listener[]> = new Map<E, Listener[]>();
    protected id: string;
    protected port: number;
    protected protocol: string;
    protected config: ServerConfig;
    constructor(host: Host, id: string, port: number, protocol: string, config: ServerConfig, _createHandlers: boolean = true) {
        this._host = host;
        this.id = id;
        this.port = port;
        this.protocol = protocol;
        this.config = config;
        if (_createHandlers) {
            this._host.on('serverClosed', (data) => { this.checkSID(data, () => { this.callListeners('disconnected'); this._host.off('serverClosed', `server-${this.id}-close-listener`); this._host.off('serverMessage', `server-${this.id}-message-listener`); }); }, `server-${this.id}-close-listener`)
            this._host.on('serverMessage', (data) => { this.checkSID(data, () => { this.callListeners('message', data); }) }, `server-${this.id}-message-listener`)
        }
    }

    protected callListeners(event: E | ServerEvent, data: Record<string, any> = {}) {
        const listeners = this._listeners.get(event as E);
        if (listeners) {
            listeners.forEach(listener => {
                try { listener.callback(data); }
                catch (error) { console.error(`Error occurred while executing listener '${listener.name}' for event '${event}':`, error); }
            });
        }
    }

    protected checkSID(data: any, callback: () => void | null): boolean {
        if (!data.sid || data.sid != this.id) return false;
        if (callback) callback();
        return true;
    }

    public getId(): string { return this.id; }
    public getPort(): number { return this.port; }
    public getProtocol(): string { return this.protocol; }
    public getConfig(): ServerConfig { return this.config; }

    public on = (event: E, callback: (data: Record<string, any>) => void, name: string) => {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event)?.push({ name, callback });
    }

    public off = (event: E, name: string) => {
        const listeners = this._listeners.get(event);
        if (listeners) this._listeners.set(event, listeners.filter(listener => listener.name !== name));
    }

    public close = () => {
        this._host.request('close_server', { sid: this.id })
    }
}

export { Server };
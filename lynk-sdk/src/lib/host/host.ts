import { getLocalUrl } from '../utils.js';
import { protocolHandlers } from './protocols/index.js';
import type { HostEvent } from '../types/events.js';
import type { Listener } from '../types/listener.js';
import { ServerMap, type ServerConfig, type Server } from '../server/index.js';

class Host {
    /* */

    // Definitions
    protected _getLocalUrl: (path?: string) => string;
    protected ws: WebSocket | null = null;
    protected connected: boolean;
    protected _listeners: Map<HostEvent, Listener[]> = new Map<HostEvent, Listener[]>();
    protected id: string | null = null;
    
    // Resolver
    protected pid: number = 0;
    protected pendingRequests: Map<number, { resolve: (value?: any) => void; reject: (reason?: any) => void }> = new Map();
    
    public servers: Map<string, InstanceType<typeof ServerMap[keyof ServerMap]> | Server<any>> = new Map<string, InstanceType<typeof ServerMap[keyof ServerMap]> | Server<any>>();

    // Constructor
    constructor() {
        this._getLocalUrl = getLocalUrl;
        this.connected = false;
        this.on('welcome', (data) => this.id = data.id, 'host-welcome-listener');
    }

    // Listener Management
    protected callListeners = (event: HostEvent, data: Record<string, any> = {}) => {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {listener.callback(data);}
                catch (error) {console.error(`Error occurred while executing listener '${listener.name}' for event '${event}':`, error);}
            });
        }
    }

    public on(event: HostEvent, callback: (data: Record<string, any>) => void, name: string): void {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event)?.push({ name, callback });
    }

    public off(event: HostEvent, name: string): void {
        const listeners = this._listeners.get(event);
        if (listeners) this._listeners.set(event, listeners.filter(listener => listener.name !== name));
    }

    // WebSocket Event Handlers
    protected handleWSOpen = (event: Event) => {
        this.connected = true;
        this.callListeners('connect');
    }

    protected handleWSClose = (event: CloseEvent) => {
        this.connected = false;
        this.id = null;
        this.callListeners('disconnect');
    }

    protected handleWSMessage = (message: MessageEvent) => {
        let data = message.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); }
            catch (error) { return }
        }
        if (!data || typeof data !== 'object' || !data.type) return;
        const res = protocolHandlers.get(data.type)?.(this, data);
        if (res) {
            if (res.events) {
                res.events.forEach(event => this.callListeners(event.event as HostEvent, event.data));
            }
            if (data.pid != null && this.pendingRequests.has(data.pid)) {
                if (res.response) {
                    if (res.response.accepted) this.pendingRequests.get(data.pid)?.resolve(res.response.data)
                    else this.pendingRequests.get(data.pid)?.reject(res.response.data)
                } else this.pendingRequests.get(data.pid)?.reject(new Error("Handler didn't gave a result"))
                this.pendingRequests.delete(data.pid)
            }
        }
        this.callListeners('message', message.data);
    }

    protected sendWSMessage = (message: Record<string, any> | null = null) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.connected) {
            const sendMessage: Record<string, any> = { ...message, id: this.id };
            this.ws.send(JSON.stringify(sendMessage));
        }
    };

    // Public Methods
    public isConnected(): boolean { return this.connected; }

    public getConnectionId(): string | null { return this.id; }

    public connect(): void {
        const url = 'ws://' + this._getLocalUrl();
        try {
            this.ws = new WebSocket(url);
            this.ws.onopen = (e) => this.handleWSOpen(e);
            this.ws.onclose = (e) => this.handleWSClose(e);
            this.ws.onerror = (error) => this.callListeners('error', { error: 'WebSocket error', message: error });
            this.ws.onmessage = (message) => this.handleWSMessage(message);
        } catch (error) {
            this.callListeners('error', { error: 'Failed to connect to WebSocket', message: error });
            this.connected = false;
            this.ws = null;
            this.id = null;
        }
    }

    public disconnect(): void {
        if (this.ws) this.ws.close();
        this.ws = null;
        this.connected = false;
        this.id = null;
        this.callListeners('disconnect');
    }

    // Methods

    public async request(type: string, data: Record<string, any> = {}, timeout: number = 5000): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) {
                reject(new Error('WebSocket is not open.'));
                return;
            }
            if (!type) {
                reject(new Error('Request type is required.'));
                return;
            }
            const pid = this.pid++;
            this.pendingRequests.set(pid, { resolve, reject });
            this.sendWSMessage({ ...data, pid: pid, type: type });

            if (timeout && timeout > 0) setTimeout(() => {
                if (this.pendingRequests.has(pid)) {
                    reject(new Error("Timeout exceeded."));
                    this.pendingRequests.delete(pid)
                }
            }, timeout);
        });
    }

    public async ping(): Promise<boolean> {
        return this.request('ping');
    }

    public async createServer<T extends keyof ServerMap>(protocol: T, config: ServerConfig): Promise<ServerMap[T]> {
        return new Promise((res, rej) => {this.request('create_server', { protocol, config }, 15000).then((d) => res(d.server)).catch(rej)});
    }

    public async closeServer(sid: string): Promise<boolean> {
        return this.request('close_server', { sid });
    }

    public async messageServer(sid: string, payload: Record<string, any> | string): Promise<boolean> {
        if (typeof payload !== 'string') payload = JSON.stringify(payload);
        return this.request('message_server', { sid, payload });
    }
}

export { Host };
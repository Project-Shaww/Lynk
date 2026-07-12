import { getLocalUrl } from '../utils.js';
import { protocolHandlers } from './protocols/index.js';
import type { HostEvent } from '../types/events.js';
import type { Listener } from '../types/listener.js';
import { ServerMap, type ServerConfig, type Server } from '../server/index.js';

/**
 * A Host is an interface between the client and the Lynk service. It manages the connection to the service and provides
 * methods to interact with the service.
 * 
 * @example
 * ```typescript
 * const host = new Host();
 * await host.connect();
 * 
 * const server = await host.createServer('http');
 * 
 * server.on('request', (request) => {
 *   request.res(200, { 'Content-Type': 'application/json' }, JSON.stringify({status: 'OK'}));
 * }, 'requestHandler');
 * ```
 * 
 */
class Host {
    protected _getLocalUrl: (path?: string) => string;
    protected ws: WebSocket | null = null;
    protected connected: boolean;
    protected _listeners: Map<HostEvent, Listener[]> = new Map<HostEvent, Listener[]>();
    protected id: string | null = null;
    
    protected pid: number = 0;
    protected pendingRequests: Map<number, { resolve: (value?: any) => void; reject: (reason?: any) => void }> = new Map();
    
    /** All servers created by this host */
    public servers: Map<string, InstanceType<typeof ServerMap[keyof ServerMap]> | Server<any>> = new Map<string, InstanceType<typeof ServerMap[keyof ServerMap]> | Server<any>>();

    constructor() {
        this._getLocalUrl = getLocalUrl;
        this.connected = false;
    }

    protected callListeners = (event: HostEvent, data: Record<string, any> = {}) => {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {listener.callback(data);}
                catch (error) {console.error(`Error occurred while executing listener '${listener.name}' for event '${event}':`, error);}
            });
        }
    }

    /**
     * Registers a listener for a specific event.
     * 
     * @param event - The event to listen for.
     * @param callback - The callback function to execute when the event is triggered.
     * @param name - The name of the listener.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * 
     * host.on('disconnect', () => {
     *   console.log('Disconnected from Lynk');
     * }, 'disconnectListener');
     * ```
     */
    public on(event: HostEvent, callback: (data: Record<string, any>) => void, name: string): void {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event)?.push({ name, callback });
    }

    /**
     * Unregisters a listener for a specific event.
     * 
     * @param event - The event to unregister the listener from.
     * @param name - The name of the listener to unregister.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * 
     * host.off('disconnect', 'disconnectListener');
     * ```
     */
    public off(event: HostEvent, name: string): void {
        const listeners = this._listeners.get(event);
        if (listeners) this._listeners.set(event, listeners.filter(listener => listener.name !== name));
    }

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

    /**
     * Checks if the host is connected to the service.
     * 
     * @returns True if the host is connected, false otherwise.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * 
     * if (!host.isConnected()) {
     *   throw new Error('Failed to connect to service');
     * }
     * ```
     */
    public isConnected(): boolean { return this.connected; }

    /**
     * Gets the connection ID of the host.
     * @returns The connection ID of the host.
     */
    public getConnectionId(): string | null { return this.id; }

    /**
     * Connects to the service.
     * 
     * @returns A promise that resolves when the connection is established.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * ```
     */
    public connect(): Promise<void> {
        return new Promise((res, rej) => {
            const url = 'ws://' + this._getLocalUrl();
            try {
                this.ws = new WebSocket(url);
                this.ws.onopen = (e) => this.handleWSOpen(e);
                this.ws.onclose = (e) => this.handleWSClose(e);
                this.ws.onerror = (error) => this.callListeners('error', { error: 'WebSocket error', message: error });
                this.ws.onmessage = (message) => this.handleWSMessage(message);
                this.on('welcome', (data) => {
                    this.id = data.id
                    this.off('welcome', 'host-intern-welcome-listener');
                    res();
                }, 'host-intern-welcome-listener');
                setTimeout(() => {
                    if (!this.id) {
                        this.off('welcome', 'host-intern-welcome-listener');
                        this.ws?.close();
                        rej(new Error('Connection timeout.'));
                    }
                }, 30000);
            } catch (error) {
                this.callListeners('error', { error: 'Failed to connect to WebSocket', message: error });
                this.connected = false;
                this.ws = null;
                this.id = null;
                rej(error);
            }
        });
    }

    /**
     * Disconnects from the service.
     */
    public disconnect(): void {
        if (this.ws) this.ws.close();
        this.ws = null;
        this.connected = false;
        this.id = null;
        this.callListeners('disconnect');
    }

    /**
     * Sends a request to the service.
     * 
     * @param type - The type of the request.
     * @param data - The data to send with the request.
     * @param timeout - The timeout for the request.
     * @returns A promise that resolves with the response from the service.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * 
     * const response = await host.request('ping', {}, 10000);
     * console.log(response);
     * ```
     */
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

    /**
     * Pings the service.
     * 
     * @returns A promise that resolves with true if the service is reachable, false otherwise.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * 
     * const response = await host.ping();
     * console.log(response);
     * ```
     */
    public async ping(): Promise<boolean> {
        return this.request('ping');
    }

    /**
     * Creates a server.
     * 
     * @param protocol - The protocol to use.
     * @param config - The configuration for the server.
     * @returns A promise that resolves with the created server.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * 
     * const server = await host.createServer('ws');
     * console.log(server.getId());
     * ```
     */
    public async createServer<T extends keyof ServerMap>(protocol: T, config: ServerConfig): Promise<ServerMap[T]> {
        return new Promise((res, rej) => {this.request('create_server', { protocol, config }, 15000).then((d) => res(d.server)).catch(rej)});
    }

    /**
     * Closes a server.
     * 
     * @param sid - The ID of the server to close.
     * @returns A promise that resolves with true if the server was closed successfully, false otherwise.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * 
     * const server = await host.createServer('ws');
     * await host.closeServer(server.getId());
     * ```
     */
    public async closeServer(sid: string): Promise<boolean> {
        return this.request('close_server', { sid });
    }

    /**
     * Sends a message to a server.
     * 
     * @param sid - The ID of the server to send the message to.
     * @param payload - The message to send.
     * @returns A promise that resolves with true if the message was sent successfully, false otherwise.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * 
     * const server = await host.createServer('ws');
     * await host.messageServer(server.getId(), 'Hello!');
     * ```
     */
    public async messageServer(sid: string, payload: Record<string, any> | string): Promise<boolean> {
        if (typeof payload !== 'string') payload = JSON.stringify(payload);
        return this.request('message_server', { sid, payload });
    }
}

export { Host };
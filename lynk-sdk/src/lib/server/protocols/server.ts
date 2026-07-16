import type { Host } from "../../host/host.js";
import type { Listener } from "../../types/listener.js";
import type { ServerEvent } from "../../types/events.js";
import type { ServerConfig } from './config.js';

/**
 * Represents a Lynk server.
 * 
 * @class Server
 * 
 * @description
 * The `Server` class represents a Lynk server that can be created by the host.
 * It is defined by its protocol, which determines its capabilities and behavior.
 * 
 * @param host - The host that manages this server.
 * @param id - The ID of the server.
 * @param port - The port of the server.
 * @param protocol - The protocol of the server.
 * @param config - The configuration for the server.
 */
class Server<E extends string = ServerEvent> {
    protected _host: Host;
    protected _listeners: Map<E, Listener[]> = new Map<E, Listener[]>();
    protected id: string;
    protected port: number;
    protected protocol: string;
    protected config: ServerConfig;

    /**
     * Creates a new server instance.
     * 
     * @param host - The host that manages this server.
     * @param id - The ID of the server.
     * @param port - The port of the server.
     * @param protocol - The protocol of the server.
     * @param config - The configuration for the server.
     */
    constructor(host: Host, id: string, port: number, protocol: string, config: ServerConfig) {
        this._host = host;
        this.id = id;
        this.port = port;
        this.protocol = protocol;
        this.config = config;
    }

    protected init() {
        this._host.on('serverClosed', (data) => { this.checkSID(data, () => { this.callListeners('disconnected'); this._host.off('serverClosed', `server-${this.id}-close-listener`); this._host.off('serverMessage', `server-${this.id}-message-listener`); }); }, `server-${this.id}-close-listener`)
        this._host.on('serverMessage', (data) => { this.checkSID(data, () => { this.callListeners('message', data); }) }, `server-${this.id}-message-listener`)
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

    protected updateServer() {
        this._host.request('update_server', { sid: this.id, config: this.config });
    }
    
    /**
     * Gets the ID of the server.
     * @returns The ID of the server.
     */
    public getId(): string { return this.id; }
    
    /**
     * Gets the port of the server.
     * @returns The port of the server.
     */
    public getPort(): number { return this.port; }
    
    /**
     * Gets the protocol of the server.
     * @returns The protocol of the server.
     */
    public getProtocol(): string { return this.protocol; }
    
    /**
     * Gets the configuration of the server.
     * @returns The configuration of the server.
     */
    public getConfig(): ServerConfig { return this.config; }

    /**
     * Sets the name of the server.
     * @param name - The name of the server.
     */
    public setName(name: string): void {
        this.config.name = name;
        this.updateServer();
    }

    /**
     * Sets the service of the server.
     * @param service - The service of the server.
     */
    public setService(service: string): void {
        this.config.service = service;
        this.updateServer();
    }

    /**
     * Sets the URL of the server.
     * @param url - The URL of the server.
     */
    public setUrl(url: string): void {
        this.config.url = url;
        this.updateServer();
    }

    /**
     * Updates the configuration of the server.
     * @param config - The configuration to update.
     */
    public updateConfig(config: Partial<ServerConfig>) {
        this.config = { ...this.config, ...config };
        this.updateServer();
    }

    /**
     * Gets the name of the server.
     * @returns The name of the server.
     */
    public getName(): string { return this.config.name || '';}

    /**
     * Gets the service of the server.
     * @returns The service of the server.
     */
    public getService(): string { return this.config.service || ''; }

    /**
     * Gets the URL of the server.
     * @returns The URL of the server.
     */
    public getUrl(): string { return this.config.url || ''; }

    /**
     * Registers a listener for a specific event.
     * 
     * @description 
     * This method is used to register a listener for a specific event. The listener will be 
     * executed when the event is triggered.
     * 
     * @param event - The event to listen for.
     * @param callback - The callback function to execute when the event is triggered.
     * @param name - The name of the listener.
     * 
     * @example
     * ```typescript
     * server.on('message', (data) => {
     *   console.log('Message received:', data);
     * }, 'message-listener');
     * ```
     */
    public on(event: E, callback: (data: Record<string, any>) => void, name: string): void {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event)?.push({ name, callback });
    }

    /**
     * Unregisters a listener for a specific event.
     * 
     * @description 
     * This method is used to unregister a listener for a specific event. The listener will be 
     * removed from the server.
     * 
     * @param event - The event to unregister the listener from.
     * @param name - The name of the listener to unregister.
     * 
     * @example
     * ```typescript
     * server.off('message', 'message-listener');
     * ```
     */
    public off(event: E, name: string): void {
        const listeners = this._listeners.get(event);
        if (listeners) this._listeners.set(event, listeners.filter(listener => listener.name !== name));
    }

    /**
     * Closes the server.
     */
    public close(): void {
        this._host.request('close_server', { sid: this.id });
    }
}

export { Server };
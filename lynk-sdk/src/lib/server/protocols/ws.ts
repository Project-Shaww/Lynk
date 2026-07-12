import { Server } from './server.js';
import type { Host } from '../../host/host.js';
import type { ServerConfig } from './config.js';
import type { Listener } from '../../types/listener.js';
import type { ServerEvent } from '../../types/events.js';

type WSEvent = ServerEvent | 'clientJoined' | 'clientLeft' | 'clientMessage';

/**
 * WebSocket Server Protocol
 * 
 * @class LynkWSServer
 * 
 * @description
 * The `LynkWSServer` class represents a WebSocket server that can be created by the host.
 * It extends the `Server` class and implements the WebSocket protocol.
 * 
 * @example
 * ```typescript
 * const host = new Host();
 * await host.connect()
 * const server = await host.createServer('ws', {});
 * 
 * let clientIds = [];
 * 
 * server.on('clientJoined', (data) => {
 *   console.log('Client joined:', data.cid);
 *   clientIds.push(data.cid);
 *   data.client.send({ message: 'Welcome!' });
 * }, 'clientJoinHandler');
 * 
 * server.on('clientMessage', (data) => {
 *   console.log('Message received:', data.payload);
 * }, 'clientMessageHandler');
 * 
 * server.on('clientLeft', (data) => {
 *   console.log('Client left:', data.cid);
 *   clientIds.splice(clientIds.indexOf(data.cid), 1);
 * }, 'clientLeftHandler');
 * 
 * server.on('disconnected', () => {
 *   console.log('Server disconnected');
 * }, 'disconnectedHandler');
 * ```
 * 
 * @extends Server
 */
class LynkWSServer extends Server<WSEvent> {
    /** 
     * This property holds all the connected clients to the server.
     */
    public clients: Map<string, InstanceType<typeof LynkWSServer.Client>> = new Map<string, InstanceType<typeof LynkWSServer.Client>>();

    /**
     * Creates a new instance of the LynkWSServer.
     * 
     * @param host - The host that created the server.
     * @param sid - The server ID.
     * @param port - The port the server is running on.
     * @param config - The configuration for the server.
     */
    constructor(host: Host, sid: string, port: number, config: ServerConfig) {
        super(host, sid, port, 'ws', config);
    }

    protected init() {
        this._host.on('serverClosed', (data) => { this.checkSID(data, () => { this.callListeners('disconnected'); this._host.off('serverClosed', `server-${this.id}-close-listener`); this._host.off('serverMessage', `server-${this.id}-message-listener`); }); }, `server-${this.id}-close-listener`)
        this._host.on('serverMessage', (data) => { this.checkSID(data, () => { this.handleServerMessage(data); this.callListeners('message', data); }) }, `server-${this.id}-message-listener`)
    }

    protected handleServerMessage(data: Record<string, any>) {
        if (!data.type) return;
        let client: InstanceType<typeof LynkWSServer.Client>;
        switch (data.type) {
            case 'connect':
                client = new LynkWSServer.Client(data.cid, this);
                this.clients.set(data.cid, client);
                this.callListeners('clientJoined', { cid: data.cid, client: client });
                break;
            case 'disconnect':
                client = this.clients.get(data.cid) as any;
                if (client) {
                    client.dispatchEvent('disconnected');
                    this.clients.delete(data.cid);
                }
                this.callListeners('clientLeft', { cid: data.cid });
                break;
            case 'message':
                client = this.clients.get(data.cid) as any;
                if (client) client.dispatchEvent('message', data.payload);
                this.callListeners('clientMessage', { cid: data.cid, payload: data.payload });
                break;
            default:
                break;
        }
    }

    /**
     * Represents a WebSocket Client.
     * 
     * @class Client
     * 
     * @param cid - The client ID.
     * @param server - The server that created the client.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * const server = await host.createServer('ws', {});
     * 
     * server.on('clientJoined', (data) => {
     *    data.client.send({ message: 'Hello, world!' });
     * 
     *    data.client.on('message', (payload) => {
     *        console.log(payload);
     *        data.client.send('Received: ' + payload);
     *    }, 'messageListener');
     * 
     *    data.client.on('disconnected', () => {
     *        console.log('Client disconnected');
     *    }, 'disconnectedListener');
     * }, 'clientJoinHandler');
     * ```
     */
    static Client = class {
        cid: string;
        server: LynkWSServer;
        _listeners: Map<'message' | 'disconnected' | 'error', Listener[]> = new Map();

        /**
         * Creates a new instance of the Client.
         * @param clientID - The ID of the client.
         * @param server - The server that created the client.
         */
        constructor(clientID: string, server: LynkWSServer) {
            this.cid = clientID;
            this.server = server;
        }

        /**
         * Sends a message to the client.
         * 
         * @param message - The message to send to the client.
         * 
         * @example
         * ```typescript
         * const host = new Host();
         * await host.connect();
         * const server = await host.createServer('ws', {});
         * 
         * server.on('clientJoined', (data) => {
         *    data.client.send('Hello, world!');
         * }, 'greetingSender');
         * ```
         * 
         * @note Message can be a string or a Record<string, any>. If it's a Record<string, any>, it will be stringified.
         * 
         * @example
         * ```typescript
         * client.on('message', (payload) => {
         *    const parsedMessage = JSON.parse(payload);
         * 
         *    if (parsedMessage.type === 'command') {
         *        // Some logic
         * 
         *        client.send({ response: 'Received your command!' });
         *    }
         * 
         *    // ...
         * }, 'commandListener');
         * ```
         */
        public send(message: Record<string, any> | string): void {
            this.server.send(this.cid, message);
        }

        /**
         * Dispatches an event to the client.
         * 
         * @description 
         * This method is used to dispatch an event to the client. The event will be 
         * executed by the listener registered for the specific event.
         * 
         * @param event - The event to dispatch.
         * @param data - The data to dispatch.
         * 
         * @example
         * ```typescript
         * client.dispatchEvent('message', { message: 'Hello, world!' });
         * ```
         */
        public dispatchEvent(event: 'message' | 'disconnected' | 'error', data: Record<string, any> = {}) {
            const listeners = this._listeners.get(event);
            if (listeners) {
                listeners.forEach(listener => {
                    try { listener.callback(data); }
                    catch (error) { console.error(`Error occurred while executing listener '${listener.name}' for event '${event}':`, error); }
                });
            }
        }

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
         * client.on('message', (payload) => {
         *   console.log('Message received:', payload);
         * }, 'commandListener');
         * ```
         */
        public on(event: 'message' | 'disconnected' | 'error', callback: (data: Record<string, any>) => void, name: string): void {
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
         * client.off('message', 'commandListener');
         * ```
         */
        public off(event: 'message' | 'disconnected' | 'error', name: string): void {
            const listeners = this._listeners.get(event);
            if (listeners) this._listeners.set(event, listeners.filter(listener => listener.name !== name));
        }
    }

    /**
     * Gets a client by its ID.
     * @param id - The ID of the client.
     * @returns The client if found, otherwise undefined.
     */
    public getClient(id: string): InstanceType<typeof LynkWSServer.Client> | void {
        return this.clients.get(id);
    }

    /**
     * Sends message to a specific client.
     * 
     * @param cid - The ID of the client to send the message to.
     * @param message - The message to send.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * const server = await host.createServer('ws', {});
     * 
     * server.on('clientJoined', (data) => {
     *    server.send(data.cid, 'Hello, world!');
     * }, 'clientJoinedHandler');
     * ```
     * 
     * @note Message can be a string or a Record<string, any>. If it's a Record<string, any>, it will be stringified.
     * 
     * @example
     * ```typescript
     * server.on('clientMessage', (data) => {
     *    const parsedMessage = JSON.parse(data.payload);
     * 
     *    if (parsedMessage.type === 'command') {
     *        // Some logic
     * 
     *        server.send(data.cid, { response: 'Received your command!' });
     *    }
     * 
     *    // ...
     * }, 'clientMessageReceiver');
     * ```
     */
    public send(cid: string, message: Record<string, any> | string): void {
        if (typeof message !== 'string') message = JSON.stringify(message);
        this._host.messageServer(this.id, { type: 'send', cid: cid, payload: message }).then((accepted: boolean) => { if (!accepted) { this.getClient(cid)?.dispatchEvent('error', { error: 'Server rejected message' }); this.callListeners('error', { error: 'Server rejected message' }); } }).catch((err: any) => { this.getClient(cid)?.dispatchEvent('error', { error: err }); this.callListeners('error', { error: err }); });
    }

    /**
     * Broadcasts message to all clients.
     * 
     * @param message - The message to broadcast.
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * await host.connect();
     * const server = await host.createServer('ws', {});
     * 
     * server.broadcast('Hello, world!');
     * ```
     */
    public broadcast(message: Record<string, any> | string): void {
        if (typeof message !== 'string') message = JSON.stringify(message);
        this._host.messageServer(this.id, { type: 'broadcast', payload: message }).then((accepted: boolean) => { if (!accepted) { this.callListeners('error', { error: 'Server rejected message' }); } }).catch((err: any) => { this.callListeners('error', { error: err }); });
    }
}

export default LynkWSServer;
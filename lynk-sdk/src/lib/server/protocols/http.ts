import { Server } from './server.js';
import type { Host } from '../../host/host.js';
import type { ServerConfig } from './config.js';
import type { ServerEvent } from '../../types/events.js';

type HTTPEvent = ServerEvent | 'request';
interface LynkHTTPRequest {
    res: (status: number, headers: Record<string, string>, body?: string) => void;
    path: string;
    method: string;
    query: URLSearchParams;
    headers: Record<string, string>;
    body?: string;
}

/**
 * HTTP Server Protocol
 * 
 * @class LynkHTTPServer
 * 
 * @description
 * The `LynkHTTPServer` class represents a HTTP server that can be created by the host.
 * It extends the `Server` class and implements the HTTP protocol.
 * 
 * @example
 * ```typescript
 * const host = new Host();
 * await host.connect()
 * const server = await host.createServer('http', {});
 * 
 * server.on('request', (request) => {
 *   console.log('Request received:', request);
 *   request.res(200, { 'Content-Type': 'application/json' }, JSON.stringify({ message: 'Hello, world!' }));
 * }, 'requestListener');
 * 
 * server.on('disconnected', () => {
 *   console.log('Server disconnected');
 * }, 'disconnectedHandler');
 * ```
 * 
 * @extends Server
 */
class LynkHTTPServer extends Server<HTTPEvent> {
    /**
     * Creates a new LynkHTTPServer.
     * @param host - The host that manages this server.
     * @param sid - The ID of the server.
     * @param port - The port of the server.
     * @param config - The configuration for the server.
     */
    constructor(host: Host, sid: string, port: number, config: ServerConfig) {
        super(host, sid, port, 'http', config);
    }

    protected init() {
        this._host.on('serverClosed', (data) => { this.checkSID(data, () => { this.callListeners('disconnected'); this._host.off('serverClosed', `server-${this.id}-close-listener`); this._host.off('serverMessage', `server-${this.id}-message-listener`); }); }, `server-${this.id}-close-listener`)
        this._host.on('serverMessage', (data) => { this.checkSID(data, () => { this.handleServerMessage(data); this.callListeners('message', data); }) }, `server-${this.id}-message-listener`)
    }

    protected respond(rid: string, status: number, headers: Record<string, string>, body?: string) {
        this._host.messageServer(this.id, { type: 'response', rid: rid, status: status, headers: headers, body: body }).then((accepted: boolean) => { if (!accepted) { this.callListeners('error', { error: 'Server rejected message' }); } }).catch((err: any) => { this.callListeners('error', { error: err }); });;
    }

    protected handleServerMessage(data: Record<string, any>) {
        if (!data.type) return;
        switch (data.type) {
            case 'request':
                let url = new URL('http://127.0.0.1:' + this.port + data.url);
                let httpRequest: LynkHTTPRequest = {
                    res: (status: number, headers: Record<string, string>, body?: string) => { this.respond(data.rid, status, headers, body); },
                    path: url.pathname,
                    query: url.searchParams,
                    method: data.method,
                    headers: data.headers
                }
                if (data.body) httpRequest.body = data.body;
                this.callListeners('request', httpRequest);
                break;
            default:
                break;
        }
    }

    /**
     * Registers a listener for a request event.
     * @param {'request'} event
     * @param { (data: LynkHTTPRequest) => void } callback
     * @param {string} name
     * 
     * @example
     * ```typescript
     * const host = new Host();
     * const server = host.createServer('http', {});
     * 
     * server.on('request', (request) => {
     *   request.res(200, {}, 'Hello, world!');
     * }, 'requestListener');
     * ```
     * 
     * The request object, which is passed to the callback function, is defined as:
     * 
     * @interface LynkHTTPRequest
     * @property res - Function to respond to the request.
     * @property path - Path of the request.
     * @property method - Method of the request.
     * @property query - Query parameters of the request.
     * @property headers - Headers of the request.
     * @property body - Body of the request.
     * 
     * The res function is defined as:
     * @param {number} status - Status code of the response.
     * @param {Record<string, string>} headers - Headers of the response.
     * @param {string} [body] - Optional. Body of the response.
     * 
     * The request listener must respond to every request it receives. If it doesn't, the request will time out.
     * 
     * @example
     * ```typescript
     * server.on('request', (request) => {
     *   switch (request.path) {
     *     case '/hello':
     *       request.res(200, { 'Content-Type': 'application/json' }, JSON.stringify({ message: 'Hello, world!' }));
     *       break;
     *     default:
     *       request.res(404, {}, 'Not found');
     *       break;
     *   }
     * }, 'requestListener');
     * ```
     */
    public on(event: 'request', callback: (data: LynkHTTPRequest) => void, name: string): void;
    /**
     * Registers a listener for a specific event.
     * @param {Exclude<HTTPEvent, 'request'>} event
     * @param callback - The callback function to execute when the event is triggered.
     * @param name - The name of the listener.
     */
    public on(event: Exclude<HTTPEvent, 'request'>, callback: (data: Record<string, any>) => void, name: string): void;
    public on(event: HTTPEvent, callback: (data: any) => void, name: string): void
    { super.on(event, callback, name); }
}

export default LynkHTTPServer;
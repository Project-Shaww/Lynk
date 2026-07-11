import { Server } from './server.js';
import type { Host } from '../../host/host.js';
import type { ServerConfig } from './server.js';
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

class LynkHTTPServer extends Server<HTTPEvent> {
    constructor(host: Host, sid: string, port: number, config: ServerConfig) {
        super(host, sid, port, 'http', config, false);
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
                let url = new URL('http://localhost:' + this.port + data.url);
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

    public on(event: 'request', callback: (data: Record<string, any>) => void, name: string): void;
    public on(event: HTTPEvent, callback: (data: Record<string, any>) => void, name: string): void
    { super.on(event, callback, name); }
}

export default LynkHTTPServer;
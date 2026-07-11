import { Server } from './server.js';
import type { Host } from '../../host/host.js';
import type { ServerConfig } from './server.js';
import type { Listener } from '../../types/listener.js';
import type { ServerEvent } from '../../types/events.js';

type WSEvent = ServerEvent | 'clientJoined' | 'clientLeft' | 'clientMessage';

class WSServer extends Server<WSEvent> {
    public clients: Map<string, InstanceType<typeof WSServer.Client>> = new Map<string, InstanceType<typeof WSServer.Client>>();

    constructor(host: Host, sid: string, port: number, config: ServerConfig) {
        super(host, sid, port, 'ws', config, false);
        this._host.on('serverClosed', (data) => { this.checkSID(data, () => { this.callListeners('disconnected'); this._host.off('serverClosed', `server-${this.id}-close-listener`); this._host.off('serverMessage', `server-${this.id}-message-listener`); }); }, `server-${this.id}-close-listener`)
        this._host.on('serverMessage', (data) => { this.checkSID(data, () => { this.handleServerMessage(data); this.callListeners('message', data); }) }, `server-${this.id}-message-listener`)
    }

    protected handleServerMessage(data: Record<string, any>) {
        if (!data.type) return;
        let client: InstanceType<typeof WSServer.Client>;
        switch (data.type) {
            case 'connect':
                client = new WSServer.Client(data.cid, this);
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

    static Client = class {
        cid: string;
        server: WSServer;
        _listeners: Map<'message' | 'disconnected' | 'error', Listener[]> = new Map();

        constructor(clientID: string, server: WSServer) {
            this.cid = clientID;
            this.server = server;
        }

        public send(data: Record<string, any> | string): void {
            this.server.send(this.cid, data);
        }

        public dispatchEvent(event: 'message' | 'disconnected' | 'error', data: Record<string, any> = {}) {
            const listeners = this._listeners.get(event);
            if (listeners) {
                listeners.forEach(listener => {
                    try { listener.callback(data); }
                    catch (error) { console.error(`Error occurred while executing listener '${listener.name}' for event '${event}':`, error); }
                });
            }
        }

        public on = (event: 'message' | 'disconnected' | 'error', callback: (data: Record<string, any>) => void, name: string) => {
            if (!this._listeners.has(event)) this._listeners.set(event, []);
            this._listeners.get(event)?.push({ name, callback });
        }

        public off = (event: 'message' | 'disconnected' | 'error', name: string) => {
            const listeners = this._listeners.get(event);
            if (listeners) this._listeners.set(event, listeners.filter(listener => listener.name !== name));
        }
    }

    public getClient(id: string): InstanceType<typeof WSServer.Client> | void {
        return this.clients.get(id);
    }

    public send(cid: string, data: Record<string, any> | string): void {
        if (typeof data !== 'string') data = JSON.stringify(data);
        this._host.messageServer(this.id, { type: 'send', cid: cid, payload: data }).then((accepted: boolean) => { if (!accepted) { this.getClient(cid)?.dispatchEvent('error', { error: 'Server rejected message' }); this.callListeners('error', { error: 'Server rejected message' }); } }).catch((err: any) => { this.getClient(cid)?.dispatchEvent('error', { error: err }); this.callListeners('error', { error: err }); });
    }

    public broadcast(data: Record<string, any> | string): void {
        if (typeof data !== 'string') data = JSON.stringify(data);
        this._host.messageServer(this.id, { type: 'broadcast', payload: data }).then((accepted: boolean) => { if (!accepted) { this.callListeners('error', { error: 'Server rejected message' }); } }).catch((err: any) => { this.callListeners('error', { error: err }); });
    }
}

export default WSServer;
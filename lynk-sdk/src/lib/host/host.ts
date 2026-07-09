import { getLocalUrl } from '../utils.js';
import handlers from './handlers/index.js';

type HostEvent = 'connect' | 'disconnect' | 'message' | 'error';
interface Listener {
    name: string;
    callback: (...args: unknown[]) => void;
}

class Host {
    /* */

    // Definitions
    protected _getLocalUrl: (path?: string) => string;
    protected ws: WebSocket | null = null;
    protected connected: boolean;
    private _listeners: Map<HostEvent, Listener[]> = new Map<HostEvent, Listener[]>();
    protected connectionId: string | null = null;
    
    // Resolver
    protected pid: number = 0;
    protected pendingRequests: Map<number, { resolve: (value?: any) => void; reject: (reason?: any) => void }> = new Map();
    
    // Constructor
    constructor() {
        this._getLocalUrl = getLocalUrl;
        this.connected = false;
    }

    // Listener Management
    protected callListeners = (event: HostEvent, ...args: unknown[]) => {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {listener.callback(...args);}
                catch (error) {console.error(`Error occurred while executing listener '${listener.name}' for event '${event}':`, error);}
            });
        }
    }

    on = (event: HostEvent, callback: (...args: unknown[]) => void, name: string) => {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event)?.push({ name, callback });
    }

    off = (event: HostEvent, name: string) => {
        const listeners = this._listeners.get(event);
        if (listeners) this._listeners.set(event, listeners.filter(listener => listener.name !== name));
    }

    // WebSocket Event Handlers
    private handleWSOpen = (event: Event) => {
        this.connected = true;
        this.callListeners('connect');
    }

    private handleWSClose = (event: CloseEvent) => {
        this.connected = false;
        this.connectionId = null;
        this.callListeners('disconnect');
    }

    protected handleWSMessage = (message: MessageEvent) => {
        let data = message.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); }
            catch (error) { return }
        }
        if (!data || typeof data !== 'object' || !data.type) return;
        const res = handlers.get(data.type)?.(this, data);
        if (data.pid != null && this.pendingRequests.has(data.pid)) {
            if (res) {
                if (res.accepted) this.pendingRequests.get(data.pid)?.resolve(res.data)
                else this.pendingRequests.get(data.pid)?.reject(res.data)
            } else this.pendingRequests.get(data.pid)?.reject(new Error("Handler didn't gave a result"))
            this.pendingRequests.delete(data.pid)
        }
        this.callListeners('message', message.data);
    }

    protected sendWSMessage = (message: Object & any | null = null) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.connected) {
            const sendMessage = { id: this.connectionId, ...message };
            this.ws.send(JSON.stringify(sendMessage));
        }
    };

    _setConnectionId = (connectionId: string) => { this.connectionId = connectionId; }

    // Public Methods
    isConnected = () => { return this.connected; }

    getConnectionId = () => { return this.connectionId || ''; }

    connect = () => {
        const url = 'ws://' + this._getLocalUrl();
        try {
            this.ws = new WebSocket(url);
            this.ws.onopen = (e) => this.handleWSOpen(e);
            this.ws.onclose = (e) => this.handleWSClose(e);
            this.ws.onerror = (error) => this.callListeners('error', 'WebSocket error:', error);
            this.ws.onmessage = (message) => this.handleWSMessage(message);
        } catch (error) {
            this.callListeners('error', 'Failed to connect to WebSocket:', error);
            this.connected = false;
            this.ws = null;
            this.connectionId = null;
        }
    }

    disconnect = () => {
        if (this.ws) this.ws.close();
        this.ws = null;
        this.connected = false;
        this.connectionId = null;
        this.callListeners('disconnect');
    }

    // Methods

    request(type: string, data: Object & any | null = null): Promise<any> {
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
            this.sendWSMessage({ pid: pid, type: type, ...data });
        });
    }

    ping(): Promise<boolean> {
        return this.request('ping')
    }
}

export { Host };
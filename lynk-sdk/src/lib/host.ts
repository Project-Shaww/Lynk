import { getLocalUrl } from './utils.js';

type HostEvent = 'connect' | 'disconnect' | 'message' | 'error';
interface Listener {
    name: string;
    callback: (...args: unknown[]) => void;
}

class Host {
    /* */

    // Definitions
    protected _getLocalUrl: (path?: string) => string;
    protected _ws: WebSocket | null = null;
    protected _connected: boolean;
    private _listeners: Map<HostEvent, Listener[]> = new Map<HostEvent, Listener[]>();
    protected connectionId: string | null = null;
    
    // Constructor
    constructor() {
        this._getLocalUrl = getLocalUrl;
        this._connected = false;
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
        this._connected = true;
        this.callListeners('connect');
    }

    private handleWSClose = (event: CloseEvent) => {
        this._connected = false;
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
        /* Data: {type: string, ...} */

        switch (data.type) {
            /* Welcome 
            {connectionId: string}*/
            case 'welcome':
                this.connectionId = data.connectionId;
                break;
            
        }

        this.callListeners('message', message.data);
    }

    // Public Methods
    isConnected = () => { return this._connected; }

    getConnectionId = () => { return this.connectionId || ''; }

    connect = () => {
        const url = 'ws://' + this._getLocalUrl();
        try {
            this._ws = new WebSocket(url);
            this._ws.onopen = (e) => this.handleWSOpen(e);
            this._ws.onclose = (e) => this.handleWSClose(e);
            this._ws.onerror = (error) => this.callListeners('error', 'WebSocket error:', error);
            this._ws.onmessage = (message) => this.handleWSMessage(message);
        } catch (error) {
            this.callListeners('error', 'Failed to connect to WebSocket:', error);
            this._connected = false;
            this._ws = null;
            this.connectionId = null;
        }
    }

    disconnect = () => {
        if (this._ws) this._ws.close();
        this._ws = null;
        this._connected = false;
        this.connectionId = null;
        this.callListeners('disconnect');
    }
}

export { Host };
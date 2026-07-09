import { getLocalUrl } from './utils.js';

export function Host () {
    this._getLocalUrl = getLocalUrl;
    this._ws = null;
    this._connected = false;

    function handleCb(cb, ...args) {
        if (cb && typeof cb === 'function') {
            try {cb(...args);}
            catch (error) {console.error('Error occurred while executing callback:', error);}
        }
    }

    function handleWSOpen(cb) {
        this._connected = true;
        handleCb(cb, null);
    }

    function handleWSClose() {
        this._connected = false;
    }

    this.isConnected = function() {
        return this._connected;
    }

    this.connect = function(cb) {
        const url = 'ws://' + this._getLocalUrl();
        try {
            this._ws = new WebSocket(url);
            this._ws.onopen = () => handleWSOpen.call(this, cb);
            this._ws.onclose = () => handleWSClose.call(this);
            this._ws.onerror = (error) => console.error('WebSocket error:', error);
            this._ws.onmessage = (message) => console.log('Received message:', message.data);
        } catch (error) {
            console.error('Failed to connect to WebSocket server:', error);
            this._connected = false;
            this._ws = null;
            handleCb(cb, error);
        }
    }

    this.disconnect = function(cb) {
        if (this._ws) this._ws.close();
        this._ws = null;
        this._connected = false;
        handleCb(cb, null);
    }

    return this;
}
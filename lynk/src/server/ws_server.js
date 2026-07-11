const WebSocket = require('ws');
const { generateUniqueId } = require('../utils.js');

/**
 * @param {HostConnection} host
 * @param {Map<string, any>} servers_ref
 */
function WSServer(host, servers_ref) {
    this.sid = generateUniqueId();
    this.hostId = host.id;
    this.port = 0;
    this.server = null;
    this.host = host;

    this.ready = false;
    let onReady = [];
    
    this.server = new WebSocket.Server({port: 0}, () => {
        this.port = this.server.address().port;
        this.ready = true;
        console.log('WS Server Created', this.sid, 'on port', this.port);
        onReady.forEach((callback) => {
            callback();
        });
        onReady = [];
    });

    this.onReady = (cb) => {
        if (this.ready) {
            cb();
        } else {
            onReady.push(cb);
        }
    }

    this.clients = new Map();

    /** @param {WebSocket} websocket */
    function Client(websocket, sid, hostId) {
        this.websocket = websocket;
        this.sid = sid;
        this.hid = hostId;
        this.cid = generateUniqueId();

        this.send = (data) => {
            let parsedData = data;
            if (typeof parsedData !== 'string') parsedData = JSON.stringify(parsedData);
            if (this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.send(parsedData);
                return true;
            } else {
                return false;
            }
        }

        this.websocket.on('message', (m) => {
            const message = m.toString();
            const host = this.host;
            if (host) host.send({type: 'server_message', sid: this.sid, payload: {type: 'message', cid: this.cid, payload: message}});
        });

        this.websocket.on('close', (m) => {
            console.log('WS Server Client disconnected', this.cid);
            servers_ref.get(this.sid).clients.delete(this.cid);
            const host = this.host;
            if (host) host.send({type: 'server_message', sid: this.sid, payload: {type: 'disconnect', cid: this.cid}});
            delete this;
        });
    }

    this.server.on('connection', (websocket) => {
        const client = new Client(websocket, this.sid, this.hostId);
        this.clients.set(client.cid, client);
        const host = this.host;
        if (host) host.send({type: 'server_message', sid: this.sid, payload: {type: 'connect', cid: client.cid}});
    });

    this.send = (data, cid) => {
        let parsedData = data;
        if (typeof parsedData !== 'string') parsedData = JSON.stringify(parsedData);
        if (cid && this.clients.get(cid) && this.clients.get(cid).websocket.readyState === WebSocket.OPEN) {
            this.clients.get(cid).send(parsedData);
            return true;
        } else {
            console.log('br')
            this.clients.forEach((client) => {
                if (client.websocket.readyState === WebSocket.OPEN) {
                    client.send(parsedData);
                }
            });
            return true;
        }
    }

    this.message = (payload) => {
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); }
            catch (error) { return; }
        }
        if (typeof payload !== 'object' || !payload.type) return;
        if (payload.type == 'send') {
            if (payload.payload) {
                this.send(payload.payload, payload.cid);
            }
        }
        if (payload.type == 'broadcast') {
            console.log('broadcasting')
            if (payload.payload) {
                this.send(payload.payload);
            }
        }
    }

    this.close = () => {
        this.server.close();
        this.clients.forEach((client) => {
            client.websocket.close();
        });
        servers_ref.delete(this.sid);
        delete this;
    };

    return this;
}

module.exports = WSServer;
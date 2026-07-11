const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 51738 });

/**@type {Map<string, HostConnection>} */
let connections = new Map();

/**@type {Map<string, WSServer>} */
const servers = new Map();


generateUniqueId = () => {
    return Math.random().toString(36).substring(2, 19);
}

/** @param {WebSocket} WebSocket */
function HostConnection(websocket) {
    this.websocket = websocket;
    this.id = generateUniqueId();
    this.servers = new Map();

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

    this.send({type: 'welcome', id: this.id});

    this.websocket.on('message', (m) => handleMessage(this, m.toString()));
    this.websocket.on('close', (m) => {
        console.log('Host Client disconnected', this.id);
        connections.delete(this.id);
        delete this;
    });

    connections.set(this.id, this);

    return this
}

/** @param {string} hid */
function WSServer(hid) {
    this.sid = generateUniqueId();
    this.hostId = hid;
    this.port = 0;
    this.server = null;

    ready = false;
    onReady = [];
    
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
            const host = connections.get(this.hid);
            if (host) host.send({type: 'server_message', sid: this.sid, payload: {type: 'message', cid: this.cid, payload: message}});
        });

        this.websocket.on('close', (m) => {
            console.log('WS Server Client disconnected', this.cid);
            servers.get(this.sid).clients.delete(this.cid);
            const host = connections.get(this.hostId);
            if (host) host.send({type: 'server_message', sid: this.sid, payload: {type: 'disconnect', cid: this.cid}});
            delete this;
        });
    }

    this.server.on('connection', (websocket) => {
        const client = new Client(websocket, this.sid, this.hostId);
        this.clients.set(client.cid, client);
        const host = connections.get(this.hostId);
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
        servers.delete(this.sid);
        delete this;
    };

    return this;
}

/** @param {string} hid */
createServer = (hid, protocol) => {
    if (protocol == 'ws') {
        return new Promise((resolve, reject) => {
            try {
                const nwss = new WSServer(hid);
                nwss.onReady(() => {
                    servers.set(nwss.sid, nwss);
                    resolve({sid: nwss.sid, port: nwss.port});
                })
            } catch (error) {
                reject(error);
            }
        })
    }
}

/** @type {function(HostConnection, string)} */
handleMessage = (hc, message) => {
    let data = message;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); }
        catch (error) { return; }
    }
    if (!data || typeof data !== 'object' || !data.type) return;
    if (!data.id || data.id != hc.id) return;
    switch (data.type) {
        case 'ping':
            hc.send({ type: 'pong', pid: data.pid });
            break;

        case 'create_server':
            config = data.config;
            protocol = data.protocol;
            if (protocol) {
                createServer(hc.id, protocol).then(({sid, port}) => {
                    hc.send({type: 'server_created', pid: data.pid, sid: sid, port: port, protocol: protocol, config: config});
                }).catch((err) => {
                    hc.send({type: 'error', error: 'create_server:internal', message: 'Error while creating server', error_message: err.message, pid: data.pid});
                })
            }
            else {
                hc.send({type: 'error', error: 'create_server:protocol', message: 'Invalid protocol', pid: data.pid});
            }
            break;
        
        case 'close_server':
            if (data.sid) {
                const server = servers.get(data.sid);
                if (server && server.id === hc.id) {
                    server.close();
                    servers.delete(data.sid);
                    hc.send({type: 'server_closed', pid: data.pid, sid: data.sid});
                }
                else {
                    hc.send({type: 'error', error: 'close_server:not_found', message: 'Server not found', pid: data.pid});
                }
            } else {
                hc.send({type: 'error', error: 'close_server:not_found', message: 'Server not found', pid: data.pid});
            }
            break;
        
        case 'message_server':
            const server = servers.get(data.sid);
            if (server && server.hostId === hc.id) {
                server.message(data.payload);
                hc.send({type: 'message_server_sent', pid: data.pid, sid: data.sid});
            } else {
                hc.send({type: 'error', error: 'message_server:not_found', message: 'Server not found', pid: data.pid});
            }
            break;
            
        default:
            hc.send({type: 'error', error: 'unknown_command', message: 'Unknown command', pid: data.pid});
            break;
    }
}

wss.on('connection', (ws) => {
    console.log('New host connected');
    new HostConnection(ws);
});
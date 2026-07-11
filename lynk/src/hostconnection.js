const { generateUniqueId } = require('./utils.js');
const handleMessage = require('./messagehandler.js');

/**@type {Map<string, HostConnection>} */
let connections = new Map();

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

module.exports = { connections, HostConnection }
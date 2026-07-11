const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 51738 });
const { HostConnection } = require('./hostconnection.js');

wss.on('connection', (ws) => {
    console.log('New host connected');
    new HostConnection(ws);
});
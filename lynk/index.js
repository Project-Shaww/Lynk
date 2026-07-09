const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 51738 });
let connections = new Map();

generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 9);
}

wss.on('connection', (ws) => {
    console.log('New client connected');
    const id = generateUniqueId();
    connections.set(generateUniqueId(), ws);

    ws.send(JSON.stringify({type: 'welcome', connectionId: id}));

    ws.on('message', (message) => {
        console.log(`Received: ${message}`);
        ws.send(`Server received: ${message}`);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        connections.delete(id);
    });
});
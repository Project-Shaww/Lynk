const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 51738 });
let connections = new Map();

generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 9);
}

/**@type {function(WebSocket, string)} */
handleMessage = (ws, message) => {
    let data = message;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); }
        catch (error) { return; }
    }
    if (!data || typeof data !== 'object' || !data.type) return;
    if (!data.id || data.id != ws.c.id) return;
    switch (data.type) {
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong', pid: data.pid }));
    }
}

wss.on('connection', (ws) => {
    console.log('New client connected');
    const id = generateUniqueId();
    connections.set(generateUniqueId(), ws);
    ws.c = {}
    ws.c.id = id;

    ws.send(JSON.stringify({type: 'welcome', connectionId: id}));

    ws.on('message', (message) => {
        handleMessage(ws, message.toString());
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        connections.delete(id);
    });
});
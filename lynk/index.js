const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 51738 });

/**@type {Map<string, WebSocket>} */
let connections = new Map();

/**@type {Map<string, {id: string, sid: string, protocol: 'http' | 'ws', port: number, server: WebSocket.Server}>} */
const servers = new Map();

generateUniqueId = () => {
    return Math.random().toString(36).substring(2, 19);
}

createServer = (cws, protocol) => {
    if (protocol == 'ws') {
        return new Promise((resolve, reject) => {
            try {
                const nwss = new WebSocket.Server({port: 0}, () => {
                    const sid = generateUniqueId();
                    servers.set(sid, {id: cws.c.id, sid: sid, protocol: 'ws', port: nwss.address().port, server: nwss});
                    resolve({sid: sid, port: nwss.address().port});
                });
                nwss.on('error', (err) => reject(err));
                nwss.on('connection', (ws) => {
                    console.log('New client connected');
                    ws.send('Welcome to my server!');
                    ws.on('message', (message) => {
                        console.log('New message', message);
                        ws.send('Received message: ' + message);
                    });
                    ws.on('close', () => {
                        console.log('Client disconnected');
                    });
                });
            } catch (error) {
                reject(error);
            }
        })
    }
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
            break;

        case 'create_server':
            const config = data.config;
            const protocol = data.protocol;
            if (protocol) {
                createServer(ws, protocol).then(({sid, port}) => {
                    ws.send(JSON.stringify({type: 'server_created', pid: data.pid, sid: sid, port: port, protocol: protocol, config: config}));
                }).catch((err) => {
                    ws.send(JSON.stringify({type: 'error', error: 'create_server:internal', message: 'Error while creating server', error_message: err.message, pid: data.pid}));
                })
            }
            else {
                ws.send(JSON.stringify({type: 'error', error: 'create_server:protocol', message: 'Invalid protocol', pid: data.pid}));
            }
            break;
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
        console.log('Closing servers for client: ' + id);
        servers.forEach((server, sid) => {
            console.log('Checking server: ' + sid);
            if (server.id === id) {
                console.log('Closing server: ' + sid);
                server.server.close();
                servers.delete(sid);
            }
        });
        connections.delete(id);
    });
});
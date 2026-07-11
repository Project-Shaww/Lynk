const { createServer, servers } = require('./server/index.js');
const HostConnection = require('./hostconnection.js');

/** @type {function(HostConnection, string)} */
function handleMessage(hc, message) {
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
            const config = data.config;
            const protocol = data.protocol;
            if (protocol) {
                createServer(hc, protocol).then(({sid, port}) => {
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

module.exports = handleMessage
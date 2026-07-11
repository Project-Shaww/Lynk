const WSServer = require('./ws_server.js');
const HTTPServer = require('./http_server.js')

/**@type {Map<string, WSServer | HTTPServer>} */
const servers = new Map();

/**
 * @param {HostConnection} host
 * @param {string} protocol
 * @return {Promise<{sid: string, port: number}>}
 */
function createServer (host, protocol) {
    return new Promise((resolve, reject) => {
        switch (protocol) {
            case 'ws': {
                try {
                    const server = new WSServer(host, servers);
                    server.onReady(() => {
                        servers.set(server.sid, server);
                        resolve({sid: server.sid, port: server.port});
                    })
                } catch (error) {
                    reject(error);
                }
                break;
            }
            case 'http': {
                try {
                    const server = new HTTPServer(host, servers);
                    server.onReady(() => {
                        servers.set(server.sid, server);
                        resolve({sid: server.sid, port: server.port});
                    })
                } catch (error) {
                    reject(error);
                }
                break;
            }
            default: {
                reject(new Error('Invalid protocol'));
                break;
            }
        }
    })
}

module.exports = { createServer, servers }
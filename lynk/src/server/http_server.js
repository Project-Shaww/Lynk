const HTTP = require('node:http');
const { generateUniqueId } = require('../utils.js');

/**
 * @param {HostConnection} host
 * @param {Map<string, any>} servers_ref
 */
function HTTPServer(host, servers_ref) {
    this.sid = generateUniqueId();
    this.hostId = host.id;
    this.host = host;
    this.port = 0;
    this.server = null;

    /**@type {Map<number, HTTP.ServerResponse>} */
    this.requests = new Map();
    this.rid = 0;

    this.ready = false;
    let onReady = [];
    
    this.server = HTTP.createServer((req, res) => {
        const rid = this.rid++;
        this.requests.set(rid, res);

        let body = null;

        req.on('data', (chunk) => {
            if (!body) body = '';
            body += chunk;
        });
        
        req.on('end', () => {
            this.requests.set(rid, res);
            const host = this.host;
            if (host) host.send({type: 'server_message', sid: this.sid,
                payload: {type: 'request',
                    rid: rid, 
                    method: req.method, 
                    url: req.url,
                    headers: req.headers, 
                    body: body
                }
            });
        });
    });

    this.onReady = (cb) => {
        if (this.ready) {
            cb();
        } else {
            onReady.push(cb);
        }
    }

    this.message = (payload) => {
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); }
            catch (error) { return; }
        }
        if (typeof payload !== 'object' || !payload.type) return;
        if (payload.type == 'response') {
            console.log(payload)
            const res = this.requests.get(payload.rid);
            if (res) {
                res.writeHead(payload.status, payload.headers);
                res.end(payload.body);
                this.requests.delete(payload.rid);
            }
        }
    }

    this.close = () => {
        this.server.close();
        servers_ref.delete(this.sid);
        delete this;
    };

    this.server.listen(0, () => {
        this.port = this.server.address().port;
        this.ready = true;
        console.log('HTTP Server Created', this.sid, 'on port', this.port);
        onReady.forEach((callback) => {
            callback();
        });
        onReady = [];
    });

    return this;
}

module.exports = HTTPServer
const http = require('http');
const readline = require('readline');

const args = process.argv.slice(2);
const protocolIndex = args.indexOf('--protocol');
const protocol = protocolIndex >= 0 ? args[protocolIndex + 1] : 'ws';

if (protocol !== 'http') {
  console.error('This example only implements protocol "http"');
  process.exit(1);
}

const server = http.createServer();
var requests = new Map();
var rid = 0;

server.addListener("request", (req, res) => {
    const _rid = rid++;
    requests.set(_rid, res);

    let body = null;

    req.on('data', (chunk) => {
        if (!body) body = '';
        body += chunk;
    });
    
    req.on('end', () => {
        process.stdout.write(JSON.stringify({type: 'request',
            rid: _rid, 
            method: req.method, 
            url: req.url,
            headers: req.headers, 
            body: body
        }) + '\n');
    });
})

server.listen(0, () => {
  const port = server.address().port;
  process.stdout.write(JSON.stringify({ type: 'ready', port: port, pid: process.pid }) + '\n');
});

// read stdin JSON-lines to send commands to clients
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  // The service may send either raw payload lines (string) or JSON control messages.
  try {
    const v = JSON.parse(line);
    // JSON control message
    if (v && v.type === 'message') {
      const payload = JSON.parse(v.payload);
      if (payload.type == 'response') {
        const res = requests.get(payload.rid);
        if (res) {
          res.writeHead(payload.status, payload.headers);
          res.end(payload.body);
          requests.delete(payload.rid);
        }
      }
    }

    if (v && v.type === 'close') {
      // graceful shutdown
      process.exit(0);
    }
  } catch (e) {}
});
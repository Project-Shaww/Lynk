#!/usr/bin/env node
// Example subprocess implementing the JSON-lines protocol for `ws` protocol.
// Usage: node ws_server.js --protocol ws

const WebSocket = require('ws');
const http = require('http');
const readline = require('readline');

const args = process.argv.slice(2);
const protocolIndex = args.indexOf('--protocol');
const protocol = protocolIndex >= 0 ? args[protocolIndex + 1] : 'ws';

if (protocol !== 'ws') {
  console.error('This example only implements protocol "ws"');
  process.exit(1);
}

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// map client id -> socket
const clients = new Map();

wss.on('connection', (ws) => {
  const cid = Math.random().toString(36).slice(2, 10);
  clients.set(cid, ws);
  process.stdout.write(JSON.stringify({ type: 'connect', cid }) + '\n');

  ws.on('message', (m) => {
    const message = m.toString();
    // emit message event with cid so the Rust service can forward to host
    process.stdout.write(JSON.stringify({ type: 'message', cid, payload: message }) + '\n');
  });

  ws.on('close', () => {
    clients.delete(cid);
    process.stdout.write(JSON.stringify({ type: 'disconnect', cid }) + '\n');
  });
});

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
      const sendValue = payload ? (payload.payload || '') : '';
      if (payload && payload.cid && payload.type == 'message') {
        const target = clients.get(payload.cid);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(sendValue);
        }
      } else if (payload && payload.type == 'broadcast') {
        for (const [_, c] of clients) {
          if (c.readyState === WebSocket.OPEN) {
            c.send(sendValue);
          }
        }
      }
    }

    if (v && v.type === 'close') {
      // graceful shutdown
      for (const [_, c] of clients) {
        if (c.readyState === WebSocket.OPEN) {
          c.close();
        }
      }
      process.exit(0);
    }
  } catch (e) {
    // not JSON: treat as raw payload string (broadcast)
    for (const [_, c] of clients) {
      if (c.readyState === WebSocket.OPEN) c.send(line);
    }
  }
});

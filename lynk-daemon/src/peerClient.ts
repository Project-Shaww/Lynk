import { WebSocket } from "ws";
import type { HostToPeer, PeerToHost, RoomCode } from "./types.js";

interface Callbacks {
  onWelcome: (peerId: string, peers: string[]) => void;
  onRejected: (reason: string) => void;
  onPeerJoined: (peerId: string) => void;
  onPeerLeft: (peerId: string) => void;
  onMessage: (from: string, data: unknown) => void;
  onClose: () => void;
}

export interface JoinedConnection {
  socket: WebSocket;
  send: (msg: PeerToHost) => void;
}

/** Se conecta al servidor de peers del daemon host descubierto por UDP y hace el handshake. */
export function connectToHost(hostIp: string, peerPort: number, code: RoomCode, cb: Callbacks): JoinedConnection {
  const socket = new WebSocket(`ws://${hostIp}:${peerPort}`);

  socket.on("open", () => {
    socket.send(JSON.stringify({ type: "handshake", code } satisfies PeerToHost));
  });

  socket.on("message", (raw) => {
    let msg: HostToPeer;
    try {
      msg = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }
    switch (msg.type) {
      case "welcome":
        cb.onWelcome(msg.peerId, msg.peers);
        break;
      case "rejected":
        cb.onRejected(msg.reason);
        break;
      case "peerJoined":
        cb.onPeerJoined(msg.peerId);
        break;
      case "peerLeft":
        cb.onPeerLeft(msg.peerId);
        break;
      case "message":
        cb.onMessage(msg.from, msg.data);
        break;
    }
  });

  socket.on("close", () => cb.onClose());
  socket.on("error", () => cb.onClose());

  return {
    socket,
    send: (msg: PeerToHost) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    },
  };
}

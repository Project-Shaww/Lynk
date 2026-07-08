import { WebSocketServer, WebSocket } from "ws";
import { PEER_PORT } from "./types.js";
import type { PeerToHost, HostToPeer } from "./types.js";
import { HostedRoom, generatePeerId } from "./rooms.js";

interface Callbacks {
  getHostedRoom: () => HostedRoom | null;
  onRemoteBroadcast: (from: string, data: unknown) => void;
  onRemoteSend: (from: string, to: string, data: unknown) => void;
  onPeerJoined: (peerId: string) => void;
  onPeerLeft: (peerId: string) => void;
}

function send(socket: WebSocket, msg: HostToPeer) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

/**
 * Arranca el servidor que escucha en la LAN (0.0.0.0:PEER_PORT). Otros daemons se conectan
 * aquí únicamente cuando este daemon está alojando la sala que buscan.
 */
export function startPeerServer(cb: Callbacks): WebSocketServer {
  const wss = new WebSocketServer({ port: PEER_PORT });

  wss.on("connection", (socket) => {
    let handshaken = false;
    let assignedPeerId: string | null = null;

    socket.on("message", (raw) => {
      let msg: PeerToHost;
      try {
        msg = JSON.parse(raw.toString("utf8"));
      } catch {
        return;
      }

      const room = cb.getHostedRoom();

      if (msg.type === "handshake") {
        if (!room || room.code !== msg.code) {
          send(socket, { type: "rejected", reason: "No se está alojando esa sala aquí" });
          socket.close();
          return;
        }
        assignedPeerId = generatePeerId();
        handshaken = true;
        room.remotePeers.set(assignedPeerId, { peerId: assignedPeerId, socket });
        send(socket, { type: "welcome", peerId: assignedPeerId, peers: room.allPeerIds().filter((p) => p !== assignedPeerId) });
        cb.onPeerJoined(assignedPeerId);
        return;
      }

      if (!handshaken || !assignedPeerId || !room) return;

      if (msg.type === "broadcast") {
        cb.onRemoteBroadcast(assignedPeerId, msg.data);
      } else if (msg.type === "send") {
        cb.onRemoteSend(assignedPeerId, msg.to, msg.data);
      }
    });

    socket.on("close", () => {
      const room = cb.getHostedRoom();
      if (assignedPeerId && room) {
        room.remotePeers.delete(assignedPeerId);
        cb.onPeerLeft(assignedPeerId);
      }
    });
  });

  return wss;
}

/** Envía un mensaje a un peer remoto concreto (usado por el host para relayar). */
export function sendToRemotePeer(room: HostedRoom, peerId: string, msg: HostToPeer) {
  const peer = room.remotePeers.get(peerId);
  if (peer) send(peer.socket, msg);
}

/** Envía un mensaje a todos los peers remotos de la sala, opcionalmente excluyendo uno. */
export function broadcastToRemotePeers(room: HostedRoom, msg: HostToPeer, exceptPeerId?: string) {
  for (const [peerId, peer] of room.remotePeers) {
    if (peerId === exceptPeerId) continue;
    send(peer.socket, msg);
  }
}

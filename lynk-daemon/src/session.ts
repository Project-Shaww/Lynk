import type { WebSocket } from "ws";
import { WebSocket as WS } from "ws";
import type { ClientToDaemon, DaemonToClient, RoomCode } from "./types.js";
import { HostedRoom, generateRoomCode, generatePeerId } from "./rooms.js";
import { discoverRoom } from "./discovery.js";
import { broadcastToRemotePeers, sendToRemotePeer } from "./peerServer.js";
import { connectToHost, type JoinedConnection } from "./peerClient.js";

function toBrowser(socket: WebSocket | null, msg: DaemonToClient) {
  if (socket && socket.readyState === WS.OPEN) socket.send(JSON.stringify(msg));
}

/**
 * Mantiene el estado de UNA sesión de navegador
 * Puede estar: inactivo, alojando una sala (host) o unido a una sala de otro (joiner).
 */
export class Session {
  browserSocket: WebSocket | null = null;
  hostedRoom: HostedRoom | null = null; // si este daemon aloja una sala
  joinedAs: { code: RoomCode; peerId: string; conn: JoinedConnection } | null = null; // si se unió a otra

  setBrowserSocket(socket: WebSocket) {
    this.browserSocket = socket;
  }

  getHostedCode(): RoomCode | null {
    return this.hostedRoom?.code ?? null;
  }

  async handleClientMessage(msg: ClientToDaemon) {
    switch (msg.type) {
      case "createRoom":
        this.createRoom();
        break;
      case "joinRoom":
        await this.joinRoom(msg.code);
        break;
      case "leaveRoom":
        this.leaveRoom();
        break;
      case "broadcast":
        this.broadcast(msg.data);
        break;
      case "send":
        this.sendTo(msg.to, msg.data);
        break;
    }
  }

  private createRoom() {
    this.leaveRoom(); // limpia cualquier estado previo
    const code = generateRoomCode();
    const peerId = generatePeerId();
    this.hostedRoom = new HostedRoom(code, peerId);
    toBrowser(this.browserSocket, { type: "roomCreated", code, peerId });
  }

  private async joinRoom(code: RoomCode) {
    this.leaveRoom();
    const found = await discoverRoom(code);
    if (!found) {
      toBrowser(this.browserSocket, { type: "joinError", reason: "Nadie aloja esa sala en esta red" });
      return;
    }
    const conn = connectToHost(found.hostIp, found.peerPort, code, {
      onWelcome: (peerId, peers) => {
        this.joinedAs = { code, peerId, conn };
        toBrowser(this.browserSocket, { type: "joined", code, peerId, peers });
      },
      onRejected: (reason) => {
        toBrowser(this.browserSocket, { type: "joinError", reason });
      },
      onPeerJoined: (peerId) => toBrowser(this.browserSocket, { type: "peerJoined", peerId }),
      onPeerLeft: (peerId) => toBrowser(this.browserSocket, { type: "peerLeft", peerId }),
      onMessage: (from, data) => toBrowser(this.browserSocket, { type: "message", from, data }),
      onClose: () => {
        if (this.joinedAs?.code === code) {
          this.joinedAs = null;
          toBrowser(this.browserSocket, { type: "left" });
        }
      },
    });
  }

  private leaveRoom() {
    if (this.hostedRoom) {
      // avisa a todos los peers remotos de que la sala se cierra, cerrando sus conexiones
      for (const peer of this.hostedRoom.remotePeers.values()) peer.socket.close();
      this.hostedRoom = null;
    }
    if (this.joinedAs) {
      this.joinedAs.conn.socket.close();
      this.joinedAs = null;
    }
  }

  private broadcast(data: unknown) {
    if (this.hostedRoom) {
      broadcastToRemotePeers(this.hostedRoom, { type: "message", from: this.hostedRoom.localPeerId, data });
    } else if (this.joinedAs) {
      this.joinedAs.conn.send({ type: "broadcast", data });
    }
  }

  private sendTo(to: string, data: unknown) {
    if (this.hostedRoom) {
      if (to === this.hostedRoom.localPeerId) return; // no te envíes a ti mismo
      sendToRemotePeer(this.hostedRoom, to, { type: "message", from: this.hostedRoom.localPeerId, data });
    } else if (this.joinedAs) {
      this.joinedAs.conn.send({ type: "send", to, data });
    }
  }

  // --- Llamado desde el peerServer cuando ESTE daemon es host y le llegan eventos remotos ---

  onRemoteBroadcast(from: string, data: unknown) {
    toBrowser(this.browserSocket, { type: "message", from, data });
    if (this.hostedRoom) broadcastToRemotePeers(this.hostedRoom, { type: "message", from, data }, from);
  }

  onRemoteSend(from: string, to: string, data: unknown) {
    if (!this.hostedRoom) return;
    if (to === this.hostedRoom.localPeerId) {
      toBrowser(this.browserSocket, { type: "message", from, data });
    } else {
      sendToRemotePeer(this.hostedRoom, to, { type: "message", from, data });
    }
  }

  onRemotePeerJoined(peerId: string) {
    toBrowser(this.browserSocket, { type: "peerJoined", peerId });
    if (this.hostedRoom) broadcastToRemotePeers(this.hostedRoom, { type: "peerJoined", peerId }, peerId);
  }

  onRemotePeerLeft(peerId: string) {
    toBrowser(this.browserSocket, { type: "peerLeft", peerId });
    if (this.hostedRoom) broadcastToRemotePeers(this.hostedRoom, { type: "peerLeft", peerId });
  }
}

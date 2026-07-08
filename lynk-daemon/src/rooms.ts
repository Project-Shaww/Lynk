import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { PeerId, RoomCode } from "./types.js";

export function generateRoomCode(): RoomCode {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para evitar confusiones ya tu sabe 
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generatePeerId(): PeerId {
  return randomUUID();
}

/** Representa una conexión remota (otro daemon) dentro de la sala que este daemon aloja. */
export interface RemotePeer {
  peerId: PeerId;
  socket: WebSocket;
}

/**
 * Estado de la sala cuando ESTE daemon es el host.
 * Solo se soporta una sala alojada a la vez por daemon.
 */
export class HostedRoom {
  code: RoomCode;
  localPeerId: PeerId; // el peer de la propia página web conectada a este daemon
  remotePeers = new Map<PeerId, RemotePeer>();

  constructor(code: RoomCode, localPeerId: PeerId) {
    this.code = code;
    this.localPeerId = localPeerId;
  }

  allPeerIds(): PeerId[] {
    return [this.localPeerId, ...this.remotePeers.keys()];
  }
}

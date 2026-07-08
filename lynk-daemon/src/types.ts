// Puertos por defecto de Lynk. Configurables por variables de entorno.
export const LOCAL_API_PORT = Number(process.env.LYNK_LOCAL_PORT ?? 7890);
export const PEER_PORT = Number(process.env.LYNK_PEER_PORT ?? 7891);
export const DISCOVERY_PORT = Number(process.env.LYNK_DISCOVERY_PORT ?? 41234);
export const DISCOVERY_TIMEOUT_MS = 2000;

export type PeerId = string;
export type RoomCode = string;

// ---- Mensajes entre la web (SDK) y el daemon local (localhost) ----

export type ClientToDaemon =
  | { type: "createRoom" }
  | { type: "joinRoom"; code: RoomCode }
  | { type: "leaveRoom" }
  | { type: "send"; to: PeerId; data: unknown }
  | { type: "broadcast"; data: unknown };

export type DaemonToClient =
  | { type: "roomCreated"; code: RoomCode; peerId: PeerId }
  | { type: "joined"; code: RoomCode; peerId: PeerId; peers: PeerId[] }
  | { type: "joinError"; reason: string }
  | { type: "peerJoined"; peerId: PeerId }
  | { type: "peerLeft"; peerId: PeerId }
  | { type: "message"; from: PeerId; data: unknown }
  | { type: "left" };

// ---- Mensajes entre daemons (por la LAN, WebSocket peer-to-peer) ----

export type PeerToHost =
  | { type: "handshake"; code: RoomCode }
  | { type: "send"; to: PeerId; data: unknown }
  | { type: "broadcast"; data: unknown };

export type HostToPeer =
  | { type: "welcome"; peerId: PeerId; peers: PeerId[] }
  | { type: "rejected"; reason: string }
  | { type: "peerJoined"; peerId: PeerId }
  | { type: "peerLeft"; peerId: PeerId }
  | { type: "message"; from: PeerId; data: unknown };

// ---- Descubrimiento por UDP ----
// Petición:  "LYNK_DISCOVER <code> <replyPort>"
// Respuesta: "LYNK_HERE <code> <peerPort>"
export const DISCOVER_PREFIX = "LYNK_DISCOVER";
export const HERE_PREFIX = "LYNK_HERE";

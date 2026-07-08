// SDK de Lynk. Se ejecuta en la página web y habla con el daemon de la propia
// máquina (ws://127.0.0.1:7890). El daemon es quien realmente descubre peers
// en la LAN y relaya los mensajes; esta clase solo expone una API cómoda.

export type PeerId = string;

export interface LynkEventMap {
  peerJoined: { peerId: PeerId };
  peerLeft: { peerId: PeerId };
  message: { from: PeerId; data: unknown };
  left: Record<string, never>;
  disconnected: Record<string, never>;
}

type Listener<K extends keyof LynkEventMap> = (payload: LynkEventMap[K]) => void;

const DEFAULT_DAEMON_URL = "ws://127.0.0.1:7890";

export class Lynk {
  private ws: WebSocket | null = null;
  // Se guarda como `any` porque un único mapa no puede expresar la relación dependiente
  // event->payload para todas las claves a la vez; la seguridad de tipos la dan on/off/emit.
  private listeners: Record<string, Set<(payload: any) => void>> = {};
  private daemonUrl: string;

  peerId: PeerId | null = null;
  roomCode: string | null = null;
  peers: PeerId[] = [];

  constructor(daemonUrl: string = DEFAULT_DAEMON_URL) {
    this.daemonUrl = daemonUrl;
  }

  /** Conecta con el daemon local. Debe llamarse (y esperarse) antes de crear/unirse a una sala. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.daemonUrl);
      this.ws = ws;

      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("No se pudo conectar con el daemon de Lynk. ¿Está corriendo?"));
      ws.onclose = () => this.emit("disconnected", {});
      ws.onmessage = (ev) => this.handleMessage(ev.data);
    });
  }

  /** Crea una sala nueva en este daemon. Devuelve el código para compartir con otros jugadores. */
  createRoom(): Promise<{ code: string; peerId: PeerId }> {
    return new Promise((resolve, reject) => {
      const onCreated = (payload: any) => {
        cleanup();
        resolve(payload);
      };
      const onError = () => {
        cleanup();
        reject(new Error("No se pudo crear la sala"));
      };
      const cleanup = () => {
        this.off("__roomCreated" as any, onCreated as any);
      };
      this.once("__roomCreated" as any, onCreated as any);
      this.send({ type: "createRoom" });
    });
  }

  /** Se une a una sala existente por código (buscada automáticamente en la LAN). */
  joinRoom(code: string): Promise<{ code: string; peerId: PeerId; peers: PeerId[] }> {
    return new Promise((resolve, reject) => {
      const onJoined = (payload: any) => {
        cleanup();
        resolve(payload);
      };
      const onError = (payload: any) => {
        cleanup();
        reject(new Error(payload?.reason ?? "No se pudo unir a la sala"));
      };
      const cleanup = () => {
        this.off("__joined" as any, onJoined as any);
        this.off("__joinError" as any, onError as any);
      };
      this.once("__joined" as any, onJoined as any);
      this.once("__joinError" as any, onError as any);
      this.send({ type: "joinRoom", code });
    });
  }

  leaveRoom() {
    this.send({ type: "leaveRoom" });
    this.roomCode = null;
    this.peerId = null;
    this.peers = [];
  }

  /** Envía datos a un peer concreto de la sala. */
  sendTo(peerId: PeerId, data: unknown) {
    this.send({ type: "send", to: peerId, data });
  }

  /** Envía datos a todos los peers de la sala. */
  broadcast(data: unknown) {
    this.send({ type: "broadcast", data });
  }

  on<K extends keyof LynkEventMap>(event: K, listener: Listener<K>) {
    (this.listeners[event] ??= new Set()).add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof LynkEventMap>(event: K, listener: Listener<K>) {
    this.listeners[event]?.delete(listener);
  }

  private once<K extends keyof LynkEventMap>(event: K, listener: Listener<K>) {
    const wrapped = (payload: LynkEventMap[K]) => {
      this.off(event, wrapped);
      listener(payload);
    };
    this.on(event, wrapped);
  }

  private emit<K extends keyof LynkEventMap>(event: K, payload: LynkEventMap[K]): void;
  private emit(event: string, payload: unknown): void;
  private emit(event: string, payload: unknown) {
    this.listeners[event]?.forEach((fn) => fn(payload));
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private handleMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "roomCreated":
        this.roomCode = msg.code;
        this.peerId = msg.peerId;
        this.peers = [];
        this.emit("__roomCreated" as any, msg);
        break;
      case "joined":
        this.roomCode = msg.code;
        this.peerId = msg.peerId;
        this.peers = msg.peers;
        this.emit("__joined" as any, msg);
        break;
      case "joinError":
        this.emit("__joinError" as any, msg);
        break;
      case "peerJoined":
        if (!this.peers.includes(msg.peerId)) this.peers.push(msg.peerId);
        this.emit("peerJoined", { peerId: msg.peerId });
        break;
      case "peerLeft":
        this.peers = this.peers.filter((p) => p !== msg.peerId);
        this.emit("peerLeft", { peerId: msg.peerId });
        break;
      case "message":
        this.emit("message", { from: msg.from, data: msg.data });
        break;
      case "left":
        this.emit("left", {});
        break;
    }
  }
}
// sinceramente ns pq documento tanto si ni yo entiendo muy bien como funciona, btw esto no funciona en mi pc jajajaj
export default Lynk;

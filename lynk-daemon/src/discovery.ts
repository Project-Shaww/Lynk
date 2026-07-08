import dgram from "node:dgram";
import os from "node:os";
import {
  DISCOVERY_PORT,
  DISCOVERY_TIMEOUT_MS,
  DISCOVER_PREFIX,
  HERE_PREFIX,
  PEER_PORT,
} from "./types.js";
import type { RoomCode } from "./types.js";

/**
 * Calcula la dirección de broadcast de cada interfaz IPv4 no interna (p.ej. 192.168.1.255
 * para una IP 192.168.1.57/255.255.255.0). Enviar al broadcast "255.255.255.255" genérico
 * no siempre sale por la interfaz correcta ni atraviesa según el firewall/router, así que
 * además se calculan las direcciones concretas de cada adaptador de red.
 */
function getBroadcastAddresses(): string[] {
  const addresses = new Set<string>();
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      const ipParts = entry.address.split(".").map(Number);
      const maskParts = entry.netmask.split(".").map(Number);
      if (ipParts.length !== 4 || maskParts.length !== 4) continue;
      const broadcastParts = ipParts.map((part, i) => (part | (~maskParts[i] & 0xff)) & 0xff);
      addresses.add(broadcastParts.join("."));
    }
  }
  addresses.add("255.255.255.255");
  return Array.from(addresses);
}

/**
 * Escucha peticiones "LYNK_DISCOVER <code>" en la LAN y responde "LYNK_HERE <code> <peerPort>"
 * únicamente si este daemon aloja actualmente esa sala. `getHostedCode` se consulta en caliente
 * para saber qué sala (si alguna) se está alojando en cada momento.
 */
export function startDiscoveryResponder(getHostedCode: () => RoomCode | null): dgram.Socket {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  socket.on("message", (msg, rinfo) => {
    const text = msg.toString("utf8").trim();
    const [prefix, code] = text.split(" ");
    if (prefix !== DISCOVER_PREFIX || !code) return;

    const hostedCode = getHostedCode();
    if (hostedCode && hostedCode === code) {
      const reply = Buffer.from(`${HERE_PREFIX} ${code} ${PEER_PORT}`, "utf8");
      socket.send(reply, rinfo.port, rinfo.address);
    }
  });

  socket.on("error", (err) => {
    console.error("[discovery] error:", err.message);
  });

  socket.bind(DISCOVERY_PORT, () => {
    socket.setBroadcast(true);
  });

  return socket;
}

/**
 * Emite "LYNK_DISCOVER <code>" (por loopback, por cada dirección de broadcast de la LAN y por
 * el broadcast genérico) y espera la primera respuesta "LYNK_HERE <code> <peerPort>". Reintenta
 * varias veces dentro del timeout para tolerar la pérdida de algún paquete UDP. Devuelve la IP
 * del host y el puerto de peers, o null si nadie responde a tiempo.
 */
export function discoverRoom(
  code: RoomCode,
  timeoutMs = DISCOVERY_TIMEOUT_MS
): Promise<{ hostIp: string; peerPort: number } | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let done = false;

    const finish = (result: { hostIp: string; peerPort: number } | null) => {
      if (done) return;
      done = true;
      clearInterval(retryTimer);
      clearTimeout(timeoutTimer);
      socket.close();
      resolve(result);
    };

    socket.on("message", (msg, rinfo) => {
      const text = msg.toString("utf8").trim();
      const [prefix, respCode, portStr] = text.split(" ");
      if (prefix !== HERE_PREFIX || respCode !== code) return;
      const peerPort = Number(portStr);
      if (!peerPort) return;
      finish({ hostIp: rinfo.address, peerPort });
    });

    socket.on("error", () => finish(null));

    const sendQuery = () => {
      const query = Buffer.from(`${DISCOVER_PREFIX} ${code}`, "utf8");
      // Loopback: cubre el caso de dos daemons de prueba en la misma máquina, sin depender
      // del firewall (el tráfico por 127.0.0.1 normalmente no se filtra).
      socket.send(query, DISCOVERY_PORT, "127.0.0.1");
      // Broadcasts reales de cada interfaz de red + el genérico 255.255.255.255.
      for (const addr of getBroadcastAddresses()) {
        socket.send(query, DISCOVERY_PORT, addr);
      }
    };

    socket.bind(() => {
      socket.setBroadcast(true);
      sendQuery();
    });

    // Reintenta cada 300ms por si se pierde algún paquete UDP.
    const retryTimer = setInterval(sendQuery, 300);
    const timeoutTimer = setTimeout(() => finish(null), timeoutMs);
  });
}

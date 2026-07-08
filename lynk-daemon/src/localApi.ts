import { WebSocketServer } from "ws";
import { LOCAL_API_PORT } from "./types.js";
import type { ClientToDaemon } from "./types.js";
import { Session } from "./session.js";

/**
 * Servidor WS en 127.0.0.1:LOCAL_API_PORT. Solo escucha en localhost: nunca expuesto a la LAN,
 * es el punto de entrada privado de la página web al daemon de su propia máquina.
 */
export function startLocalApi(session: Session): WebSocketServer {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: LOCAL_API_PORT });

  wss.on("connection", (socket) => {
    session.setBrowserSocket(socket);

    socket.on("message", (raw) => {
      let msg: ClientToDaemon;
      try {
        msg = JSON.parse(raw.toString("utf8"));
      } catch {
        return;
      }
      void session.handleClientMessage(msg);
    });
  });

  return wss;
}
// Socorro, la verdad es sencillo esta vaina solo q no sé si lo explico bien xdd
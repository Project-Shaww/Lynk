import { Lynk } from "../lynk-sdk/src/index.js";

const lynk = new Lynk();

const statusEl = document.getElementById("status")!;
const logEl = document.getElementById("log")!;
const btnCreate = document.getElementById("btnCreate") as HTMLButtonElement;
const btnJoin = document.getElementById("btnJoin") as HTMLButtonElement;
const joinCodeInput = document.getElementById("joinCode") as HTMLInputElement;
const msgInput = document.getElementById("msgInput") as HTMLInputElement;
const btnSend = document.getElementById("btnSend") as HTMLButtonElement;

function log(text: string, kind: "sys" | "err" | "in" | "out" = "sys") {
  const line = document.createElement("div");
  line.className = `log-line ${kind}`;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setInRoom(inRoom: boolean) {
  msgInput.disabled = !inRoom;
  btnSend.disabled = !inRoom;
}

function updateStatus() {
  if (lynk.roomCode) {
    statusEl.textContent = `Sala ${lynk.roomCode} · yo soy ${lynk.peerId?.slice(0, 8)} · peers: ${lynk.peers.length}`;
  } else {
    statusEl.textContent = "Conectado al daemon, sin sala";
  }
}

async function main() {
  try {
    await lynk.connect();
    log("Conectado al daemon local ✅");
    updateStatus();
  } catch (err) {
    log(`Error conectando con el daemon: ${(err as Error).message}`, "err");
    statusEl.textContent = "❌ Daemon no disponible (¿está arrancado?)";
    return;
  }

  lynk.on("peerJoined", ({ peerId }) => {
    log(`+ peer conectado: ${peerId.slice(0, 8)}`, "sys");
    updateStatus();
  });
  lynk.on("peerLeft", ({ peerId }) => {
    log(`- peer desconectado: ${peerId.slice(0, 8)}`, "sys");
    updateStatus();
  });
  lynk.on("message", ({ from, data }) => {
    log(`${from.slice(0, 8)}: ${JSON.stringify(data)}`, "in");
  });
  lynk.on("left", () => {
    log("Has salido de la sala", "sys");
    setInRoom(false);
    updateStatus();
  });
  lynk.on("disconnected", () => {
    log("Se perdió la conexión con el daemon", "err");
    setInRoom(false);
  });
}

btnCreate.addEventListener("click", async () => {
  try {
    const { code } = await lynk.createRoom();
    log(`Sala creada: ${code} — compártelo con quien quieras que se una`, "sys");
    setInRoom(true);
    updateStatus();
  } catch (err) {
    log((err as Error).message, "err");
  }
});

btnJoin.addEventListener("click", async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) return;
  try {
    log(`Buscando la sala ${code} en la LAN...`, "sys");
    await lynk.joinRoom(code);
    log(`Unido a la sala ${code}`, "sys");
    setInRoom(true);
    updateStatus();
  } catch (err) {
    log((err as Error).message, "err");
  }
});

btnSend.addEventListener("click", () => {
  const text = msgInput.value;
  if (!text) return;
  lynk.broadcast({ text });
  log(`yo: ${text}`, "out");
  msgInput.value = "";
});

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnSend.click();
});

main();

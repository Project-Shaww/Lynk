# Lynk

Un daemon que crea conexiones LAN entre navegadores para que las webs (juegos, apps colaborativas, etc.) no necesiten un servidor de pago. Un jugador aloja la partida en su propia red local; el resto se une con un código de 4 caracteres y el daemon se encarga de descubrirse y relayar los mensajes.

## Cómo encajan las piezas

```
Navegador A (host)                          Navegador B (joiner)
   │  SDK (lynk-sdk)                            │  SDK (lynk-sdk)
   │  ws://127.0.0.1:7890                        │  ws://127.0.0.1:7890
   ▼                                             ▼
Daemon A ───────────── UDP 41234 (broadcast) ──► Daemon B descubre a A
   │  ws 0.0.0.0:7891  ◄─────────────────────────┘ handshake + relay
   ▼
 relay de mensajes entre todos los peers de la sala
```

- **`lynk-daemon`** — el proceso que corre en cada máquina (Node.js + TypeScript). Expone:
  - `ws://127.0.0.1:7890` — API local, **solo** accesible desde la propia máquina. Aquí habla el SDK con el daemon.
  - `ws://0.0.0.0:7891` — puerto de peers, donde se conectan los daemons de otros jugadores cuando este daemon aloja una sala.
  - UDP `41234` — descubrimiento: cuando alguien quiere unirse a un código de sala, hace un broadcast en la LAN y quien la aloja responde con su IP.
  - Los tres puertos son configurables con las variables de entorno `LYNK_LOCAL_PORT`, `LYNK_PEER_PORT` y `LYNK_DISCOVERY_PORT` (ver `src/types.ts`).
- **`lynk-sdk`** — librería TypeScript para el navegador. Es lo único que la web necesita importar; habla con el daemon local, nunca directamente con la LAN.
- **`test-app`** — mini web de prueba (crear sala / unirse / mandar mensajes) para probar el conjunto de principio a fin.

## Decisiones de arquitectura (MVP)

Se han tomado estas decisiones para arrancar simple; están todas encapsuladas y son fáciles de cambiar más adelante:

1. **Descubrimiento: UDP broadcast bajo demanda**, no mDNS ni polling constante. El daemon solo emite un paquete cuando el usuario intenta unirse a un código, y solo responde si aloja ese código. Cero dependencias, cero ruido de red en reposo.
2. **Comunicación web↔daemon: solo WebSocket.** Un único protocolo para todo (setup y tiempo real), en vez de mezclar HTTP + WS.
3. **Rol del daemon: relay + utilidades mínimas** (código de sala, lista de peers, eventos de entrada/salida). No mete lógica de juego — cada web decide qué significan los `data` que manda — pero tampoco es un simple tubo de bytes: gestiona salas y peers para que el SDK sea agradable de usar.
4. **Topología en estrella**: el daemon que aloja la sala es el hub; todos los demás se conectan a él. Simple y suficiente para partidas pequeñas tipo LAN party. (Si en el futuro hace falta escalar a mesh completo, el cambio queda contenido en `peerServer.ts` / `peerClient.ts`.)
5. **1 pestaña de navegador = 1 daemon = 1 peer.** De momento el daemon no multiplexa varias páginas web locales a la vez; es la simplificación razonable para un MVP de "instala el daemon y juega".

## Cómo probarlo

Necesitas dos "máquinas" (pueden ser dos daemons en la misma máquina con puertos distintos, o dos ordenadores reales en la misma LAN).

```bash
# 1. Instalar y arrancar el daemon "host"
cd lynk-daemon
npm install
npm run dev

# 2. En otra terminal (u otro ordenador), un segundo daemon en otros puertos:
cd lynk-daemon
npm run dev:second   # usa cross-env por debajo, funciona igual en Windows/macOS/Linux

# 3. Compilar el SDK (genera dist/lynk-sdk.esm.js y dist/lynk-sdk.global.js)
cd ../lynk-sdk
npm install
npm run build

# 4. Compilar y servir la test-app
cd ../test-app
npm install
npm run build   # genera main.js
npm run serve   # sirve en http://localhost:5173
```

> El script `dev:second` arranca el daemon en `127.0.0.1:7990` (API local) y `0.0.0.0:7991` (peers), dejando los puertos por defecto (`7890`/`7891`) libres para el primer daemon. Si necesitas más instancias o puertos distintos, mira `lynk-daemon/package.json` y duplica el script cambiando `LYNK_LOCAL_PORT`/`LYNK_PEER_PORT`.

Abre `http://localhost:5173` en dos pestañas (o dos navegadores). En una pulsa **Crear sala** y copia el código. En la otra escribe ese código y pulsa **Unirse**. Con las dos conectadas, cualquier mensaje que mandes debería aparecer en la otra.

> Nota: si sirves la test-app desde un puerto distinto de 7890, sigue conectándose al daemon en `ws://127.0.0.1:7890` — la web y el daemon son procesos independientes en la misma máquina.

### "Nadie aloja esa sala en esta red"

Si al unirte te sale este error aunque el otro daemon esté corriendo y la sala exista, casi siempre es el **Firewall de Windows** bloqueando el tráfico UDP de descubrimiento (puerto `41234`):

- La primera vez que arrancas el daemon, Windows debería preguntar "¿Permitir que Node.js se comunique en redes...?". Marca **al menos "Redes privadas"** y acepta.
- Si ya lo bloqueaste sin querer, ve a *Firewall de Windows Defender → Aplicaciones permitidas* y busca Node.js (o `node.exe`) para habilitarlo, o crea una regla de entrada para el puerto UDP `41234`.
- El discovery ahora también prueba por `127.0.0.1` además de por la(s) dirección(es) de broadcast reales de cada adaptador de red (no solo el genérico `255.255.255.255`), y reintenta cada 300ms durante 2 segundos — esto hace que probar dos daemons en la misma máquina funcione incluso si el firewall bloquea el broadcast real hacia la LAN. Para dos máquinas distintas en la misma red sí hace falta que el firewall deje pasar ese tráfico en ambas.

ermm de hecho, esta versión no funciona en mi pc demomento, ¿pq? idk, pero tengo sueño y kiero dormir así q subo esto por subirlo xd
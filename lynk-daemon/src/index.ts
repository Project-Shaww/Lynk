import { DISCOVERY_PORT, LOCAL_API_PORT, PEER_PORT } from "./types.js";
import { Session } from "./session.js";
import { startLocalApi } from "./localApi.js";
import { startPeerServer } from "./peerServer.js";
import { startDiscoveryResponder } from "./discovery.js";

const session = new Session();

startLocalApi(session);

startPeerServer({
  getHostedRoom: () => session.hostedRoom,
  onRemoteBroadcast: (from, data) => session.onRemoteBroadcast(from, data),
  onRemoteSend: (from, to, data) => session.onRemoteSend(from, to, data),
  onPeerJoined: (peerId) => session.onRemotePeerJoined(peerId),
  onPeerLeft: (peerId) => session.onRemotePeerLeft(peerId),
});

startDiscoveryResponder(() => session.getHostedCode());

console.log(`Lynk daemon corriendo:`);
console.log(`  - API local (para la web):  ws://127.0.0.1:${LOCAL_API_PORT}`);
console.log(`  - Peers LAN (otros daemons): ws://0.0.0.0:${PEER_PORT}`);
console.log(`  - Descubrimiento UDP:        puerto ${DISCOVERY_PORT}`);

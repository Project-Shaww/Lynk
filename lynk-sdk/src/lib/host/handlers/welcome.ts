import type { Handler } from './handler.js';
const welcomeHandler: Handler = (host, data) => { host._setConnectionId(data.connectionId); }
export default welcomeHandler;
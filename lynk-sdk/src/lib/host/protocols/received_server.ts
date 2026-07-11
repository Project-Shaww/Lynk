import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';

const receivedServerHandler: Handler = (host, data): HandlerResponse => {
    if (!host.servers.has(data.sid)) return {};
    let payloadComplete = data.payload;
    payloadComplete.sid = data.sid
    return { events: [{ event: 'serverMessage', data: payloadComplete }] };
}

export default receivedServerHandler;
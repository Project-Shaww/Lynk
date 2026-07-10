import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';

const receivedServerHandler: Handler = (host, data): HandlerResponse => {
    if (!host.servers.has(data.sid)) return {};
    return { events: [{ event: 'message', data: data }] };
}

export default receivedServerHandler;
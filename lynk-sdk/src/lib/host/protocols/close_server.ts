import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';
import { ServerMap, type ServerConfig } from '../../server/index.js';

export interface CloseServerData {
    sid: string;
}

const closeServerHandler: Handler = (host, data): HandlerResponse<CloseServerData> => {
    if (!host.servers.has(data.sid)) {
        return { response: { accepted: false, data: { sid: data.sid } }, events: [{ event: 'error', data: { message: 'Server not found' } }] };
    }
    host.servers.delete(data.sid);
    return { response: { accepted: true, data: { sid: data.sid } }, events: [{ event: 'serverClosed', data: { sid: data.sid } }] };
}

export default closeServerHandler;
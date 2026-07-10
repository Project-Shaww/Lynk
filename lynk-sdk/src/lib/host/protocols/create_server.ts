import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';
import { Server, type ServerConfig, type ServerProtocol } from '../../server/server.js';

export interface CreateServerData {
    server: Server;
    sid: string;
    protocol: ServerProtocol;
    config: ServerConfig;
    port: number;
}

const createServerHandler: Handler = (host, data): HandlerResponse<CreateServerData> => {
    const server = new Server(host, data.sid, data.port, data.protocol, data.config);
    return { response: { accepted: true, data: { server: server, sid: data.sid, protocol: data.protocol, port: data.port, config: data.config } } };
}

export default createServerHandler;
import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';
import { ServerMap, type ServerConfig } from '../../server/index.js';

export interface CreateServerData<T extends keyof ServerMap> {
    server: InstanceType<ServerMap[T]>;
}

interface ServerData<T extends keyof ServerMap> {
    sid: string;
    protocol: T;
    port: number;
    config: ServerConfig;
}

const createServerHandler = (<T extends keyof ServerMap>(host: any, data: ServerData<T>): HandlerResponse<CreateServerData<T>> => {
    const server = new (ServerMap[data.protocol] as any)(host, data.sid, data.port, data.config);
    server.init();
    host.servers.set(data.sid, server);
    return { response: { accepted: true, data: { server: server } }, events: [{ event: 'serverCreated', data: { id: data.sid, protocol: data.protocol, port: data.port, config: data.config } }] };
}) as Handler;

export default createServerHandler;
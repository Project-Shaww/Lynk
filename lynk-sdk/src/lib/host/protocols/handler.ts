import type { Host } from '../host.js';
import type { HandlerResponse } from './types/response.js';

export type Handler = (host: Host, data: Record<string, any>) => HandlerResponse | void;

const handlers: Map<string, Handler> = new Map<string, Handler>();

handlers.set('error', (await import('./error.js')).default);
handlers.set('welcome', (await import('./welcome.js')).default);
handlers.set('pong', (await import('./ping.js')).default);
handlers.set('server_created', (await import('./create_server.js')).default);
handlers.set('server_closed', (await import('./close_server.js')).default);
handlers.set('server_message', (await import('./received_server.js')).default);
handlers.set('server_message_sent', (await import('./success.js')).default);
handlers.set('server_updated', (await import('./success.js')).default);

export { handlers as protocolHandlers }
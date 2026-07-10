import type { Host } from '../host.js';
import type { HandlerResponse } from './types/response.js';

export type Handler = (host: Host, message: Object & any) => HandlerResponse | void;

const handlers: Map<string, Handler> = new Map<string, Handler>();

handlers.set('welcome', (await import('./welcome.js')).default);
handlers.set('pong', (await import('./ping.js')).default)

export { handlers as protocolHandlers }
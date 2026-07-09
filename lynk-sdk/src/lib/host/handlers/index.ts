import type { Handler } from './handler.js';
const handlers: Map<string, Handler> = new Map<string, Handler>();
handlers.set('welcome', (await import('./welcome.js')).default);
handlers.set('pong', (await import('./ping.js')).default)
export default handlers;
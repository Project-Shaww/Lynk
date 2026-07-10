import type { Handler } from './handler.js';

const welcomeHandler: Handler = (host, data) => {
    return { events: [{ event: 'welcome', args: [data.connectionId] }] }
}

export default welcomeHandler;
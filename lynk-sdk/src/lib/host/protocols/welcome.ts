import type { Handler } from './handler.js';

const welcomeHandler: Handler = (host, data) => {
    return { events: [{ event: 'welcome', data: { connectionId: data.connectionId } }] }
}

export default welcomeHandler;
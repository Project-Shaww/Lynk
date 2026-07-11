import type { Handler } from './handler.js';

const welcomeHandler: Handler = (host, data) => {
    return { events: [{ event: 'welcome', data: { id: data.id } }] }
}

export default welcomeHandler;
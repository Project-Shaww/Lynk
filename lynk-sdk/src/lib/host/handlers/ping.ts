import type { Handler } from './handler.js';
const pingHandler: Handler = (host, data) => { 
    return { accepted: true, data: true };
}
export default pingHandler;
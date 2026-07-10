import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';

const pingHandler: Handler = (host, data): HandlerResponse<boolean> => {
    return { response: { accepted: true, data: true } };
}

export default pingHandler;
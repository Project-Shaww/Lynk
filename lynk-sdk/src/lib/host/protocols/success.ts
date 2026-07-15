import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';

const messageServerHandler: Handler = (host, data): HandlerResponse<boolean> => {
    return { response: { accepted: true, data: true }};
}

export default messageServerHandler;
import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';

export type PingData = boolean;

const pingHandler: Handler = (host, data): HandlerResponse<PingData> => {
    return { response: { accepted: true, data: true } };
}

export default pingHandler;
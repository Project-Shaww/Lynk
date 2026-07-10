import type { Handler } from './handler.js';
import type { HandlerResponse } from './types/response.js';

export interface ErrorData {
    error: string;
    message: string;
    error_message: string;
}

const errorHandler: Handler = (host, data): HandlerResponse<ErrorData> => {
    return { response: { accepted: false, data: { error: data.error, message: data.message, error_message: data.error_message } } };
}

export default errorHandler;
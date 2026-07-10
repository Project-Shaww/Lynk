interface ClientResponse<T = any> {
    accepted: boolean;
    data: T;
}

interface DispatchEventResponse {
    event: string;
    args: unknown[];
}

export interface HandlerResponse<T = any> {
    response?: ClientResponse<T>;
    events?: DispatchEventResponse[];
}
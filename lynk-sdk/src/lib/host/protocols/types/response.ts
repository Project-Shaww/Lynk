import { HostEvent } from "../../../types/events";

interface ClientResponse<T = any> {
    accepted: boolean;
    data: T;
}

interface DispatchEventResponse {
    event: HostEvent;
    data: Record<string, any>;
}

export interface HandlerResponse<T = any> {
    response?: ClientResponse<T>;
    events?: DispatchEventResponse[];
}
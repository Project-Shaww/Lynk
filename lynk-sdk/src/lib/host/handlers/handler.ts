import type { Host } from '../host.js';
interface hr {
    accepted: boolean;
    data: any | void | null;
}
export type Handler = (host: Host, data: Object & any) => hr | void;
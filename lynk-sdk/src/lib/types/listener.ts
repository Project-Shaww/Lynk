export interface Listener {
    name: string;
    callback: (...args: unknown[]) => void;
}
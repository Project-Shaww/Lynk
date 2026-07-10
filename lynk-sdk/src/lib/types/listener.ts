export interface Listener {
    name: string;
    callback: (data: Record<string, any>) => void;
}
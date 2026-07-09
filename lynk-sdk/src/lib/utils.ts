import { HOST, PORT } from './const.js';

export function sanitizeUrl(url: string | URL): URL {
    let surl = new URL(url);
    if (surl.host == 'localhost') surl.host = HOST;
    return surl;
}

export function getLocalUrl(path: string = ""): string {
    return `${HOST}:${PORT}${path}`;
}
const {HOST, PORT} = await import('./const.js');

export function sanitizeUrl(url) {
    let surl = new URL(url);
    if (surl.host == 'localhost') surl.host = HOST;
    return surl;
}

export function getLocalUrl(path) {
    return `${HOST}:${PORT}${path}`;
}
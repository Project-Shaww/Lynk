import { getLocalUrl } from '../utils.js';

interface Service {
    protocol: string,
    port: number,
    url: string,
    name?: string,
    type?: string,
    service_url?: string,
    version?: string,
    options?: Record<string, any>
}

/**
 * Discovers all available servers on a IP
 * @param ip - The IP address of the server
 * @returns A promise that resolves to an array of Service objects
 * 
 * @example
 * ```javascript
 * const services = await Lynk.discover_all('192.168.1.50');
 * console.log(services);
 * ```
 */
async function discover_all(ip: string): Promise<Service[]> {
    if (!ip) ip = '127.0.0.1';
    try {
        const url = new URL('http://' + getLocalUrl('/api/servers'));
        url.hostname = ip;
        const res = await fetch(url);
        if (!res.ok) return [];
        const servers = await res.json();
        var services: Service[] = [];
        servers.forEach((s: any) => {
            services.push({
                protocol: s.metadata?.protocol,
                port: s.metadata?.port,
                url: `${ip}:${s.metadata?.port}`,
                name: s.metadata?.name,
                type: s.metadata?.service,
                service_url: s.metadata?.url,
                version: s.metadata?.version,
                options: s.metadata?.options
            })
        });
        return services;
    } catch (error) {
        return [];
    }
}

/**
 * Searches for a specific service on a IP
 * @param service - The service to search for
 * @param ip - The IP address of the server
 * @returns A promise that resolves to an array of Service objects
 * 
 * @example
 * ```javascript
 * const services = await Lynk.search('lynk_chat', '192.168.1.50');
 * console.log(services);
 * ```
 */
async function search(service: string, ip: string): Promise<Service[]> {
    return (await discover_all(ip)).filter((s) => s.type == service);
}

export { discover_all, search }
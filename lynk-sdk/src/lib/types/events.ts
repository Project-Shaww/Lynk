export type HostEvent = 'connect' | 'disconnect' | 'welcome' | 'message' | 'error'
    | 'serverCreated' | 'serverClosed' | 'serverMessage';
export type ServerEvent = 'disconnected' | 'message' | 'error';
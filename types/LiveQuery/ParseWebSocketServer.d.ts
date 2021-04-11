export var __esModule: boolean;
export class ParseWebSocketServer {
    constructor(server: any, onConnect: any, config: any);
    server: any;
    close(): void;
}
declare const ParseWebSocket_base: any;
export class ParseWebSocket extends ParseWebSocket_base {
    [x: string]: any;
    constructor(ws: any);
    ws: any;
    send(message: any): void;
}
export {};

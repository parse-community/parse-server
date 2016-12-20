import logger from '../logger';

const typeMap = new Map([['disconnect', 'close']]);

export class ParseWebSocketServer {
  server: Object;

  constructor(server: any, onConnect: Function, websocketTimeout: number = 10 * 1000) {
    const WebSocketServer = require('ws').Server;
    const wss = new WebSocketServer({ server: server });
    wss.on('listening', () => {
      logger.info('Parse LiveQuery Server starts running');
    });
    wss.on('connection', (ws) => {
      onConnect(new ParseWebSocket(ws));
      // Send ping to client periodically
      const pingIntervalId = setInterval(() => {
        if (ws.readyState == ws.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingIntervalId);
        }
      }, websocketTimeout);
    });
    this.server = wss;
  }
}

export class ParseWebSocket {
  ws: any;

  constructor(ws: any) {
    this.ws = ws;
  }

  on(type: string, callback): void {
    const wsType = typeMap.has(type) ? typeMap.get(type) : type;
    this.ws.on(wsType, callback);
  }

  send(message: any): void {
    this.ws.send(message);
  }
}

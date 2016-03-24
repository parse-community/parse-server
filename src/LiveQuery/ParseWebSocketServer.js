import PLog from './PLog';

let typeMap = new Map([['disconnect', 'close']]);

export class ParseWebSocketServer {
  server: Object;

  constructor(server: any, onConnect: Function, websocketTimeout: number = 10 * 1000) {
    let WebSocketServer = require('ws').Server;
    let wss = new WebSocketServer({ server: server });
    wss.on('listening', () => {
      PLog.log('Parse LiveQuery Server starts running');
    });
    wss.on('connection', (ws) => {
      onConnect(new ParseWebSocket(ws));
      // Send ping to client periodically
      let pingIntervalId = setInterval(() => {
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
    let wsType = typeMap.has(type) ? typeMap.get(type) : type;
    this.ws.on(wsType, callback);
  }

  send(message: any, channel: string): void {
    this.ws.send(message);
  }
}

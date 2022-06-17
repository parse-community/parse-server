import { loadAdapter } from '../Adapters/AdapterLoader';
import { WSAdapter } from '../Adapters/WebSocketServer/WSAdapter';
import logger from '../logger';
import events from 'events';
import { inspect } from 'util';

export class ParseWebSocketServer {
  server: Object;

  constructor(server: any, onConnect: Function, config) {
    config.server = server;
    const wss = loadAdapter(config.wssAdapter, WSAdapter, config);
    wss.onListen = () => {
      logger.info('Parse LiveQuery Server started running');
    };
    wss.onConnection = ws => {
      ws.waitingForPong = false;
      ws.on('pong', () => {
        ws.waitingForPong = false;
      });
      ws.on('error', error => {
        logger.error(error.message);
        logger.error(inspect(ws, false));
      });
      onConnect(new ParseWebSocket(ws));
      // Send ping to client periodically
      const pingIntervalId = setInterval(() => {
        if (!ws.waitingForPong) {
          ws.ping();
          ws.waitingForPong = true;
        } else {
          clearInterval(pingIntervalId);
          ws.terminate();
        }
      }, config.websocketTimeout || 10 * 1000);
    };
    wss.onError = error => {
      logger.error(error);
    };
    wss.start();
    this.server = wss;
  }

  close() {
    if (this.server && this.server.close) {
      this.server.close();
    }
  }
}

export class ParseWebSocket extends events.EventEmitter {
  ws: any;

  constructor(ws: any) {
    super();
    ws.onmessage = request =>
      this.emit('message', request && request.data ? request.data : request);
    ws.onclose = () => this.emit('disconnect');
    this.ws = ws;
  }

  send(message: any): void {
    this.ws.send(message);
  }
}

/*eslint no-unused-vars: "off"*/
import { WSSAdapter } from './WSSAdapter';
const WebSocketServer = require('ws').Server;

/**
 * Wrapper for ws node module
 */
export class WSAdapter extends WSSAdapter {
  constructor(options: any) {
    super(options);
    this.options = options;
  }

  onListen() {}
  onConnection(ws) {}
  onError(error) {}
  start() {
    const wss = new WebSocketServer({ server: this.options.server });
    wss.on('listening', this.onListen);
    wss.on('connection', this.onConnection);
    wss.on('error', this.onError);
  }
  close() {}
}

export default WSAdapter;

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
  start() {
    const wss = new WebSocketServer({ server: this.options.server });
    wss.on('listening', this.onListen);
    wss.on('connection', this.onConnection);
  }
  close() {}
}

export default WSAdapter;

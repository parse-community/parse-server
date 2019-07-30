/*eslint no-unused-vars: "off"*/
import { WSSAdapter } from './WSSAdapter';
const WebSocketServer = require('ws').Server;

/**
 * Wrapper for ws node module
 */
export class WSAdapter extends WSSAdapter {
  constructor(options: any) {
    super(options);
    const wss = new WebSocketServer({ server: options.server });
    wss.on('listening', this.onListen);
    wss.on('connection', this.onConnection);
  }

  onListen() {}
  onConnection(ws) {}
  start() {}
  close() {}
}

export default WSAdapter;

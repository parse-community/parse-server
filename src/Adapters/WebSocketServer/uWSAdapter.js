import { WSSAdapter } from './WSSAdapter';
const uWS = require('uWebSockets.js');

/**
 * Wrapper for uWebSocket node package.
 *
 * This will create its own http/s server.
 * This has to be run with standalone live query server
 *
 * const parseLiveQueryServer = ParseServer.createLiveQueryServer(undefined, {
 *   port: 1337, // Default is 9001
 *   wssAdapter: uWSAdapter,
 * });
 */
export class uWSAdapter extends WSSAdapter {
  port: number;
  connection: any;

  constructor(options: any = {}) {
    super(options);

    // Close existing server
    const server = options.server;
    if (server) {
      server.close();
    }

    this.port = options.port || 9001;
  }

  start() {
    uWS.App().ws('/*', {
      compression: 0,
      maxPayloadLength: 16 * 1024 * 1024,
      idleTimeout: 10,
      open: (ws) => {
        this.onConnection(ws);
      },
      message: (ws, message) => {
        const request = Buffer.from(message).toString('utf8');
        ws.onmessage(request);
      },
      close: (ws) => {
        ws.onclose();
      },
    }).listen(this.port, (connection) => {
      this.connection = connection;
      if (connection) {
        this.onListen();
      } else {
        console.log('http/s server is already running. Please run this module with a standalone live query server.');
      }
    });
  }

  close() {
    if (this.connection) {
      uWS.us_listen_socket_close(this.connection);
      this.connection = null;
    }
  }
}

export default uWSAdapter;

const { ParseWebSocketServer } = require('../lib/LiveQuery/ParseWebSocketServer');
const EventEmitter = require('events');

describe('ParseWebSocketServer', function () {
  beforeEach(function (done) {
    // Mock ws server

    const mockServer = function () {
      return new EventEmitter();
    };
    jasmine.mockLibrary('ws', 'Server', mockServer);
    done();
  });

  it('can handle connect event when ws is open', function (done) {
    const onConnectCallback = jasmine.createSpy('onConnectCallback');
    const http = require('http');
    const server = http.createServer();
    const parseWebSocketServer = new ParseWebSocketServer(server, onConnectCallback, {
      websocketTimeout: 5,
    }).server;
    const ws = new EventEmitter();
    ws.readyState = 0;
    ws.OPEN = 0;
    ws.ping = jasmine.createSpy('ping');

    parseWebSocketServer.onConnection(ws);

    // Make sure callback is called
    expect(onConnectCallback).toHaveBeenCalled();
    // Make sure we ping to the client
    setTimeout(function () {
      expect(ws.ping).toHaveBeenCalled();
      server.close();
      done();
    }, 10);
  });

  it('can handle error event', async () => {
    jasmine.restoreLibrary('ws', 'Server');
    const WebSocketServer = require('ws').Server;
    let wssError;
    class WSSAdapter {
      constructor(options) {
        this.options = options;
      }
      onListen() {}
      onConnection() {}
      onError() {}
      start() {
        const wss = new WebSocketServer({ server: this.options.server });
        wss.on('listening', this.onListen);
        wss.on('connection', this.onConnection);
        wss.on('error', error => {
          wssError = error;
          this.onError(error);
        });
        this.wss = wss;
      }
    }

    const server = await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      liveQueryServerOptions: {
        wssAdapter: WSSAdapter,
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const wssAdapter = server.liveQueryServer.parseWebSocketServer.server;
    wssAdapter.wss.emit('error', 'Invalid Packet');
    expect(wssError).toBe('Invalid Packet');
  });

  afterEach(function () {
    jasmine.restoreLibrary('ws', 'Server');
  });
});

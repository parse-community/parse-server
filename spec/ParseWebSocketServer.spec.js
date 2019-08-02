const {
  ParseWebSocketServer,
} = require('../lib/LiveQuery/ParseWebSocketServer');

describe('ParseWebSocketServer', function() {
  beforeEach(function(done) {
    // Mock ws server
    const EventEmitter = require('events');
    const mockServer = function() {
      return new EventEmitter();
    };
    jasmine.mockLibrary('ws', 'Server', mockServer);
    done();
  });

  it('can handle connect event when ws is open', function(done) {
    const onConnectCallback = jasmine.createSpy('onConnectCallback');
    const http = require('http');
    const server = http.createServer();
    const parseWebSocketServer = new ParseWebSocketServer(
      server,
      onConnectCallback,
      { websocketTimeout: 5 }
    ).server;
    const ws = {
      readyState: 0,
      OPEN: 0,
      ping: jasmine.createSpy('ping'),
    };
    parseWebSocketServer.onConnection(ws);

    // Make sure callback is called
    expect(onConnectCallback).toHaveBeenCalled();
    // Make sure we ping to the client
    setTimeout(function() {
      expect(ws.ping).toHaveBeenCalled();
      server.close();
      done();
    }, 10);
  });

  afterEach(function() {
    jasmine.restoreLibrary('ws', 'Server');
  });
});

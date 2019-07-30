const { ParseWebSocketServer } = require('../lib/LiveQuery/ParseWebSocketServer');
const { uWSAdapter } = require('../lib/Adapters/WebSocketServer/uWSAdapter');

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

  it('can load wssAdapter', async () => {
    const parseServer = await reconfigureServer({
      liveQuery: {
        classNames: ['Yolo'],
      },
      liveQueryServerOptions: {
        port: 9001,
        wssAdapter: uWSAdapter,
      },
    });
    const wss = parseServer.liveQueryServer.parseWebSocketServer.server;
    expect(wss instanceof uWSAdapter).toBe(true);
    spyOn(wss, 'onConnection').and.callThrough();
    
    Parse.CoreManager.set('LIVEQUERY_SERVER_URL', 'ws://localhost:9001');

    const obj = new Parse.Object('Yolo');
    obj.set('foo', 'bar');
    await obj.save();

    const query = new Parse.Query('Yolo');
    query.equalTo('foo', 'baz');
    await query.subscribe();
    await obj.save({ foo: 'baz' });

    expect(wss.onConnection).toHaveBeenCalled();
    Parse.CoreManager.set('LIVEQUERY_SERVER_URL', Parse.serverURL);
  });

  afterEach(function() {
    jasmine.restoreLibrary('ws', 'Server');
  });
});

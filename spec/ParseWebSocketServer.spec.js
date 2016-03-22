var ParseWebSocketServer = require('../src/LiveQuery/ParseWebSocketServer').ParseWebSocketServer;

describe('ParseWebSocketServer', function() {

  beforeEach(function(done) {
    // Mock ws server
    var EventEmitter = require('events');
    var mockServer = function() {
      return new EventEmitter();
    };
    jasmine.mockLibrary('ws', 'Server', mockServer);
    done();
  });

  it('can handle connect event when ws is open', function(done) {
    var onConnectCallback = jasmine.createSpy('onConnectCallback');
    var parseWebSocketServer = new ParseWebSocketServer({}, onConnectCallback, 5).server;
    var ws = {
      readyState: 0,
      OPEN: 0,
      ping: jasmine.createSpy('ping')
    };
    parseWebSocketServer.emit('connection', ws);

    // Make sure callback is called
    expect(onConnectCallback).toHaveBeenCalled();
    // Make sure we ping to the client
    setTimeout(function() {
      expect(ws.ping).toHaveBeenCalled();
      done();
    }, 10)
  });

  afterEach(function(){
    jasmine.restoreLibrary('ws', 'Server');
  });
});

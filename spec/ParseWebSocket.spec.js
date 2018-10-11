const ParseWebSocket = require('../lib/LiveQuery/ParseWebSocketServer')
  .ParseWebSocket;

describe('ParseWebSocket', function() {
  it('can be initialized', function() {
    const ws = {};
    const parseWebSocket = new ParseWebSocket(ws);

    expect(parseWebSocket.ws).toBe(ws);
  });

  it('can handle events defined in typeMap', function() {
    const ws = {
      on: jasmine.createSpy('on'),
    };
    const callback = {};
    const parseWebSocket = new ParseWebSocket(ws);
    parseWebSocket.on('disconnect', callback);

    expect(parseWebSocket.ws.on).toHaveBeenCalledWith('close', callback);
  });

  it('can handle events which are not defined in typeMap', function() {
    const ws = {
      on: jasmine.createSpy('on'),
    };
    const callback = {};
    const parseWebSocket = new ParseWebSocket(ws);
    parseWebSocket.on('open', callback);

    expect(parseWebSocket.ws.on).toHaveBeenCalledWith('open', callback);
  });

  it('can send a message', function() {
    const ws = {
      send: jasmine.createSpy('send'),
    };
    const parseWebSocket = new ParseWebSocket(ws);
    parseWebSocket.send('message');

    expect(parseWebSocket.ws.send).toHaveBeenCalledWith('message');
  });
});

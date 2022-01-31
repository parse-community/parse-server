const ParseWebSocket = require('../lib/LiveQuery/ParseWebSocketServer').ParseWebSocket;

describe('ParseWebSocket', function () {
  it('can be initialized', function () {
    const ws = {};
    const parseWebSocket = new ParseWebSocket(ws);

    expect(parseWebSocket.ws).toBe(ws);
  });

  it('can handle disconnect event', function (done) {
    const ws = {
      onclose: () => {},
    };
    const parseWebSocket = new ParseWebSocket(ws);
    parseWebSocket.on('disconnect', () => {
      done();
    });
    ws.onclose();
  });

  it('can handle message event', function (done) {
    const ws = {
      onmessage: () => {},
    };
    const parseWebSocket = new ParseWebSocket(ws);
    parseWebSocket.on('message', () => {
      done();
    });
    ws.onmessage();
  });

  it('can send a message', function () {
    const ws = {
      send: jasmine.createSpy('send'),
    };
    const parseWebSocket = new ParseWebSocket(ws);
    parseWebSocket.send('message');

    expect(parseWebSocket.ws.send).toHaveBeenCalledWith('message');
  });
});

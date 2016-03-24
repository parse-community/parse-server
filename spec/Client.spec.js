var Client = require('../src/LiveQuery/Client').Client;
var ParseWebSocket = require('../src/LiveQuery/ParseWebSocketServer').ParseWebSocket;

describe('Client', function() {

  it('can be initialized', function() {
    var parseWebSocket = new ParseWebSocket({});
    var client = new Client(1, parseWebSocket);

    expect(client.id).toBe(1);
    expect(client.parseWebSocket).toBe(parseWebSocket);
    expect(client.subscriptionInfos.size).toBe(0);
  });

  it('can push response', function() {
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    Client.pushResponse(parseWebSocket, 'message');

    expect(parseWebSocket.send).toHaveBeenCalledWith('message');
  });

  it('can push error', function() {
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    Client.pushError(parseWebSocket, 1, 'error', true);

    var lastCall = parseWebSocket.send.calls.first();
    var messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('error');
    expect(messageJSON.error).toBe('error');
    expect(messageJSON.code).toBe(1);
    expect(messageJSON.reconnect).toBe(true);
  });

  it('can add subscription information', function() {
    var subscription = {};
    var fields = ['test'];
    var subscriptionInfo =  {
      subscription: subscription,
      fields: fields
    }
    var client = new Client(1, {});
    client.addSubscriptionInfo(1, subscriptionInfo);

    expect(client.subscriptionInfos.size).toBe(1);
    expect(client.subscriptionInfos.get(1)).toBe(subscriptionInfo);
  });

  it('can get subscription information', function() {
    var subscription = {};
    var fields = ['test'];
    var subscriptionInfo =  {
      subscription: subscription,
      fields: fields
    }
    var client = new Client(1, {});
    client.addSubscriptionInfo(1, subscriptionInfo);
    var subscriptionInfoAgain = client.getSubscriptionInfo(1);

    expect(subscriptionInfoAgain).toBe(subscriptionInfo);
  });

  it('can delete subscription information', function() {
    var subscription = {};
    var fields = ['test'];
    var subscriptionInfo =  {
      subscription: subscription,
      fields: fields
    }
    var client = new Client(1, {});
    client.addSubscriptionInfo(1, subscriptionInfo);
    client.deleteSubscriptionInfo(1);

    expect(client.subscriptionInfos.size).toBe(0);
  });


  it('can generate ParseObject JSON with null selected field', function() {
    var parseObjectJSON = {
      key : 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
    };
    var client = new Client(1, {});

    expect(client._toJSONWithFields(parseObjectJSON, null)).toBe(parseObjectJSON);
  });

  it('can generate ParseObject JSON with undefined selected field', function() {
    var parseObjectJSON = {
      key : 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
    };
    var client = new Client(1, {});

    expect(client._toJSONWithFields(parseObjectJSON, undefined)).toBe(parseObjectJSON);
  });

  it('can generate ParseObject JSON with selected fields', function() {
    var parseObjectJSON = {
      key : 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test'
    };
    var client = new Client(1, {});

    expect(client._toJSONWithFields(parseObjectJSON, ['test'])).toEqual({
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test'
    });
  });

  it('can generate ParseObject JSON with nonexistent selected fields', function() {
    var parseObjectJSON = {
      key : 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test'
    };
    var client = new Client(1, {});
    var limitedParseObject = client._toJSONWithFields(parseObjectJSON, ['name']);

    expect(limitedParseObject).toEqual({
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
    });
    expect('name' in limitedParseObject).toBe(false);
  });

  it('can push connect response', function() {
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    var client = new Client(1, parseWebSocket);
    client.pushConnect();

    var lastCall = parseWebSocket.send.calls.first();
    var messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('connected');
    expect(messageJSON.clientId).toBe(1);
  });

  it('can push subscribe response', function() {
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    var client = new Client(1, parseWebSocket);
    client.pushSubscribe(2);

    var lastCall = parseWebSocket.send.calls.first();
    var messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('subscribed');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
  });

  it('can push unsubscribe response', function() {
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    var client = new Client(1, parseWebSocket);
    client.pushUnsubscribe(2);

    var lastCall = parseWebSocket.send.calls.first();
    var messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('unsubscribed');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
  });

  it('can push create response', function() {
    var parseObjectJSON = {
      key : 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test'
    };
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    var client = new Client(1, parseWebSocket);
    client.pushCreate(2, parseObjectJSON);

    var lastCall = parseWebSocket.send.calls.first();
    var messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('create');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
    expect(messageJSON.object).toEqual(parseObjectJSON);
  });

  it('can push enter response', function() {
    var parseObjectJSON = {
      key : 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test'
    };
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    var client = new Client(1, parseWebSocket);
    client.pushEnter(2, parseObjectJSON);

    var lastCall = parseWebSocket.send.calls.first();
    var messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('enter');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
    expect(messageJSON.object).toEqual(parseObjectJSON);
  });

  it('can push update response', function() {
    var parseObjectJSON = {
      key : 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test'
    };
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    var client = new Client(1, parseWebSocket);
    client.pushUpdate(2, parseObjectJSON);

    var lastCall = parseWebSocket.send.calls.first();
    var messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('update');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
    expect(messageJSON.object).toEqual(parseObjectJSON);
  });

  it('can push leave response', function() {
    var parseObjectJSON = {
      key : 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test'
    };
    var parseWebSocket = {
      send: jasmine.createSpy('send')
    };
    var client = new Client(1, parseWebSocket);
    client.pushLeave(2, parseObjectJSON);

    var lastCall = parseWebSocket.send.calls.first();
    var messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('leave');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
    expect(messageJSON.object).toEqual(parseObjectJSON);
  });
});

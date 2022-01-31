const Client = require('../lib/LiveQuery/Client').Client;
const ParseWebSocket = require('../lib/LiveQuery/ParseWebSocketServer').ParseWebSocket;

describe('Client', function () {
  it('can be initialized', function () {
    const parseWebSocket = new ParseWebSocket({});
    const client = new Client(1, parseWebSocket);

    expect(client.id).toBe(1);
    expect(client.parseWebSocket).toBe(parseWebSocket);
    expect(client.subscriptionInfos.size).toBe(0);
  });

  it('can push response', function () {
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    Client.pushResponse(parseWebSocket, 'message');

    expect(parseWebSocket.send).toHaveBeenCalledWith('message');
  });

  it('can push error', function () {
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    Client.pushError(parseWebSocket, 1, 'error', true);

    const lastCall = parseWebSocket.send.calls.first();
    const messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('error');
    expect(messageJSON.error).toBe('error');
    expect(messageJSON.code).toBe(1);
    expect(messageJSON.reconnect).toBe(true);
  });

  it('can add subscription information', function () {
    const subscription = {};
    const fields = ['test'];
    const subscriptionInfo = {
      subscription: subscription,
      fields: fields,
    };
    const client = new Client(1, {});
    client.addSubscriptionInfo(1, subscriptionInfo);

    expect(client.subscriptionInfos.size).toBe(1);
    expect(client.subscriptionInfos.get(1)).toBe(subscriptionInfo);
  });

  it('can get subscription information', function () {
    const subscription = {};
    const fields = ['test'];
    const subscriptionInfo = {
      subscription: subscription,
      fields: fields,
    };
    const client = new Client(1, {});
    client.addSubscriptionInfo(1, subscriptionInfo);
    const subscriptionInfoAgain = client.getSubscriptionInfo(1);

    expect(subscriptionInfoAgain).toBe(subscriptionInfo);
  });

  it('can delete subscription information', function () {
    const subscription = {};
    const fields = ['test'];
    const subscriptionInfo = {
      subscription: subscription,
      fields: fields,
    };
    const client = new Client(1, {});
    client.addSubscriptionInfo(1, subscriptionInfo);
    client.deleteSubscriptionInfo(1);

    expect(client.subscriptionInfos.size).toBe(0);
  });

  it('can generate ParseObject JSON with null selected field', function () {
    const parseObjectJSON = {
      key: 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
    };
    const client = new Client(1, {});

    expect(client._toJSONWithFields(parseObjectJSON, null)).toBe(parseObjectJSON);
  });

  it('can generate ParseObject JSON with undefined selected field', function () {
    const parseObjectJSON = {
      key: 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
    };
    const client = new Client(1, {});

    expect(client._toJSONWithFields(parseObjectJSON, undefined)).toBe(parseObjectJSON);
  });

  it('can generate ParseObject JSON with selected fields', function () {
    const parseObjectJSON = {
      key: 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test',
    };
    const client = new Client(1, {});

    expect(client._toJSONWithFields(parseObjectJSON, ['test'])).toEqual({
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test',
    });
  });

  it('can generate ParseObject JSON with nonexistent selected fields', function () {
    const parseObjectJSON = {
      key: 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test',
    };
    const client = new Client(1, {});
    const limitedParseObject = client._toJSONWithFields(parseObjectJSON, ['name']);

    expect(limitedParseObject).toEqual({
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
    });
    expect('name' in limitedParseObject).toBe(false);
  });

  it('can push connect response', function () {
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    const client = new Client(1, parseWebSocket);
    client.pushConnect();

    const lastCall = parseWebSocket.send.calls.first();
    const messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('connected');
    expect(messageJSON.clientId).toBe(1);
  });

  it('can push subscribe response', function () {
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    const client = new Client(1, parseWebSocket);
    client.pushSubscribe(2);

    const lastCall = parseWebSocket.send.calls.first();
    const messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('subscribed');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
  });

  it('can push unsubscribe response', function () {
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    const client = new Client(1, parseWebSocket);
    client.pushUnsubscribe(2);

    const lastCall = parseWebSocket.send.calls.first();
    const messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('unsubscribed');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
  });

  it('can push create response', function () {
    const parseObjectJSON = {
      key: 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test',
    };
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    const client = new Client(1, parseWebSocket);
    client.pushCreate(2, parseObjectJSON);

    const lastCall = parseWebSocket.send.calls.first();
    const messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('create');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
    expect(messageJSON.object).toEqual(parseObjectJSON);
  });

  it('can push enter response', function () {
    const parseObjectJSON = {
      key: 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test',
    };
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    const client = new Client(1, parseWebSocket);
    client.pushEnter(2, parseObjectJSON);

    const lastCall = parseWebSocket.send.calls.first();
    const messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('enter');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
    expect(messageJSON.object).toEqual(parseObjectJSON);
  });

  it('can push update response', function () {
    const parseObjectJSON = {
      key: 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test',
    };
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    const client = new Client(1, parseWebSocket);
    client.pushUpdate(2, parseObjectJSON);

    const lastCall = parseWebSocket.send.calls.first();
    const messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('update');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
    expect(messageJSON.object).toEqual(parseObjectJSON);
  });

  it('can push leave response', function () {
    const parseObjectJSON = {
      key: 'value',
      className: 'test',
      objectId: 'test',
      updatedAt: '2015-12-07T21:27:13.746Z',
      createdAt: '2015-12-07T21:27:13.746Z',
      ACL: 'test',
      test: 'test',
    };
    const parseWebSocket = {
      send: jasmine.createSpy('send'),
    };
    const client = new Client(1, parseWebSocket);
    client.pushLeave(2, parseObjectJSON);

    const lastCall = parseWebSocket.send.calls.first();
    const messageJSON = JSON.parse(lastCall.args[0]);
    expect(messageJSON.op).toBe('leave');
    expect(messageJSON.clientId).toBe(1);
    expect(messageJSON.requestId).toBe(2);
    expect(messageJSON.object).toEqual(parseObjectJSON);
  });
});

'use strict';

const Parse = require('parse/node');

describe('ParseLiveQuery query operation', function () {
  beforeEach(function () {
    Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
    // Mock ParseWebSocketServer
    const mockParseWebSocketServer = jasmine.createSpy('ParseWebSocketServer');
    jasmine.mockLibrary(
      '../lib/LiveQuery/ParseWebSocketServer',
      'ParseWebSocketServer',
      mockParseWebSocketServer
    );
    // Mock Client pushError
    const Client = require('../lib/LiveQuery/Client').Client;
    Client.pushError = jasmine.createSpy('pushError');
  });

  afterEach(async function () {
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    if (client) {
      await client.close();
    }
    jasmine.restoreLibrary('../lib/LiveQuery/ParseWebSocketServer', 'ParseWebSocketServer');
  });

  function addMockClient(parseLiveQueryServer, clientId) {
    const Client = require('../lib/LiveQuery/Client').Client;
    const client = new Client(clientId, {});
    client.pushResult = jasmine.createSpy('pushResult');
    parseLiveQueryServer.clients.set(clientId, client);
    return client;
  }

  function addMockSubscription(parseLiveQueryServer, clientId, requestId, parseWebSocket, query = {}) {
    const Subscription = require('../lib/LiveQuery/Subscription').Subscription;
    const subscription = new Subscription(
      query.className || 'TestObject',
      query.where || {},
      'hash'
    );

    // Add to server subscriptions
    if (!parseLiveQueryServer.subscriptions.has(subscription.className)) {
      parseLiveQueryServer.subscriptions.set(subscription.className, new Map());
    }
    const classSubscriptions = parseLiveQueryServer.subscriptions.get(subscription.className);
    classSubscriptions.set('hash', subscription);

    // Add to client
    const client = parseLiveQueryServer.clients.get(clientId);
    const subscriptionInfo = {
      subscription: subscription,
      keys: query.keys,
    };
    if (parseWebSocket.sessionToken) {
      subscriptionInfo.sessionToken = parseWebSocket.sessionToken;
    }
    client.subscriptionInfos.set(requestId, subscriptionInfo);

    return subscription;
  }

  it('can handle query command with existing subscription', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const { ParseLiveQueryServer } = require('../lib/LiveQuery/ParseLiveQueryServer');
    const parseLiveQueryServer = new ParseLiveQueryServer({
      appId: 'test',
      masterKey: 'test',
      serverURL: Parse.serverURL
    });

    // Create test objects
    const TestObject = Parse.Object.extend('TestObject');
    const obj1 = new TestObject();
    obj1.set('name', 'object1');
    await obj1.save();

    const obj2 = new TestObject();
    obj2.set('name', 'object2');
    await obj2.save();

    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    client.hasMasterKey = true;

    // Add mock subscription
    const parseWebSocket = { clientId: 1 };
    const requestId = 2;
    const query = {
      className: 'TestObject',
      where: {},
    };
    addMockSubscription(parseLiveQueryServer, clientId, requestId, parseWebSocket, query);

    // Handle query command
    const request = {
      op: 'query',
      requestId: requestId,
    };

    await parseLiveQueryServer._handleQuery(parseWebSocket, request);

    // Verify pushResult was called
    expect(client.pushResult).toHaveBeenCalled();
    const results = client.pushResult.calls.mostRecent().args[1];
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results.some(r => r.name === 'object1')).toBe(true);
    expect(results.some(r => r.name === 'object2')).toBe(true);
  });

  it('can handle query command without clientId', async () => {
    const { ParseLiveQueryServer } = require('../lib/LiveQuery/ParseLiveQueryServer');
    const parseLiveQueryServer = new ParseLiveQueryServer({});
    const incompleteParseConn = {};
    await parseLiveQueryServer._handleQuery(incompleteParseConn, {});

    const Client = require('../lib/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle query command without subscription', async () => {
    const { ParseLiveQueryServer } = require('../lib/LiveQuery/ParseLiveQueryServer');
    const parseLiveQueryServer = new ParseLiveQueryServer({});
    const clientId = 1;
    addMockClient(parseLiveQueryServer, clientId);

    const parseWebSocket = { clientId: 1 };
    const request = {
      op: 'query',
      requestId: 999, // Non-existent subscription
    };

    await parseLiveQueryServer._handleQuery(parseWebSocket, request);

    const Client = require('../lib/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('respects field filtering (keys) when executing query', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const { ParseLiveQueryServer } = require('../lib/LiveQuery/ParseLiveQueryServer');
    const parseLiveQueryServer = new ParseLiveQueryServer({
      appId: 'test',
      masterKey: 'test',
      serverURL: Parse.serverURL
    });

    // Create test object with multiple fields
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('name', 'test');
    obj.set('color', 'blue');
    obj.set('size', 'large');
    await obj.save();

    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    client.hasMasterKey = true;

    // Add mock subscription with keys
    const parseWebSocket = { clientId: 1 };
    const requestId = 2;
    const query = {
      className: 'TestObject',
      where: {},
      keys: ['name', 'color'], // Only these fields
    };
    addMockSubscription(parseLiveQueryServer, clientId, requestId, parseWebSocket, query);

    // Handle query command
    const request = {
      op: 'query',
      requestId: requestId,
    };

    await parseLiveQueryServer._handleQuery(parseWebSocket, request);

    // Verify results
    expect(client.pushResult).toHaveBeenCalled();
    const results = client.pushResult.calls.mostRecent().args[1];
    expect(results.length).toBe(1);

    // Results should include selected fields
    expect(results[0].name).toBe('test');
    expect(results[0].color).toBe('blue');

    // Results should NOT include size
    expect(results[0].size).toBeUndefined();
  });

  it('handles query with where constraints', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const { ParseLiveQueryServer } = require('../lib/LiveQuery/ParseLiveQueryServer');
    const parseLiveQueryServer = new ParseLiveQueryServer({
      appId: 'test',
      masterKey: 'test',
      serverURL: Parse.serverURL
    });

    // Create test objects
    const TestObject = Parse.Object.extend('TestObject');
    const obj1 = new TestObject();
    obj1.set('name', 'match');
    obj1.set('status', 'active');
    await obj1.save();

    const obj2 = new TestObject();
    obj2.set('name', 'nomatch');
    obj2.set('status', 'inactive');
    await obj2.save();

    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    client.hasMasterKey = true;

    // Add mock subscription with where clause
    const parseWebSocket = { clientId: 1 };
    const requestId = 2;
    const query = {
      className: 'TestObject',
      where: { status: 'active' }, // Only active objects
    };
    addMockSubscription(parseLiveQueryServer, clientId, requestId, parseWebSocket, query);

    // Handle query command
    const request = {
      op: 'query',
      requestId: requestId,
    };

    await parseLiveQueryServer._handleQuery(parseWebSocket, request);

    // Verify results
    expect(client.pushResult).toHaveBeenCalled();
    const results = client.pushResult.calls.mostRecent().args[1];
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('match');
    expect(results[0].status).toBe('active');
  });
});

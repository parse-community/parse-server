const Parse = require('parse/node');
const ParseLiveQueryServer = require('../lib/LiveQuery/ParseLiveQueryServer')
  .ParseLiveQueryServer;
const ParseServer = require('../lib/ParseServer').default;

// Global mock info
const queryHashValue = 'hash';
const testUserId = 'userId';
const testClassName = 'TestObject';

describe('ParseLiveQueryServer', function() {
  beforeEach(function(done) {
    // Mock ParseWebSocketServer
    const mockParseWebSocketServer = jasmine.createSpy('ParseWebSocketServer');
    jasmine.mockLibrary(
      '../lib/LiveQuery/ParseWebSocketServer',
      'ParseWebSocketServer',
      mockParseWebSocketServer
    );
    // Mock Client
    const mockClient = function(id, socket, hasMasterKey) {
      this.pushConnect = jasmine.createSpy('pushConnect');
      this.pushSubscribe = jasmine.createSpy('pushSubscribe');
      this.pushUnsubscribe = jasmine.createSpy('pushUnsubscribe');
      this.pushDelete = jasmine.createSpy('pushDelete');
      this.pushCreate = jasmine.createSpy('pushCreate');
      this.pushEnter = jasmine.createSpy('pushEnter');
      this.pushUpdate = jasmine.createSpy('pushUpdate');
      this.pushLeave = jasmine.createSpy('pushLeave');
      this.addSubscriptionInfo = jasmine.createSpy('addSubscriptionInfo');
      this.getSubscriptionInfo = jasmine.createSpy('getSubscriptionInfo');
      this.deleteSubscriptionInfo = jasmine.createSpy('deleteSubscriptionInfo');
      this.hasMasterKey = hasMasterKey;
    };
    mockClient.pushError = jasmine.createSpy('pushError');
    jasmine.mockLibrary('../lib/LiveQuery/Client', 'Client', mockClient);
    // Mock Subscription
    const mockSubscriotion = function() {
      this.addClientSubscription = jasmine.createSpy('addClientSubscription');
      this.deleteClientSubscription = jasmine.createSpy(
        'deleteClientSubscription'
      );
    };
    jasmine.mockLibrary(
      '../lib/LiveQuery/Subscription',
      'Subscription',
      mockSubscriotion
    );
    // Mock queryHash
    const mockQueryHash = jasmine
      .createSpy('matchesQuery')
      .and.returnValue(queryHashValue);
    jasmine.mockLibrary(
      '../lib/LiveQuery/QueryTools',
      'queryHash',
      mockQueryHash
    );
    // Mock matchesQuery
    const mockMatchesQuery = jasmine
      .createSpy('matchesQuery')
      .and.returnValue(true);
    jasmine.mockLibrary(
      '../lib/LiveQuery/QueryTools',
      'matchesQuery',
      mockMatchesQuery
    );
    // Mock ParsePubSub
    const mockParsePubSub = {
      createPublisher: function() {
        return {
          publish: jasmine.createSpy('publish'),
          on: jasmine.createSpy('on'),
        };
      },
      createSubscriber: function() {
        return {
          subscribe: jasmine.createSpy('subscribe'),
          on: jasmine.createSpy('on'),
        };
      },
    };
    jasmine.mockLibrary(
      '../lib/LiveQuery/ParsePubSub',
      'ParsePubSub',
      mockParsePubSub
    );
    // Make mock SessionTokenCache
    const mockSessionTokenCache = function() {
      this.getUserId = function(sessionToken) {
        if (typeof sessionToken === 'undefined') {
          return Promise.resolve(undefined);
        }
        if (sessionToken === null) {
          return Promise.reject();
        }
        return Promise.resolve(testUserId);
      };
    };
    jasmine.mockLibrary(
      '../lib/LiveQuery/SessionTokenCache',
      'SessionTokenCache',
      mockSessionTokenCache
    );
    done();
  });

  it('can be initialized', function() {
    const httpServer = {};
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, httpServer);

    expect(parseLiveQueryServer.clientId).toBeUndefined();
    expect(parseLiveQueryServer.clients.size).toBe(0);
    expect(parseLiveQueryServer.subscriptions.size).toBe(0);
  });

  it('can be initialized from ParseServer', function() {
    const httpServer = {};
    const parseLiveQueryServer = ParseServer.createLiveQueryServer(
      httpServer,
      {}
    );

    expect(parseLiveQueryServer.clientId).toBeUndefined();
    expect(parseLiveQueryServer.clients.size).toBe(0);
    expect(parseLiveQueryServer.subscriptions.size).toBe(0);
  });

  it('can be initialized from ParseServer without httpServer', function(done) {
    const parseLiveQueryServer = ParseServer.createLiveQueryServer(undefined, {
      port: 22345,
    });

    expect(parseLiveQueryServer.clientId).toBeUndefined();
    expect(parseLiveQueryServer.clients.size).toBe(0);
    expect(parseLiveQueryServer.subscriptions.size).toBe(0);
    parseLiveQueryServer.server.close(done);
  });

  describe_only_db('mongo')('initialization', () => {
    it('can be initialized through ParseServer without liveQueryServerOptions', function(done) {
      const parseServer = ParseServer.start({
        appId: 'hello',
        masterKey: 'world',
        port: 22345,
        mountPath: '/1',
        serverURL: 'http://localhost:12345/1',
        liveQuery: {
          classNames: ['Yolo'],
        },
        startLiveQueryServer: true,
      });

      expect(parseServer.liveQueryServer).not.toBeUndefined();
      expect(parseServer.liveQueryServer.server).toBe(parseServer.server);
      parseServer.server.close(() => done());
    });

    it('can be initialized through ParseServer with liveQueryServerOptions', function(done) {
      const parseServer = ParseServer.start({
        appId: 'hello',
        masterKey: 'world',
        port: 22346,
        mountPath: '/1',
        serverURL: 'http://localhost:12345/1',
        liveQuery: {
          classNames: ['Yolo'],
        },
        liveQueryServerOptions: {
          port: 22347,
        },
      });

      expect(parseServer.liveQueryServer).not.toBeUndefined();
      expect(parseServer.liveQueryServer.server).not.toBe(parseServer.server);
      parseServer.liveQueryServer.server.close();
      parseServer.server.close(() => done());
    });
  });

  it('can handle connect command', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const parseWebSocket = {
      clientId: -1,
    };
    parseLiveQueryServer._validateKeys = jasmine
      .createSpy('validateKeys')
      .and.returnValue(true);
    parseLiveQueryServer._handleConnect(parseWebSocket);

    const clientKeys = parseLiveQueryServer.clients.keys();
    expect(parseLiveQueryServer.clients.size).toBe(1);
    const firstKey = clientKeys.next().value;
    expect(parseWebSocket.clientId).toBe(firstKey);
    const client = parseLiveQueryServer.clients.get(firstKey);
    expect(client).not.toBeNull();
    // Make sure we send connect response to the client
    expect(client.pushConnect).toHaveBeenCalled();
  });

  it('can handle subscribe command without clientId', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const incompleteParseConn = {};
    parseLiveQueryServer._handleSubscribe(incompleteParseConn, {});

    const Client = require('../lib/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle subscribe command with new query', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    // Handle mock subscription
    const parseWebSocket = {
      clientId: clientId,
    };
    const query = {
      className: 'test',
      where: {
        key: 'value',
      },
      fields: ['test'],
    };
    const requestId = 2;
    const request = {
      query: query,
      requestId: requestId,
      sessionToken: 'sessionToken',
    };
    parseLiveQueryServer._handleSubscribe(parseWebSocket, request);

    // Make sure we add the subscription to the server
    const subscriptions = parseLiveQueryServer.subscriptions;
    expect(subscriptions.size).toBe(1);
    expect(subscriptions.get(query.className)).not.toBeNull();
    const classSubscriptions = subscriptions.get(query.className);
    expect(classSubscriptions.size).toBe(1);
    expect(classSubscriptions.get('hash')).not.toBeNull();
    // TODO(check subscription constructor to verify we pass the right argument)
    // Make sure we add clientInfo to the subscription
    const subscription = classSubscriptions.get('hash');
    expect(subscription.addClientSubscription).toHaveBeenCalledWith(
      clientId,
      requestId
    );
    // Make sure we add subscriptionInfo to the client
    const args = client.addSubscriptionInfo.calls.first().args;
    expect(args[0]).toBe(requestId);
    expect(args[1].fields).toBe(query.fields);
    expect(args[1].sessionToken).toBe(request.sessionToken);
    // Make sure we send subscribe response to the client
    expect(client.pushSubscribe).toHaveBeenCalledWith(requestId);
  });

  it('can handle subscribe command with existing query', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Add two mock clients
    const clientId = 1;
    addMockClient(parseLiveQueryServer, clientId);
    const clientIdAgain = 2;
    const clientAgain = addMockClient(parseLiveQueryServer, clientIdAgain);
    // Add subscription for mock client 1
    const parseWebSocket = {
      clientId: clientId,
    };
    const requestId = 2;
    const query = {
      className: 'test',
      where: {
        key: 'value',
      },
      fields: ['test'],
    };
    addMockSubscription(
      parseLiveQueryServer,
      clientId,
      requestId,
      parseWebSocket,
      query
    );
    // Add subscription for mock client 2
    const parseWebSocketAgain = {
      clientId: clientIdAgain,
    };
    const queryAgain = {
      className: 'test',
      where: {
        key: 'value',
      },
      fields: ['testAgain'],
    };
    const requestIdAgain = 1;
    addMockSubscription(
      parseLiveQueryServer,
      clientIdAgain,
      requestIdAgain,
      parseWebSocketAgain,
      queryAgain
    );

    // Make sure we only have one subscription
    const subscriptions = parseLiveQueryServer.subscriptions;
    expect(subscriptions.size).toBe(1);
    expect(subscriptions.get(query.className)).not.toBeNull();
    const classSubscriptions = subscriptions.get(query.className);
    expect(classSubscriptions.size).toBe(1);
    expect(classSubscriptions.get('hash')).not.toBeNull();
    // Make sure we add clientInfo to the subscription
    const subscription = classSubscriptions.get('hash');
    // Make sure client 2 info has been added
    let args = subscription.addClientSubscription.calls.mostRecent().args;
    expect(args).toEqual([clientIdAgain, requestIdAgain]);
    // Make sure we add subscriptionInfo to the client 2
    args = clientAgain.addSubscriptionInfo.calls.mostRecent().args;
    expect(args[0]).toBe(requestIdAgain);
    expect(args[1].fields).toBe(queryAgain.fields);
  });

  it('can handle unsubscribe command without clientId', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const incompleteParseConn = {};
    parseLiveQueryServer._handleUnsubscribe(incompleteParseConn, {});

    const Client = require('../lib/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle unsubscribe command without not existed client', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const parseWebSocket = {
      clientId: 1,
    };
    parseLiveQueryServer._handleUnsubscribe(parseWebSocket, {});

    const Client = require('../lib/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle unsubscribe command without not existed query', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Add mock client
    const clientId = 1;
    addMockClient(parseLiveQueryServer, clientId);
    // Handle unsubscribe command
    const parseWebSocket = {
      clientId: 1,
    };
    parseLiveQueryServer._handleUnsubscribe(parseWebSocket, {});

    const Client = require('../lib/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle unsubscribe command', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    // Add subscription for mock client
    const parseWebSocket = {
      clientId: 1,
    };
    const requestId = 2;
    const subscription = addMockSubscription(
      parseLiveQueryServer,
      clientId,
      requestId,
      parseWebSocket
    );
    // Mock client.getSubscriptionInfo
    const subscriptionInfo = client.addSubscriptionInfo.calls.mostRecent()
      .args[1];
    client.getSubscriptionInfo = function() {
      return subscriptionInfo;
    };
    // Handle unsubscribe command
    const requestAgain = {
      requestId: requestId,
    };
    parseLiveQueryServer._handleUnsubscribe(parseWebSocket, requestAgain);

    // Make sure we delete subscription from client
    expect(client.deleteSubscriptionInfo).toHaveBeenCalledWith(requestId);
    // Make sure we delete client from subscription
    expect(subscription.deleteClientSubscription).toHaveBeenCalledWith(
      clientId,
      requestId
    );
    // Make sure we clear subscription in the server
    const subscriptions = parseLiveQueryServer.subscriptions;
    expect(subscriptions.size).toBe(0);
  });

  it('can set connect command message handler for a parseWebSocket', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Register mock connect/subscribe/unsubscribe handler for the server
    parseLiveQueryServer._handleConnect = jasmine.createSpy('_handleSubscribe');
    // Make mock parseWebsocket
    const EventEmitter = require('events');
    const parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check connect request
    const connectRequest = {
      op: 'connect',
      applicationId: '1',
    };
    // Trigger message event
    parseWebSocket.emit('message', connectRequest);
    // Make sure _handleConnect is called
    const args = parseLiveQueryServer._handleConnect.calls.mostRecent().args;
    expect(args[0]).toBe(parseWebSocket);
  });

  it('can set subscribe command message handler for a parseWebSocket', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Register mock connect/subscribe/unsubscribe handler for the server
    parseLiveQueryServer._handleSubscribe = jasmine.createSpy(
      '_handleSubscribe'
    );
    // Make mock parseWebsocket
    const EventEmitter = require('events');
    const parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check subscribe request
    const subscribeRequest = JSON.stringify({
      op: 'subscribe',
      requestId: 1,
      query: { className: 'Test', where: {} },
    });
    // Trigger message event
    parseWebSocket.emit('message', subscribeRequest);
    // Make sure _handleSubscribe is called
    const args = parseLiveQueryServer._handleSubscribe.calls.mostRecent().args;
    expect(args[0]).toBe(parseWebSocket);
    expect(JSON.stringify(args[1])).toBe(subscribeRequest);
  });

  it('can set unsubscribe command message handler for a parseWebSocket', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Register mock connect/subscribe/unsubscribe handler for the server
    parseLiveQueryServer._handleUnsubscribe = jasmine.createSpy(
      '_handleSubscribe'
    );
    // Make mock parseWebsocket
    const EventEmitter = require('events');
    const parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check unsubscribe request
    const unsubscribeRequest = JSON.stringify({
      op: 'unsubscribe',
      requestId: 1,
    });
    // Trigger message event
    parseWebSocket.emit('message', unsubscribeRequest);
    // Make sure _handleUnsubscribe is called
    const args = parseLiveQueryServer._handleUnsubscribe.calls.mostRecent()
      .args;
    expect(args[0]).toBe(parseWebSocket);
    expect(JSON.stringify(args[1])).toBe(unsubscribeRequest);
  });

  it('can set update command message handler for a parseWebSocket', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Register mock connect/subscribe/unsubscribe handler for the server
    spyOn(parseLiveQueryServer, '_handleUpdateSubscription').and.callThrough();
    spyOn(parseLiveQueryServer, '_handleUnsubscribe').and.callThrough();
    spyOn(parseLiveQueryServer, '_handleSubscribe').and.callThrough();

    // Make mock parseWebsocket
    const EventEmitter = require('events');
    const parseWebSocket = new EventEmitter();

    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check updateRequest request
    const updateRequest = JSON.stringify({
      op: 'update',
      requestId: 1,
      query: { className: 'Test', where: {} },
    });
    // Trigger message event
    parseWebSocket.emit('message', updateRequest);
    // Make sure _handleUnsubscribe is called
    const args = parseLiveQueryServer._handleUpdateSubscription.calls.mostRecent()
      .args;
    expect(args[0]).toBe(parseWebSocket);
    expect(JSON.stringify(args[1])).toBe(updateRequest);
    expect(parseLiveQueryServer._handleUnsubscribe).toHaveBeenCalled();
    const unsubArgs = parseLiveQueryServer._handleUnsubscribe.calls.mostRecent()
      .args;
    expect(unsubArgs.length).toBe(3);
    expect(unsubArgs[2]).toBe(false);
    expect(parseLiveQueryServer._handleSubscribe).toHaveBeenCalled();
  });

  it('can set missing command message handler for a parseWebSocket', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock parseWebsocket
    const EventEmitter = require('events');
    const parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check invalid request
    const invalidRequest = '{}';
    // Trigger message event
    parseWebSocket.emit('message', invalidRequest);
    const Client = require('../lib/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can set unknown command message handler for a parseWebSocket', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock parseWebsocket
    const EventEmitter = require('events');
    const parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check unknown request
    const unknownRequest = '{"op":"unknown"}';
    // Trigger message event
    parseWebSocket.emit('message', unknownRequest);
    const Client = require('../lib/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can set disconnect command message handler for a parseWebSocket which has not registered to the server', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const EventEmitter = require('events');
    const parseWebSocket = new EventEmitter();
    parseWebSocket.clientId = 1;
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Make sure we do not crash
    // Trigger disconnect event
    parseWebSocket.emit('disconnect');
  });

  it('can forward event to cloud code', function() {
    const cloudCodeHandler = {
      handler: () => {},
    };
    const spy = spyOn(cloudCodeHandler, 'handler').and.callThrough();
    Parse.Cloud.onLiveQueryEvent(cloudCodeHandler.handler);
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const EventEmitter = require('events');
    const parseWebSocket = new EventEmitter();
    parseWebSocket.clientId = 1;
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Make sure we do not crash
    // Trigger disconnect event
    parseWebSocket.emit('disconnect');
    expect(spy).toHaveBeenCalled();
    // call for ws_connect, another for ws_disconnect
    expect(spy.calls.count()).toBe(2);
  });

  // TODO: Test server can set disconnect command message handler for a parseWebSocket

  it('has no subscription and can handle object delete command', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make deletedParseObject
    const parseObject = new Parse.Object(testClassName);
    parseObject._finishFetch({
      key: 'value',
      className: testClassName,
    });
    // Make mock message
    const message = {
      currentParseObject: parseObject,
    };
    // Make sure we do not crash in this case
    parseLiveQueryServer._onAfterDelete(message, {});
  });

  it('can handle object delete command which does not match any subscription', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make deletedParseObject
    const parseObject = new Parse.Object(testClassName);
    parseObject._finishFetch({
      key: 'value',
      className: testClassName,
    });
    // Make mock message
    const message = {
      currentParseObject: parseObject,
    };

    // Add mock client
    const clientId = 1;
    addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    const requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    const client = parseLiveQueryServer.clients.get(clientId);
    // Mock _matchesSubscription to return not matching
    parseLiveQueryServer._matchesSubscription = function() {
      return false;
    };
    parseLiveQueryServer._matchesACL = function() {
      return true;
    };
    parseLiveQueryServer._onAfterDelete(message);

    // Make sure we do not send command to client
    expect(client.pushDelete).not.toHaveBeenCalled();
  });

  it('can handle object delete command which matches some subscriptions', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make deletedParseObject
    const parseObject = new Parse.Object(testClassName);
    parseObject._finishFetch({
      key: 'value',
      className: testClassName,
    });
    // Make mock message
    const message = {
      currentParseObject: parseObject,
    };
    // Add mock client
    const clientId = 1;
    addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    const requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    const client = parseLiveQueryServer.clients.get(clientId);
    // Mock _matchesSubscription to return matching
    parseLiveQueryServer._matchesSubscription = function() {
      return true;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Promise.resolve(true);
    };
    parseLiveQueryServer._onAfterDelete(message);

    // Make sure we send command to client, since _matchesACL is async, we have to
    // wait and check
    setTimeout(function() {
      expect(client.pushDelete).toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('has no subscription and can handle object save command', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    const message = generateMockMessage();
    // Make sure we do not crash in this case
    parseLiveQueryServer._onAfterSave(message);
  });

  it('can handle object save command which does not match any subscription', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    const message = generateMockMessage();
    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    const requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return not matching
    parseLiveQueryServer._matchesSubscription = function() {
      return false;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Promise.resolve(true);
    };
    // Trigger onAfterSave
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we do not send command to client
    setTimeout(function() {
      expect(client.pushCreate).not.toHaveBeenCalled();
      expect(client.pushEnter).not.toHaveBeenCalled();
      expect(client.pushUpdate).not.toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).not.toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can handle object enter command which matches some subscriptions', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    const message = generateMockMessage(true);
    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    const requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return matching
    // In order to mimic a enter, we need original match return false
    // and the current match return true
    let counter = 0;
    parseLiveQueryServer._matchesSubscription = function(parseObject) {
      if (!parseObject) {
        return false;
      }
      counter += 1;
      return counter % 2 === 0;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Promise.resolve(true);
    };
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we send enter command to client
    setTimeout(function() {
      expect(client.pushCreate).not.toHaveBeenCalled();
      expect(client.pushEnter).toHaveBeenCalled();
      expect(client.pushUpdate).not.toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).not.toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can handle object update command which matches some subscriptions', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    const message = generateMockMessage(true);
    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    const requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return matching
    parseLiveQueryServer._matchesSubscription = function(parseObject) {
      if (!parseObject) {
        return false;
      }
      return true;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Promise.resolve(true);
    };
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we send update command to client
    setTimeout(function() {
      expect(client.pushCreate).not.toHaveBeenCalled();
      expect(client.pushEnter).not.toHaveBeenCalled();
      expect(client.pushUpdate).toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).not.toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can handle object leave command which matches some subscriptions', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    const message = generateMockMessage(true);
    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    const requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return matching
    // In order to mimic a leave, we need original match return true
    // and the current match return false
    let counter = 0;
    parseLiveQueryServer._matchesSubscription = function(parseObject) {
      if (!parseObject) {
        return false;
      }
      counter += 1;
      return counter % 2 !== 0;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Promise.resolve(true);
    };
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we send leave command to client
    setTimeout(function() {
      expect(client.pushCreate).not.toHaveBeenCalled();
      expect(client.pushEnter).not.toHaveBeenCalled();
      expect(client.pushUpdate).not.toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can handle object create command which matches some subscriptions', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    const message = generateMockMessage();
    // Add mock client
    const clientId = 1;
    const client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    const requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return matching
    parseLiveQueryServer._matchesSubscription = function(parseObject) {
      if (!parseObject) {
        return false;
      }
      return true;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Promise.resolve(true);
    };
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we send create command to client
    setTimeout(function() {
      expect(client.pushCreate).toHaveBeenCalled();
      expect(client.pushEnter).not.toHaveBeenCalled();
      expect(client.pushUpdate).not.toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).not.toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can match subscription for null or undefined parse object', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock subscription
    const subscription = {
      match: jasmine.createSpy('match'),
    };

    expect(parseLiveQueryServer._matchesSubscription(null, subscription)).toBe(
      false
    );
    expect(
      parseLiveQueryServer._matchesSubscription(undefined, subscription)
    ).toBe(false);
    // Make sure subscription.match is not called
    expect(subscription.match).not.toHaveBeenCalled();
  });

  it('can match subscription', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock subscription
    const subscription = {
      query: {},
    };
    const parseObject = {};
    expect(
      parseLiveQueryServer._matchesSubscription(parseObject, subscription)
    ).toBe(true);
    // Make sure matchesQuery is called
    const matchesQuery = require('../lib/LiveQuery/QueryTools').matchesQuery;
    expect(matchesQuery).toHaveBeenCalledWith(parseObject, subscription.query);
  });

  it('can inflate parse object', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request
    const objectJSON = {
      className: 'testClassName',
      createdAt: '2015-12-22T01:51:12.955Z',
      key: 'value',
      objectId: 'BfwxBCz6yW',
      updatedAt: '2016-01-05T00:46:45.659Z',
    };
    const originalObjectJSON = {
      className: 'testClassName',
      createdAt: '2015-12-22T01:51:12.955Z',
      key: 'originalValue',
      objectId: 'BfwxBCz6yW',
      updatedAt: '2016-01-05T00:46:45.659Z',
    };
    const message = {
      currentParseObject: objectJSON,
      originalParseObject: originalObjectJSON,
    };
    // Inflate the object
    parseLiveQueryServer._inflateParseObject(message);

    // Verify object
    const object = message.currentParseObject;
    expect(object instanceof Parse.Object).toBeTruthy();
    expect(object.get('key')).toEqual('value');
    expect(object.className).toEqual('testClassName');
    expect(object.id).toBe('BfwxBCz6yW');
    expect(object.createdAt).not.toBeUndefined();
    expect(object.updatedAt).not.toBeUndefined();
    // Verify original object
    const originalObject = message.originalParseObject;
    expect(originalObject instanceof Parse.Object).toBeTruthy();
    expect(originalObject.get('key')).toEqual('originalValue');
    expect(originalObject.className).toEqual('testClassName');
    expect(originalObject.id).toBe('BfwxBCz6yW');
    expect(originalObject.createdAt).not.toBeUndefined();
    expect(originalObject.updatedAt).not.toBeUndefined();
  });

  it('can match undefined ACL', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const client = {};
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(undefined, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(true);
        done();
      });
  });

  it('can match ACL with none exist requestId', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue(undefined),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(false);
        done();
      });
  });

  it('can match ACL with public read access', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: 'sessionToken',
        }),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(true);
        done();
      });
  });

  it('can match ACL with valid subscription sessionToken', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: 'sessionToken',
        }),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(true);
        done();
      });
  });

  it('can match ACL with valid client sessionToken', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    // Mock sessionTokenCache will return false when sessionToken is undefined
    const client = {
      sessionToken: 'sessionToken',
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: undefined,
        }),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(true);
        done();
      });
  });

  it('can match ACL with invalid subscription and client sessionToken', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    // Mock sessionTokenCache will return false when sessionToken is undefined
    const client = {
      sessionToken: undefined,
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: undefined,
        }),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(false);
        done();
      });
  });

  it('can match ACL with subscription sessionToken checking error', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    // Mock sessionTokenCache will return error when sessionToken is null, this is just
    // the behaviour of our mock sessionTokenCache, not real sessionTokenCache
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: null,
        }),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(false);
        done();
      });
  });

  it('can match ACL with client sessionToken checking error', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    // Mock sessionTokenCache will return error when sessionToken is null
    const client = {
      sessionToken: null,
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: null,
        }),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(false);
        done();
      });
  });

  it("won't match ACL that doesn't have public read or any roles", function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: 'sessionToken',
        }),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(false);
        done();
      });
  });

  it("won't match non-public ACL with role when there is no user", function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setRoleReadAccess('livequery', true);
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({}),
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(false);
        done();
      });
  });

  it("won't match ACL with role based read access set to false", function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setRoleReadAccess('liveQueryRead', false);
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: 'sessionToken',
        }),
    };
    const requestId = 0;

    spyOn(Parse, 'Query').and.callFake(function() {
      return {
        equalTo() {
          // Nothing to do here
        },
        find() {
          //Return a role with the name "liveQueryRead" as that is what was set on the ACL
          const liveQueryRole = new Parse.Role();
          liveQueryRole.set('name', 'liveQueryRead');
          return [liveQueryRole];
        },
      };
    });

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(false);
        done();
      });
  });

  it('will match ACL with role based read access set to true', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setRoleReadAccess('liveQueryRead', true);
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({
          sessionToken: 'sessionToken',
        }),
    };
    const requestId = 0;

    spyOn(Parse, 'Query').and.callFake(function() {
      return {
        equalTo() {
          // Nothing to do here
        },
        find() {
          //Return a role with the name "liveQueryRead" as that is what was set on the ACL
          const liveQueryRole = new Parse.Role();
          liveQueryRole.set('name', 'liveQueryRead');
          return [liveQueryRole];
        },
      };
    });

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(true);
        done();
      });
  });

  it('can validate key when valid key is provided', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(
      {},
      {
        keyPairs: {
          clientKey: 'test',
        },
      }
    );
    const request = {
      clientKey: 'test',
    };

    expect(
      parseLiveQueryServer._validateKeys(request, parseLiveQueryServer.keyPairs)
    ).toBeTruthy();
  });

  it('can validate key when invalid key is provided', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(
      {},
      {
        keyPairs: {
          clientKey: 'test',
        },
      }
    );
    const request = {
      clientKey: 'error',
    };

    expect(
      parseLiveQueryServer._validateKeys(request, parseLiveQueryServer.keyPairs)
    ).not.toBeTruthy();
  });

  it('can validate key when key is not provided', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(
      {},
      {
        keyPairs: {
          clientKey: 'test',
        },
      }
    );
    const request = {};

    expect(
      parseLiveQueryServer._validateKeys(request, parseLiveQueryServer.keyPairs)
    ).not.toBeTruthy();
  });

  it('can validate key when validKerPairs is empty', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer({}, {});
    const request = {};

    expect(
      parseLiveQueryServer._validateKeys(request, parseLiveQueryServer.keyPairs)
    ).toBeTruthy();
  });

  it('can validate client has master key when valid', function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(
      {},
      {
        keyPairs: {
          masterKey: 'test',
        },
      }
    );
    const request = {
      masterKey: 'test',
    };

    expect(
      parseLiveQueryServer._hasMasterKey(request, parseLiveQueryServer.keyPairs)
    ).toBeTruthy();
  });

  it("can validate client doesn't have master key when invalid", function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(
      {},
      {
        keyPairs: {
          masterKey: 'test',
        },
      }
    );
    const request = {
      masterKey: 'notValid',
    };

    expect(
      parseLiveQueryServer._hasMasterKey(request, parseLiveQueryServer.keyPairs)
    ).not.toBeTruthy();
  });

  it("can validate client doesn't have master key when not provided", function() {
    const parseLiveQueryServer = new ParseLiveQueryServer(
      {},
      {
        keyPairs: {
          masterKey: 'test',
        },
      }
    );

    expect(
      parseLiveQueryServer._hasMasterKey({}, parseLiveQueryServer.keyPairs)
    ).not.toBeTruthy();
  });

  it("can validate client doesn't have master key when validKeyPairs is empty", function() {
    const parseLiveQueryServer = new ParseLiveQueryServer({}, {});
    const request = {
      masterKey: 'test',
    };

    expect(
      parseLiveQueryServer._hasMasterKey(request, parseLiveQueryServer.keyPairs)
    ).not.toBeTruthy();
  });

  it('will match non-public ACL when client has master key', function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({}),
      hasMasterKey: true,
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(true);
        done();
      });
  });

  it("won't match non-public ACL when client has no master key", function(done) {
    const parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    const client = {
      getSubscriptionInfo: jasmine
        .createSpy('getSubscriptionInfo')
        .and.returnValue({}),
      hasMasterKey: false,
    };
    const requestId = 0;

    parseLiveQueryServer
      ._matchesACL(acl, client, requestId)
      .then(function(isMatched) {
        expect(isMatched).toBe(false);
        done();
      });
  });

  afterEach(function() {
    jasmine.restoreLibrary(
      '../lib/LiveQuery/ParseWebSocketServer',
      'ParseWebSocketServer'
    );
    jasmine.restoreLibrary('../lib/LiveQuery/Client', 'Client');
    jasmine.restoreLibrary('../lib/LiveQuery/Subscription', 'Subscription');
    jasmine.restoreLibrary('../lib/LiveQuery/QueryTools', 'queryHash');
    jasmine.restoreLibrary('../lib/LiveQuery/QueryTools', 'matchesQuery');
    jasmine.restoreLibrary('../lib/LiveQuery/ParsePubSub', 'ParsePubSub');
    jasmine.restoreLibrary(
      '../lib/LiveQuery/SessionTokenCache',
      'SessionTokenCache'
    );
  });

  // Helper functions to add mock client and subscription to a liveQueryServer
  function addMockClient(parseLiveQueryServer, clientId) {
    const Client = require('../lib/LiveQuery/Client').Client;
    const client = new Client(clientId, {});
    parseLiveQueryServer.clients.set(clientId, client);
    return client;
  }

  function addMockSubscription(
    parseLiveQueryServer,
    clientId,
    requestId,
    parseWebSocket,
    query
  ) {
    // If parseWebSocket is null, we use the default one
    if (!parseWebSocket) {
      const EventEmitter = require('events');
      parseWebSocket = new EventEmitter();
    }
    parseWebSocket.clientId = clientId;
    // If query is null, we use the default one
    if (!query) {
      query = {
        className: testClassName,
        where: {
          key: 'value',
        },
        fields: ['test'],
      };
    }
    const request = {
      query: query,
      requestId: requestId,
      sessionToken: 'sessionToken',
    };
    parseLiveQueryServer._handleSubscribe(parseWebSocket, request);

    // Make mock subscription
    const subscription = parseLiveQueryServer.subscriptions
      .get(query.className)
      .get(queryHashValue);
    subscription.hasSubscribingClient = function() {
      return false;
    };
    subscription.className = query.className;
    subscription.hash = queryHashValue;
    if (
      subscription.clientRequestIds &&
      subscription.clientRequestIds.has(clientId)
    ) {
      subscription.clientRequestIds.get(clientId).push(requestId);
    } else {
      subscription.clientRequestIds = new Map([[clientId, [requestId]]]);
    }
    return subscription;
  }

  // Helper functiosn to generate request message
  function generateMockMessage(hasOriginalParseObject) {
    const parseObject = new Parse.Object(testClassName);
    parseObject._finishFetch({
      key: 'value',
      className: testClassName,
    });
    const message = {
      currentParseObject: parseObject,
    };
    if (hasOriginalParseObject) {
      const originalParseObject = new Parse.Object(testClassName);
      originalParseObject._finishFetch({
        key: 'originalValue',
        className: testClassName,
      });
      message.originalParseObject = originalParseObject;
    }
    return message;
  }
});

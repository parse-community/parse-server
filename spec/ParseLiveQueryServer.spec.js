var Parse = require('parse/node');
var ParseLiveQueryServer = require('../src/LiveQuery/ParseLiveQueryServer').ParseLiveQueryServer;

// Global mock info
var queryHashValue = 'hash';
var testUserId = 'userId';
var testClassName = 'TestObject';

describe('ParseLiveQueryServer', function() {
  beforeEach(function(done) {
    // Mock ParseWebSocketServer
    var mockParseWebSocketServer = jasmine.createSpy('ParseWebSocketServer');
    jasmine.mockLibrary('../src/LiveQuery/ParseWebSocketServer', 'ParseWebSocketServer', mockParseWebSocketServer);
    // Mock Client
    var mockClient = function() {
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
    }
    mockClient.pushError = jasmine.createSpy('pushError');
    jasmine.mockLibrary('../src/LiveQuery/Client', 'Client', mockClient);
    // Mock Subscription
    var mockSubscriotion = function() {
      this.addClientSubscription = jasmine.createSpy('addClientSubscription');
      this.deleteClientSubscription = jasmine.createSpy('deleteClientSubscription');
    }
    jasmine.mockLibrary('../src/LiveQuery/Subscription', 'Subscription', mockSubscriotion);
    // Mock queryHash
    var mockQueryHash = jasmine.createSpy('matchesQuery').and.returnValue(queryHashValue);
    jasmine.mockLibrary('../src/LiveQuery/QueryTools', 'queryHash', mockQueryHash);
    // Mock matchesQuery
    var mockMatchesQuery = jasmine.createSpy('matchesQuery').and.returnValue(true);
    jasmine.mockLibrary('../src/LiveQuery/QueryTools', 'matchesQuery', mockMatchesQuery);
    // Mock tv4
    var mockValidate = function() {
      return true;
    }
    jasmine.mockLibrary('tv4', 'validate', mockValidate);
    // Mock ParsePubSub
    var mockParsePubSub = {
      createPublisher: function() {
        return {
          publish: jasmine.createSpy('publish'),
          on: jasmine.createSpy('on')
        }
      },
      createSubscriber: function() {
        return {
          subscribe: jasmine.createSpy('subscribe'),
          on: jasmine.createSpy('on')
        }
      }
    };
    jasmine.mockLibrary('../src/LiveQuery/ParsePubSub', 'ParsePubSub', mockParsePubSub);
    // Make mock SessionTokenCache
    var mockSessionTokenCache = function(){
      this.getUserId = function(sessionToken){
        if (typeof sessionToken === 'undefined') {
          return Parse.Promise.as(undefined);
        }
        if (sessionToken === null) {
          return Parse.Promise.error();
        }
        return Parse.Promise.as(testUserId);
      };
    };
    jasmine.mockLibrary('../src/LiveQuery/SessionTokenCache', 'SessionTokenCache', mockSessionTokenCache);
    done();
  });

  it('can be initialized', function() {
    var httpServer = {};
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, httpServer);

    expect(parseLiveQueryServer.clientId).toBe(0);
    expect(parseLiveQueryServer.clients.size).toBe(0);
    expect(parseLiveQueryServer.subscriptions.size).toBe(0);
  });

  it('can handle connect command', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var parseWebSocket = {
      clientId: -1
    };
    parseLiveQueryServer._validateKeys = jasmine.createSpy('validateKeys').and.returnValue(true);
    parseLiveQueryServer._handleConnect(parseWebSocket);

    expect(parseLiveQueryServer.clientId).toBe(1);
    expect(parseWebSocket.clientId).toBe(0);
    var client = parseLiveQueryServer.clients.get(0);
    expect(client).not.toBeNull();
    // Make sure we send connect response to the client
    expect(client.pushConnect).toHaveBeenCalled();
  });

  it('can handle subscribe command without clientId', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var incompleteParseConn = {
    };
    parseLiveQueryServer._handleSubscribe(incompleteParseConn, {});

    var Client = require('../src/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle subscribe command with new query', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Add mock client
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    // Handle mock subscription
    var parseWebSocket = {
      clientId: clientId
    };
    var query = {
      className: 'test',
      where: {
        key: 'value'
      },
      fields: [ 'test' ]
    }
    var requestId = 2;
    var request = {
      query: query,
      requestId: requestId,
      sessionToken: 'sessionToken'
    }
    parseLiveQueryServer._handleSubscribe(parseWebSocket, request);

    // Make sure we add the subscription to the server
    var subscriptions = parseLiveQueryServer.subscriptions;
    expect(subscriptions.size).toBe(1);
    expect(subscriptions.get(query.className)).not.toBeNull();
    var classSubscriptions = subscriptions.get(query.className);
    expect(classSubscriptions.size).toBe(1);
    expect(classSubscriptions.get('hash')).not.toBeNull();
    // TODO(check subscription constructor to verify we pass the right argument)
    // Make sure we add clientInfo to the subscription
    var subscription = classSubscriptions.get('hash');
    expect(subscription.addClientSubscription).toHaveBeenCalledWith(clientId, requestId);
    // Make sure we add subscriptionInfo to the client
    var args = client.addSubscriptionInfo.calls.first().args;
    expect(args[0]).toBe(requestId);
    expect(args[1].fields).toBe(query.fields);
    expect(args[1].sessionToken).toBe(request.sessionToken);
    // Make sure we send subscribe response to the client
    expect(client.pushSubscribe).toHaveBeenCalledWith(requestId);
  });

  it('can handle subscribe command with existing query', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Add two mock clients
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    var clientIdAgain = 2;
    var clientAgain = addMockClient(parseLiveQueryServer, clientIdAgain);
    // Add subscription for mock client 1
    var parseWebSocket = {
      clientId: clientId
    };
    var requestId = 2;
    var query = {
      className: 'test',
      where: {
        key: 'value'
      },
      fields: [ 'test' ]
    }
    addMockSubscription(parseLiveQueryServer, clientId, requestId, parseWebSocket, query);
    // Add subscription for mock client 2
    var parseWebSocketAgain = {
      clientId: clientIdAgain
    };
    var queryAgain = {
      className: 'test',
      where: {
        key: 'value'
      },
      fields: [ 'testAgain' ]
    }
    var requestIdAgain = 1;
    addMockSubscription(parseLiveQueryServer, clientIdAgain, requestIdAgain, parseWebSocketAgain, queryAgain);

    // Make sure we only have one subscription
    var subscriptions = parseLiveQueryServer.subscriptions;
    expect(subscriptions.size).toBe(1);
    expect(subscriptions.get(query.className)).not.toBeNull();
    var classSubscriptions = subscriptions.get(query.className);
    expect(classSubscriptions.size).toBe(1);
    expect(classSubscriptions.get('hash')).not.toBeNull();
    // Make sure we add clientInfo to the subscription
    var subscription = classSubscriptions.get('hash');
    // Make sure client 2 info has been added
    var args = subscription.addClientSubscription.calls.mostRecent().args;
    expect(args).toEqual([clientIdAgain, requestIdAgain]);
    // Make sure we add subscriptionInfo to the client 2
    args = clientAgain.addSubscriptionInfo.calls.mostRecent().args;
    expect(args[0]).toBe(requestIdAgain);
    expect(args[1].fields).toBe(queryAgain.fields);
  });

  it('can handle unsubscribe command without clientId', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var incompleteParseConn = {
    };
    parseLiveQueryServer._handleUnsubscribe(incompleteParseConn, {});

    var Client = require('../src/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle unsubscribe command without not existed client', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var parseWebSocket = {
      clientId: 1
    };
    parseLiveQueryServer._handleUnsubscribe(parseWebSocket, {});

    var Client = require('../src/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle unsubscribe command without not existed query', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Add mock client
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    // Handle unsubscribe command
    var parseWebSocket = {
      clientId: 1
    };
    parseLiveQueryServer._handleUnsubscribe(parseWebSocket, {});

    var Client = require('../src/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can handle unsubscribe command', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Add mock client
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    // Add subscription for mock client
    var parseWebSocket = {
      clientId: 1
    };
    var requestId = 2;
    var subscription = addMockSubscription(parseLiveQueryServer, clientId, requestId, parseWebSocket);
    // Mock client.getSubscriptionInfo
    var subscriptionInfo = client.addSubscriptionInfo.calls.mostRecent().args[1];
    client.getSubscriptionInfo = function() {
      return subscriptionInfo;
    };
    // Handle unsubscribe command
    var requestAgain = {
      requestId: requestId
    };
    parseLiveQueryServer._handleUnsubscribe(parseWebSocket, requestAgain);

    // Make sure we delete subscription from client
    expect(client.deleteSubscriptionInfo).toHaveBeenCalledWith(requestId);
    // Make sure we delete client from subscription
    expect(subscription.deleteClientSubscription).toHaveBeenCalledWith(clientId, requestId);
    // Make sure we clear subscription in the server
    var subscriptions = parseLiveQueryServer.subscriptions;
    expect(subscriptions.size).toBe(0);
  });

 it('can set connect command message handler for a parseWebSocket', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Register mock connect/subscribe/unsubscribe handler for the server
    parseLiveQueryServer._handleConnect = jasmine.createSpy('_handleSubscribe');
    // Make mock parseWebsocket
    var EventEmitter = require('events');
    var parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check connect request
    var connectRequest = {
      op: 'connect'
    };
    // Trigger message event
    parseWebSocket.emit('message', connectRequest);
    // Make sure _handleConnect is called
    var args = parseLiveQueryServer._handleConnect.calls.mostRecent().args;
    expect(args[0]).toBe(parseWebSocket);
  });

  it('can set subscribe command message handler for a parseWebSocket', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Register mock connect/subscribe/unsubscribe handler for the server
    parseLiveQueryServer._handleSubscribe = jasmine.createSpy('_handleSubscribe');
    // Make mock parseWebsocket
    var EventEmitter = require('events');
    var parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check subscribe request
    var subscribeRequest = '{"op":"subscribe"}';
    // Trigger message event
    parseWebSocket.emit('message', subscribeRequest);
    // Make sure _handleSubscribe is called
    var args = parseLiveQueryServer._handleSubscribe.calls.mostRecent().args;
    expect(args[0]).toBe(parseWebSocket);
    expect(JSON.stringify(args[1])).toBe(subscribeRequest);
  });

  it('can set unsubscribe command message handler for a parseWebSocket', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Register mock connect/subscribe/unsubscribe handler for the server
    parseLiveQueryServer._handleUnsubscribe = jasmine.createSpy('_handleSubscribe');
    // Make mock parseWebsocket
    var EventEmitter = require('events');
    var parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check unsubscribe request
    var unsubscribeRequest = '{"op":"unsubscribe"}';
    // Trigger message event
    parseWebSocket.emit('message', unsubscribeRequest);
    // Make sure _handleUnsubscribe is called
    var args = parseLiveQueryServer._handleUnsubscribe.calls.mostRecent().args;
    expect(args[0]).toBe(parseWebSocket);
    expect(JSON.stringify(args[1])).toBe(unsubscribeRequest);
  });

  it('can set unknown command message handler for a parseWebSocket', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock parseWebsocket
    var EventEmitter = require('events');
    var parseWebSocket = new EventEmitter();
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Check unknown request
    var unknownRequest = '{"op":"unknown"}';
    // Trigger message event
    parseWebSocket.emit('message', unknownRequest);
    var Client = require('../src/LiveQuery/Client').Client;
    expect(Client.pushError).toHaveBeenCalled();
  });

  it('can set disconnect command message handler for a parseWebSocket which has not registered to the server', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var EventEmitter = require('events');
    var parseWebSocket = new EventEmitter();
    parseWebSocket.clientId = 1;
    // Register message handlers for the parseWebSocket
    parseLiveQueryServer._onConnect(parseWebSocket);

    // Make sure we do not crash
    // Trigger disconnect event
    parseWebSocket.emit('disconnect');
  });

  // TODO: Test server can set disconnect command message handler for a parseWebSocket

  it('has no subscription and can handle object delete command', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make deletedParseObject
    var parseObject = new Parse.Object(testClassName);
    parseObject._finishFetch({
      key: 'value',
      className: testClassName
    });
    // Make mock message
    var message = {
      currentParseObject: parseObject
    };
    // Make sure we do not crash in this case
    parseLiveQueryServer._onAfterDelete(message, {});
  });

  it('can handle object delete command which does not match any subscription', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make deletedParseObject
    var parseObject = new Parse.Object(testClassName);
    parseObject._finishFetch({
      key: 'value',
      className: testClassName
    });
    // Make mock message
    var message = {
      currentParseObject: parseObject
    };

    // Add mock client
    var clientId = 1;
    addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    var requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    var client = parseLiveQueryServer.clients.get(clientId);
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
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make deletedParseObject
    var parseObject = new Parse.Object(testClassName);
    parseObject._finishFetch({
      key: 'value',
      className: testClassName
    });
   // Make mock message
    var message = {
      currentParseObject: parseObject
    };
    // Add mock client
    var clientId = 1;
    addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    var requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    var client = parseLiveQueryServer.clients.get(clientId);
    // Mock _matchesSubscription to return matching
    parseLiveQueryServer._matchesSubscription = function() {
      return true;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Parse.Promise.as(true);
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
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    var message = generateMockMessage();
    // Make sure we do not crash in this case
    parseLiveQueryServer._onAfterSave(message);
  });

  it('can handle object save command which does not match any subscription', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    var message = generateMockMessage();
    // Add mock client
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    var requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return not matching
    parseLiveQueryServer._matchesSubscription = function() {
      return false;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Parse.Promise.as(true)
    };
    // Trigger onAfterSave
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we do not send command to client
    setTimeout(function(){
      expect(client.pushCreate).not.toHaveBeenCalled();
      expect(client.pushEnter).not.toHaveBeenCalled();
      expect(client.pushUpdate).not.toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).not.toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can handle object enter command which matches some subscriptions', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    var message = generateMockMessage(true);
    // Add mock client
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    var requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return matching
    // In order to mimic a enter, we need original match return false
    // and the current match return true
    var counter = 0;
    parseLiveQueryServer._matchesSubscription = function(parseObject, subscription){
      if (!parseObject) {
        return false;
      }
      counter += 1;
      return counter % 2 === 0;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Parse.Promise.as(true)
    };
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we send enter command to client
    setTimeout(function(){
      expect(client.pushCreate).not.toHaveBeenCalled();
      expect(client.pushEnter).toHaveBeenCalled();
      expect(client.pushUpdate).not.toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).not.toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can handle object update command which matches some subscriptions', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    var message = generateMockMessage(true);
    // Add mock client
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    var requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return matching
    parseLiveQueryServer._matchesSubscription = function(parseObject, subscription){
      if (!parseObject) {
        return false;
      }
      return true;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Parse.Promise.as(true)
    };
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we send update command to client
    setTimeout(function(){
      expect(client.pushCreate).not.toHaveBeenCalled();
      expect(client.pushEnter).not.toHaveBeenCalled();
      expect(client.pushUpdate).toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).not.toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can handle object leave command which matches some subscriptions', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    var message = generateMockMessage(true);
    // Add mock client
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    var requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return matching
    // In order to mimic a leave, we need original match return true
    // and the current match return false
    var counter = 0;
    parseLiveQueryServer._matchesSubscription = function(parseObject, subscription){
      if (!parseObject) {
        return false;
      }
      counter += 1;
      return counter % 2 !== 0;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Parse.Promise.as(true)
    };
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we send leave command to client
    setTimeout(function(){
      expect(client.pushCreate).not.toHaveBeenCalled();
      expect(client.pushEnter).not.toHaveBeenCalled();
      expect(client.pushUpdate).not.toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can handle object create command which matches some subscriptions', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request message
    var message = generateMockMessage();
    // Add mock client
    var clientId = 1;
    var client = addMockClient(parseLiveQueryServer, clientId);
    // Add mock subscription
    var requestId = 2;
    addMockSubscription(parseLiveQueryServer, clientId, requestId);
    // Mock _matchesSubscription to return matching
    parseLiveQueryServer._matchesSubscription = function(parseObject, subscription){
      if (!parseObject) {
        return false;
      }
      return true;
    };
    parseLiveQueryServer._matchesACL = function() {
      return Parse.Promise.as(true)
    };
    parseLiveQueryServer._onAfterSave(message);

    // Make sure we send create command to client
    setTimeout(function(){
      expect(client.pushCreate).toHaveBeenCalled();
      expect(client.pushEnter).not.toHaveBeenCalled();
      expect(client.pushUpdate).not.toHaveBeenCalled();
      expect(client.pushDelete).not.toHaveBeenCalled();
      expect(client.pushLeave).not.toHaveBeenCalled();
      done();
    }, jasmine.ASYNC_TEST_WAIT_TIME);
  });

  it('can match subscription for null or undefined parse object', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock subscription
    var subscription = {
      match: jasmine.createSpy('match')
    }

    expect(parseLiveQueryServer._matchesSubscription(null, subscription)).toBe(false);
    expect(parseLiveQueryServer._matchesSubscription(undefined, subscription)).toBe(false);
    // Make sure subscription.match is not called
    expect(subscription.match).not.toHaveBeenCalled();
  });

  it('can match subscription', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock subscription
    var subscription = {
      query: {}
    }
    var parseObject = {};
    expect(parseLiveQueryServer._matchesSubscription(parseObject, subscription)).toBe(true);
    // Make sure matchesQuery is called
    var matchesQuery = require('../src/LiveQuery/QueryTools').matchesQuery;
    expect(matchesQuery).toHaveBeenCalledWith(parseObject, subscription.query);
  });

  it('can inflate parse object', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    // Make mock request
    var objectJSON = {
      "className":"testClassName",
      "createdAt":"2015-12-22T01:51:12.955Z",
      "key":"value",
      "objectId":"BfwxBCz6yW",
      "updatedAt":"2016-01-05T00:46:45.659Z"
    };
    var originalObjectJSON = {
      "className":"testClassName",
      "createdAt":"2015-12-22T01:51:12.955Z",
      "key":"originalValue",
      "objectId":"BfwxBCz6yW",
      "updatedAt":"2016-01-05T00:46:45.659Z"
    };
    var message = {
      currentParseObject: objectJSON,
      originalParseObject: originalObjectJSON
    };
    // Inflate the object
    parseLiveQueryServer._inflateParseObject(message);

    // Verify object
    var object = message.currentParseObject;
    expect(object instanceof Parse.Object).toBeTruthy();
    expect(object.get('key')).toEqual('value');
    expect(object.className).toEqual('testClassName');
    expect(object.id).toBe('BfwxBCz6yW');
    expect(object.createdAt).not.toBeUndefined();
    expect(object.updatedAt).not.toBeUndefined();
    // Verify original object
    var originalObject = message.originalParseObject;
    expect(originalObject instanceof Parse.Object).toBeTruthy();
    expect(originalObject.get('key')).toEqual('originalValue');
    expect(originalObject.className).toEqual('testClassName');
    expect(originalObject.id).toBe('BfwxBCz6yW');
    expect(originalObject.createdAt).not.toBeUndefined();
    expect(originalObject.updatedAt).not.toBeUndefined();
  });

  it('can match undefined ACL', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var client = {};
    var requestId = 0;

    parseLiveQueryServer._matchesACL(undefined, client, requestId).then(function(isMatched) {
      expect(isMatched).toBe(true);
      done();
    });
  });

  it('can match ACL with none exist requestId', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var acl = new Parse.ACL();
    var client = {
      getSubscriptionInfo: jasmine.createSpy('getSubscriptionInfo').and.returnValue(undefined)
    };
    var requestId = 0;

    var isChecked = false;
    parseLiveQueryServer._matchesACL(acl, client, requestId).then(function(isMatched) {
      expect(isMatched).toBe(false);
      done();
    });
  });

  it('can match ACL with public read access', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    var client = {
      getSubscriptionInfo: jasmine.createSpy('getSubscriptionInfo').and.returnValue({
        sessionToken: 'sessionToken'
      })
    };
    var requestId = 0;

    parseLiveQueryServer._matchesACL(acl, client, requestId).then(function(isMatched) {
      expect(isMatched).toBe(true);
      done();
    });
  });

  it('can match ACL with valid subscription sessionToken', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    var client = {
      getSubscriptionInfo: jasmine.createSpy('getSubscriptionInfo').and.returnValue({
        sessionToken: 'sessionToken'
      })
    };
    var requestId = 0;

    parseLiveQueryServer._matchesACL(acl, client, requestId).then(function(isMatched) {
      expect(isMatched).toBe(true);
      done();
    });
  });

  it('can match ACL with valid client sessionToken', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    // Mock sessionTokenCache will return false when sessionToken is undefined
    var client = {
      sessionToken: 'sessionToken',
      getSubscriptionInfo: jasmine.createSpy('getSubscriptionInfo').and.returnValue({
        sessionToken: undefined
      })
    };
    var requestId = 0;

    parseLiveQueryServer._matchesACL(acl, client, requestId).then(function(isMatched) {
      expect(isMatched).toBe(true);
      done();
    });
  });

  it('can match ACL with invalid subscription and client sessionToken', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    // Mock sessionTokenCache will return false when sessionToken is undefined
    var client = {
      sessionToken: undefined,
      getSubscriptionInfo: jasmine.createSpy('getSubscriptionInfo').and.returnValue({
        sessionToken: undefined
      })
    };
    var requestId = 0;

    parseLiveQueryServer._matchesACL(acl, client, requestId).then(function(isMatched) {
      expect(isMatched).toBe(false);
      done();
    });
  });

  it('can match ACL with subscription sessionToken checking error', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    // Mock sessionTokenCache will return error when sessionToken is null, this is just
    // the behaviour of our mock sessionTokenCache, not real sessionTokenCache
    var client = {
      getSubscriptionInfo: jasmine.createSpy('getSubscriptionInfo').and.returnValue({
        sessionToken: null
      })
    };
    var requestId = 0;

    parseLiveQueryServer._matchesACL(acl, client, requestId).then(function(isMatched) {
      expect(isMatched).toBe(false);
      done();
    });
  });

  it('can match ACL with client sessionToken checking error', function(done) {
    var parseLiveQueryServer = new ParseLiveQueryServer(10, 10, {});
    var acl = new Parse.ACL();
    acl.setReadAccess(testUserId, true);
    // Mock sessionTokenCache will return error when sessionToken is null
    var client = {
      sessionToken: null,
      getSubscriptionInfo: jasmine.createSpy('getSubscriptionInfo').and.returnValue({
        sessionToken: null
      })
    };
    var requestId = 0;

    parseLiveQueryServer._matchesACL(acl, client, requestId).then(function(isMatched) {
      expect(isMatched).toBe(false);
      done();
    });
  });

  it('can validate key when valid key is provided', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer({}, {
      keyPairs: {
        clientKey: 'test'
      }
    });
    var request = {
      clientKey: 'test'
    }

    expect(parseLiveQueryServer._validateKeys(request, parseLiveQueryServer.keyPairs)).toBeTruthy();
  });

  it('can validate key when invalid key is provided', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer({}, {
      keyPairs: {
        clientKey: 'test'
      }
    });
    var request = {
      clientKey: 'error'
    }

    expect(parseLiveQueryServer._validateKeys(request, parseLiveQueryServer.keyPairs)).not.toBeTruthy();
  });

  it('can validate key when key is not provided', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer({}, {
      keyPairs: {
        clientKey: 'test'
      }
    });
    var request = {
    }

    expect(parseLiveQueryServer._validateKeys(request, parseLiveQueryServer.keyPairs)).not.toBeTruthy();
  });

  it('can validate key when validKerPairs is empty', function() {
    var parseLiveQueryServer = new ParseLiveQueryServer({}, {});
    var request = {
    }

    expect(parseLiveQueryServer._validateKeys(request, parseLiveQueryServer.keyPairs)).toBeTruthy();
  });

  afterEach(function(){
    jasmine.restoreLibrary('../src/LiveQuery/ParseWebSocketServer', 'ParseWebSocketServer');
    jasmine.restoreLibrary('../src/LiveQuery/Client', 'Client');
    jasmine.restoreLibrary('../src/LiveQuery/Subscription', 'Subscription');
    jasmine.restoreLibrary('../src/LiveQuery/QueryTools', 'queryHash');
    jasmine.restoreLibrary('../src/LiveQuery/QueryTools', 'matchesQuery');
    jasmine.restoreLibrary('tv4', 'validate');
    jasmine.restoreLibrary('../src/LiveQuery/ParsePubSub', 'ParsePubSub');
    jasmine.restoreLibrary('../src/LiveQuery/SessionTokenCache', 'SessionTokenCache');
  });

  // Helper functions to add mock client and subscription to a liveQueryServer
  function addMockClient(parseLiveQueryServer, clientId) {
    var Client = require('../src/LiveQuery/Client').Client;
    var client = new Client(clientId, {});
    parseLiveQueryServer.clients.set(clientId, client);
    return client;
  }

  function addMockSubscription(parseLiveQueryServer, clientId, requestId, parseWebSocket, query) {
    // If parseWebSocket is null, we use the default one
    if (!parseWebSocket) {
      var EventEmitter = require('events');
      parseWebSocket = new EventEmitter();
    }
    parseWebSocket.clientId = clientId;
    // If query is null, we use the default one
    if (!query) {
      query = {
        className: testClassName,
        where: {
          key: 'value'
        },
        fields: [ 'test' ]
      };
    }
    var request = {
      query: query,
      requestId: requestId,
      sessionToken: 'sessionToken'
    };
    parseLiveQueryServer._handleSubscribe(parseWebSocket, request);

    // Make mock subscription
    var subscription = parseLiveQueryServer.subscriptions.get(query.className).get(queryHashValue);
    subscription.hasSubscribingClient = function() {
      return false;
    }
    subscription.className = query.className;
    subscription.hash = queryHashValue;
    if (subscription.clientRequestIds && subscription.clientRequestIds.has(clientId)) {
      subscription.clientRequestIds.get(clientId).push(requestId);
    } else {
      subscription.clientRequestIds = new Map([[clientId, [requestId]]]);
    }
    return subscription;
  }

  // Helper functiosn to generate request message
  function generateMockMessage(hasOriginalParseObject) {
    var parseObject = new Parse.Object(testClassName);
    parseObject._finishFetch({
      key: 'value',
      className: testClassName
    });
    var message = {
      currentParseObject: parseObject
    };
    if (hasOriginalParseObject) {
      var originalParseObject = new Parse.Object(testClassName);
      originalParseObject._finishFetch({
        key: 'originalValue',
        className: testClassName
      });
      message.originalParseObject = originalParseObject;
    }
    return message;
  }
});

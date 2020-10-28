"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseLiveQueryServer = void 0;

var _tv = _interopRequireDefault(require("tv4"));

var _node = _interopRequireDefault(require("parse/node"));

var _Subscription = require("./Subscription");

var _Client = require("./Client");

var _ParseWebSocketServer = require("./ParseWebSocketServer");

var _logger = _interopRequireDefault(require("../logger"));

var _RequestSchema = _interopRequireDefault(require("./RequestSchema"));

var _QueryTools = require("./QueryTools");

var _ParsePubSub = require("./ParsePubSub");

var _SchemaController = _interopRequireDefault(require("../Controllers/SchemaController"));

var _lodash = _interopRequireDefault(require("lodash"));

var _uuid = require("uuid");

var _triggers = require("../triggers");

var _Auth = require("../Auth");

var _Controllers = require("../Controllers");

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseLiveQueryServer {
  // className -> (queryHash -> subscription)
  // The subscriber we use to get object update from publisher
  constructor(server, config = {}, parseServerConfig = {}) {
    this.server = server;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.config = config;
    config.appId = config.appId || _node.default.applicationId;
    config.masterKey = config.masterKey || _node.default.masterKey; // Store keys, convert obj to map

    const keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();

    for (const key of Object.keys(keyPairs)) {
      this.keyPairs.set(key, keyPairs[key]);
    }

    _logger.default.verbose('Support key pairs', this.keyPairs); // Initialize Parse


    _node.default.Object.disableSingleInstance();

    const serverURL = config.serverURL || _node.default.serverURL;
    _node.default.serverURL = serverURL;

    _node.default.initialize(config.appId, _node.default.javaScriptKey, config.masterKey); // The cache controller is a proper cache controller
    // with access to User and Roles


    this.cacheController = (0, _Controllers.getCacheController)(parseServerConfig);
    config.cacheTimeout = config.cacheTimeout || 5 * 1000; // 5s
    // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.

    this.authCache = new _lruCache.default({
      max: 500,
      // 500 concurrent
      maxAge: config.cacheTimeout
    }); // Initialize websocket server

    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config); // Initialize subscriber

    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(_node.default.applicationId + 'afterSave');
    this.subscriber.subscribe(_node.default.applicationId + 'afterDelete'); // Register message handler for subscriber. When publisher get messages, it will publish message
    // to the subscribers and the handler will be called.

    this.subscriber.on('message', (channel, messageStr) => {
      _logger.default.verbose('Subscribe messsage %j', messageStr);

      let message;

      try {
        message = JSON.parse(messageStr);
      } catch (e) {
        _logger.default.error('unable to parse message', messageStr, e);

        return;
      }

      this._inflateParseObject(message);

      if (channel === _node.default.applicationId + 'afterSave') {
        this._onAfterSave(message);
      } else if (channel === _node.default.applicationId + 'afterDelete') {
        this._onAfterDelete(message);
      } else {
        _logger.default.error('Get message %s from unknown channel %j', message, channel);
      }
    });
  } // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.


  _inflateParseObject(message) {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;

    _UsersRouter.default.removeHiddenProperties(currentParseObject);

    let className = currentParseObject.className;
    let parseObject = new _node.default.Object(className);

    parseObject._finishFetch(currentParseObject);

    message.currentParseObject = parseObject; // Inflate original object

    const originalParseObject = message.originalParseObject;

    if (originalParseObject) {
      _UsersRouter.default.removeHiddenProperties(originalParseObject);

      className = originalParseObject.className;
      parseObject = new _node.default.Object(className);

      parseObject._finishFetch(originalParseObject);

      message.originalParseObject = parseObject;
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.


  _onAfterDelete(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterDelete is triggered');

    let deletedParseObject = message.currentParseObject.toJSON();
    const classLevelPermissions = message.classLevelPermissions;
    const className = deletedParseObject.className;

    _logger.default.verbose('ClassName: %j | ObjectId: %s', className, deletedParseObject.id);

    _logger.default.verbose('Current client number : %d', this.clients.size);

    const classSubscriptions = this.subscriptions.get(className);

    if (typeof classSubscriptions === 'undefined') {
      _logger.default.debug('Can not find subscriptions under this class ' + className);

      return;
    }

    for (const subscription of classSubscriptions.values()) {
      const isSubscriptionMatched = this._matchesSubscription(deletedParseObject, subscription);

      if (!isSubscriptionMatched) {
        continue;
      }

      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);

        if (typeof client === 'undefined') {
          continue;
        }

        for (const requestId of requestIds) {
          const acl = message.currentParseObject.getACL(); // Check CLP

          const op = this._getCLPOperation(subscription.query);

          let res = {};

          this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op).then(() => {
            // Check ACL
            return this._matchesACL(acl, client, requestId);
          }).then(isMatched => {
            if (!isMatched) {
              return null;
            }

            res = {
              event: 'Delete',
              sessionToken: client.sessionToken,
              object: deletedParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true
            };
            return (0, _triggers.maybeRunAfterEventTrigger)('afterEvent', className, res);
          }).then(() => {
            if (!res.sendEvent) {
              return;
            }

            if (res.object && typeof res.object.toJSON === 'function') {
              deletedParseObject = res.object.toJSON();
              deletedParseObject.className = className;
            }

            client.pushDelete(requestId, deletedParseObject);
          }).catch(error => {
            _Client.Client.pushError(client.parseWebSocket, error.code || 141, error.message || error, false, requestId);

            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          });
        }
      }
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.


  _onAfterSave(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterSave is triggered');

    let originalParseObject = null;

    if (message.originalParseObject) {
      originalParseObject = message.originalParseObject.toJSON();
    }

    const classLevelPermissions = message.classLevelPermissions;
    let currentParseObject = message.currentParseObject.toJSON();
    const className = currentParseObject.className;

    _logger.default.verbose('ClassName: %s | ObjectId: %s', className, currentParseObject.id);

    _logger.default.verbose('Current client number : %d', this.clients.size);

    const classSubscriptions = this.subscriptions.get(className);

    if (typeof classSubscriptions === 'undefined') {
      _logger.default.debug('Can not find subscriptions under this class ' + className);

      return;
    }

    for (const subscription of classSubscriptions.values()) {
      const isOriginalSubscriptionMatched = this._matchesSubscription(originalParseObject, subscription);

      const isCurrentSubscriptionMatched = this._matchesSubscription(currentParseObject, subscription);

      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);

        if (typeof client === 'undefined') {
          continue;
        }

        for (const requestId of requestIds) {
          // Set orignal ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let originalACLCheckingPromise;

          if (!isOriginalSubscriptionMatched) {
            originalACLCheckingPromise = Promise.resolve(false);
          } else {
            let originalACL;

            if (message.originalParseObject) {
              originalACL = message.originalParseObject.getACL();
            }

            originalACLCheckingPromise = this._matchesACL(originalACL, client, requestId);
          } // Set current ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL


          let currentACLCheckingPromise;
          let res = {};

          if (!isCurrentSubscriptionMatched) {
            currentACLCheckingPromise = Promise.resolve(false);
          } else {
            const currentACL = message.currentParseObject.getACL();
            currentACLCheckingPromise = this._matchesACL(currentACL, client, requestId);
          }

          const op = this._getCLPOperation(subscription.query);

          this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op).then(() => {
            return Promise.all([originalACLCheckingPromise, currentACLCheckingPromise]);
          }).then(([isOriginalMatched, isCurrentMatched]) => {
            _logger.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', originalParseObject, currentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash); // Decide event type


            let type;

            if (isOriginalMatched && isCurrentMatched) {
              type = 'Update';
            } else if (isOriginalMatched && !isCurrentMatched) {
              type = 'Leave';
            } else if (!isOriginalMatched && isCurrentMatched) {
              if (originalParseObject) {
                type = 'Enter';
              } else {
                type = 'Create';
              }
            } else {
              return null;
            }

            message.event = type;
            res = {
              event: type,
              sessionToken: client.sessionToken,
              object: currentParseObject,
              original: originalParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true
            };
            return (0, _triggers.maybeRunAfterEventTrigger)('afterEvent', className, res);
          }).then(() => {
            if (!res.sendEvent) {
              return;
            }

            if (res.object && typeof res.object.toJSON === 'function') {
              currentParseObject = res.object.toJSON();
              currentParseObject.className = res.object.className || className;
            }

            if (res.original && typeof res.original.toJSON === 'function') {
              originalParseObject = res.original.toJSON();
              originalParseObject.className = res.original.className || className;
            }

            const functionName = 'push' + message.event;

            if (client[functionName]) {
              client[functionName](requestId, currentParseObject, originalParseObject);
            }
          }, error => {
            _Client.Client.pushError(client.parseWebSocket, error.code || 141, error.message || error, false, requestId);

            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          });
        }
      }
    }
  }

  _onConnect(parseWebsocket) {
    parseWebsocket.on('message', request => {
      if (typeof request === 'string') {
        try {
          request = JSON.parse(request);
        } catch (e) {
          _logger.default.error('unable to parse request', request, e);

          return;
        }
      }

      _logger.default.verbose('Request: %j', request); // Check whether this request is a valid request, return error directly if not


      if (!_tv.default.validate(request, _RequestSchema.default['general']) || !_tv.default.validate(request, _RequestSchema.default[request.op])) {
        _Client.Client.pushError(parseWebsocket, 1, _tv.default.error.message);

        _logger.default.error('Connect message error %s', _tv.default.error.message);

        return;
      }

      switch (request.op) {
        case 'connect':
          this._handleConnect(parseWebsocket, request);

          break;

        case 'subscribe':
          this._handleSubscribe(parseWebsocket, request);

          break;

        case 'update':
          this._handleUpdateSubscription(parseWebsocket, request);

          break;

        case 'unsubscribe':
          this._handleUnsubscribe(parseWebsocket, request);

          break;

        default:
          _Client.Client.pushError(parseWebsocket, 3, 'Get unknown operation');

          _logger.default.error('Get unknown operation', request.op);

      }
    });
    parseWebsocket.on('disconnect', () => {
      _logger.default.info(`Client disconnect: ${parseWebsocket.clientId}`);

      const clientId = parseWebsocket.clientId;

      if (!this.clients.has(clientId)) {
        (0, _triggers.runLiveQueryEventHandlers)({
          event: 'ws_disconnect_error',
          clients: this.clients.size,
          subscriptions: this.subscriptions.size,
          error: `Unable to find client ${clientId}`
        });

        _logger.default.error(`Can not find client ${clientId} on disconnect`);

        return;
      } // Delete client


      const client = this.clients.get(clientId);
      this.clients.delete(clientId); // Delete client from subscriptions

      for (const [requestId, subscriptionInfo] of _lodash.default.entries(client.subscriptionInfos)) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId); // If there is no client which is subscribing this subscription, remove it from subscriptions

        const classSubscriptions = this.subscriptions.get(subscription.className);

        if (!subscription.hasSubscribingClient()) {
          classSubscriptions.delete(subscription.hash);
        } // If there is no subscriptions under this class, remove it from subscriptions


        if (classSubscriptions.size === 0) {
          this.subscriptions.delete(subscription.className);
        }
      }

      _logger.default.verbose('Current clients %d', this.clients.size);

      _logger.default.verbose('Current subscriptions %d', this.subscriptions.size);

      (0, _triggers.runLiveQueryEventHandlers)({
        event: 'ws_disconnect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId
      });
    });
    (0, _triggers.runLiveQueryEventHandlers)({
      event: 'ws_connect',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size
    });
  }

  _matchesSubscription(parseObject, subscription) {
    // Object is undefined or null, not match
    if (!parseObject) {
      return false;
    }

    return (0, _QueryTools.matchesQuery)(parseObject, subscription.query);
  }

  getAuthForSessionToken(sessionToken) {
    if (!sessionToken) {
      return Promise.resolve({});
    }

    const fromCache = this.authCache.get(sessionToken);

    if (fromCache) {
      return fromCache;
    }

    const authPromise = (0, _Auth.getAuthForSessionToken)({
      cacheController: this.cacheController,
      sessionToken: sessionToken
    }).then(auth => {
      return {
        auth,
        userId: auth && auth.user && auth.user.id
      };
    }).catch(error => {
      // There was an error with the session token
      const result = {};

      if (error && error.code === _node.default.Error.INVALID_SESSION_TOKEN) {
        result.error = error;
        this.authCache.set(sessionToken, Promise.resolve(result), this.config.cacheTimeout);
      } else {
        this.authCache.del(sessionToken);
      }

      return result;
    });
    this.authCache.set(sessionToken, authPromise);
    return authPromise;
  }

  async _matchesCLP(classLevelPermissions, object, client, requestId, op) {
    // try to match on user first, less expensive than with roles
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let userId;

    if (typeof subscriptionInfo !== 'undefined') {
      const {
        userId
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);

      if (userId) {
        aclGroup.push(userId);
      }
    }

    try {
      await _SchemaController.default.validatePermission(classLevelPermissions, object.className, aclGroup, op);
      return true;
    } catch (e) {
      _logger.default.verbose(`Failed matching CLP for ${object.id} ${userId} ${e}`);

      return false;
    } // TODO: handle roles permissions
    // Object.keys(classLevelPermissions).forEach((key) => {
    //   const perm = classLevelPermissions[key];
    //   Object.keys(perm).forEach((key) => {
    //     if (key.indexOf('role'))
    //   });
    // })
    // // it's rejected here, check the roles
    // var rolesQuery = new Parse.Query(Parse.Role);
    // rolesQuery.equalTo("users", user);
    // return rolesQuery.find({useMasterKey:true});

  }

  _getCLPOperation(query) {
    return typeof query === 'object' && Object.keys(query).length == 1 && typeof query.objectId === 'string' ? 'get' : 'find';
  }

  async _verifyACL(acl, token) {
    if (!token) {
      return false;
    }

    const {
      auth,
      userId
    } = await this.getAuthForSessionToken(token); // Getting the session token failed
    // This means that no additional auth is available
    // At this point, just bail out as no additional visibility can be inferred.

    if (!auth || !userId) {
      return false;
    }

    const isSubscriptionSessionTokenMatched = acl.getReadAccess(userId);

    if (isSubscriptionSessionTokenMatched) {
      return true;
    } // Check if the user has any roles that match the ACL


    return Promise.resolve().then(async () => {
      // Resolve false right away if the acl doesn't have any roles
      const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));

      if (!acl_has_roles) {
        return false;
      }

      const roleNames = await auth.getUserRoles(); // Finally, see if any of the user's roles allow them read access

      for (const role of roleNames) {
        // We use getReadAccess as `role` is in the form `role:roleName`
        if (acl.getReadAccess(role)) {
          return true;
        }
      }

      return false;
    }).catch(() => {
      return false;
    });
  }

  async _matchesACL(acl, client, requestId) {
    // Return true directly if ACL isn't present, ACL is public read, or client has master key
    if (!acl || acl.getPublicReadAccess() || client.hasMasterKey) {
      return true;
    } // Check subscription sessionToken matches ACL first


    const subscriptionInfo = client.getSubscriptionInfo(requestId);

    if (typeof subscriptionInfo === 'undefined') {
      return false;
    }

    const subscriptionToken = subscriptionInfo.sessionToken;
    const clientSessionToken = client.sessionToken;

    if (await this._verifyACL(acl, subscriptionToken)) {
      return true;
    }

    if (await this._verifyACL(acl, clientSessionToken)) {
      return true;
    }

    return false;
  }

  async _handleConnect(parseWebsocket, request) {
    if (!this._validateKeys(request, this.keyPairs)) {
      _Client.Client.pushError(parseWebsocket, 4, 'Key in request is not valid');

      _logger.default.error('Key in request is not valid');

      return;
    }

    const hasMasterKey = this._hasMasterKey(request, this.keyPairs);

    const clientId = (0, _uuid.v4)();
    const client = new _Client.Client(clientId, parseWebsocket, hasMasterKey, request.sessionToken, request.installationId);

    try {
      const req = {
        client,
        event: 'connect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: request.installationId
      };
      await (0, _triggers.maybeRunConnectTrigger)('beforeConnect', req);
      parseWebsocket.clientId = clientId;
      this.clients.set(parseWebsocket.clientId, client);

      _logger.default.info(`Create new client: ${parseWebsocket.clientId}`);

      client.pushConnect();
      (0, _triggers.runLiveQueryEventHandlers)(req);
    } catch (error) {
      _Client.Client.pushError(parseWebsocket, error.code || 141, error.message || error, false);

      _logger.default.error(`Failed running beforeConnect for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(error));
    }
  }

  _hasMasterKey(request, validKeyPairs) {
    if (!validKeyPairs || validKeyPairs.size == 0 || !validKeyPairs.has('masterKey')) {
      return false;
    }

    if (!request || !Object.prototype.hasOwnProperty.call(request, 'masterKey')) {
      return false;
    }

    return request.masterKey === validKeyPairs.get('masterKey');
  }

  _validateKeys(request, validKeyPairs) {
    if (!validKeyPairs || validKeyPairs.size == 0) {
      return true;
    }

    let isValid = false;

    for (const [key, secret] of validKeyPairs) {
      if (!request[key] || request[key] !== secret) {
        continue;
      }

      isValid = true;
      break;
    }

    return isValid;
  }

  async _handleSubscribe(parseWebsocket, request) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before subscribing');

      _logger.default.error('Can not find this client, make sure you connect to server before subscribing');

      return;
    }

    const client = this.clients.get(parseWebsocket.clientId);
    const className = request.query.className;

    try {
      await (0, _triggers.maybeRunSubscribeTrigger)('beforeSubscribe', className, request); // Get subscription from subscriptions, create one if necessary

      const subscriptionHash = (0, _QueryTools.queryHash)(request.query); // Add className to subscriptions if necessary

      if (!this.subscriptions.has(className)) {
        this.subscriptions.set(className, new Map());
      }

      const classSubscriptions = this.subscriptions.get(className);
      let subscription;

      if (classSubscriptions.has(subscriptionHash)) {
        subscription = classSubscriptions.get(subscriptionHash);
      } else {
        subscription = new _Subscription.Subscription(className, request.query.where, subscriptionHash);
        classSubscriptions.set(subscriptionHash, subscription);
      } // Add subscriptionInfo to client


      const subscriptionInfo = {
        subscription: subscription
      }; // Add selected fields, sessionToken and installationId for this subscription if necessary

      if (request.query.fields) {
        subscriptionInfo.fields = request.query.fields;
      }

      if (request.sessionToken) {
        subscriptionInfo.sessionToken = request.sessionToken;
      }

      client.addSubscriptionInfo(request.requestId, subscriptionInfo); // Add clientId to subscription

      subscription.addClientSubscription(parseWebsocket.clientId, request.requestId);
      client.pushSubscribe(request.requestId);

      _logger.default.verbose(`Create client ${parseWebsocket.clientId} new subscription: ${request.requestId}`);

      _logger.default.verbose('Current client number: %d', this.clients.size);

      (0, _triggers.runLiveQueryEventHandlers)({
        client,
        event: 'subscribe',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId
      });
    } catch (e) {
      _Client.Client.pushError(parseWebsocket, e.code || 141, e.message || e, false, request.requestId);

      _logger.default.error(`Failed running beforeSubscribe on ${className} for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(e));
    }
  }

  _handleUpdateSubscription(parseWebsocket, request) {
    this._handleUnsubscribe(parseWebsocket, request, false);

    this._handleSubscribe(parseWebsocket, request);
  }

  _handleUnsubscribe(parseWebsocket, request, notifyClient = true) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before unsubscribing');

      _logger.default.error('Can not find this client, make sure you connect to server before unsubscribing');

      return;
    }

    const requestId = request.requestId;
    const client = this.clients.get(parseWebsocket.clientId);

    if (typeof client === 'undefined') {
      _Client.Client.pushError(parseWebsocket, 2, 'Cannot find client with clientId ' + parseWebsocket.clientId + '. Make sure you connect to live query server before unsubscribing.');

      _logger.default.error('Can not find this client ' + parseWebsocket.clientId);

      return;
    }

    const subscriptionInfo = client.getSubscriptionInfo(requestId);

    if (typeof subscriptionInfo === 'undefined') {
      _Client.Client.pushError(parseWebsocket, 2, 'Cannot find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId + '. Make sure you subscribe to live query server before unsubscribing.');

      _logger.default.error('Can not find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId);

      return;
    } // Remove subscription from client


    client.deleteSubscriptionInfo(requestId); // Remove client from subscription

    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    subscription.deleteClientSubscription(parseWebsocket.clientId, requestId); // If there is no client which is subscribing this subscription, remove it from subscriptions

    const classSubscriptions = this.subscriptions.get(className);

    if (!subscription.hasSubscribingClient()) {
      classSubscriptions.delete(subscription.hash);
    } // If there is no subscriptions under this class, remove it from subscriptions


    if (classSubscriptions.size === 0) {
      this.subscriptions.delete(className);
    }

    (0, _triggers.runLiveQueryEventHandlers)({
      client,
      event: 'unsubscribe',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
      sessionToken: subscriptionInfo.sessionToken,
      useMasterKey: client.hasMasterKey,
      installationId: client.installationId
    });

    if (!notifyClient) {
      return;
    }

    client.pushUnsubscribe(request.requestId);

    _logger.default.verbose(`Delete client: ${parseWebsocket.clientId} | subscription: ${request.requestId}`);
  }

}

exports.ParseLiveQueryServer = ParseLiveQueryServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsIm1heEFnZSIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwic3Vic2NyaWJlIiwib24iLCJjaGFubmVsIiwibWVzc2FnZVN0ciIsIm1lc3NhZ2UiLCJKU09OIiwicGFyc2UiLCJlIiwiZXJyb3IiLCJfaW5mbGF0ZVBhcnNlT2JqZWN0IiwiX29uQWZ0ZXJTYXZlIiwiX29uQWZ0ZXJEZWxldGUiLCJjdXJyZW50UGFyc2VPYmplY3QiLCJVc2VyUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsImNsYXNzTmFtZSIsInBhcnNlT2JqZWN0IiwiX2ZpbmlzaEZldGNoIiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImRlbGV0ZWRQYXJzZU9iamVjdCIsInRvSlNPTiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlkIiwic2l6ZSIsImNsYXNzU3Vic2NyaXB0aW9ucyIsImdldCIsImRlYnVnIiwic3Vic2NyaXB0aW9uIiwidmFsdWVzIiwiaXNTdWJzY3JpcHRpb25NYXRjaGVkIiwiX21hdGNoZXNTdWJzY3JpcHRpb24iLCJjbGllbnRJZCIsInJlcXVlc3RJZHMiLCJfIiwiZW50cmllcyIsImNsaWVudFJlcXVlc3RJZHMiLCJjbGllbnQiLCJyZXF1ZXN0SWQiLCJhY2wiLCJnZXRBQ0wiLCJvcCIsIl9nZXRDTFBPcGVyYXRpb24iLCJxdWVyeSIsInJlcyIsIl9tYXRjaGVzQ0xQIiwidGhlbiIsIl9tYXRjaGVzQUNMIiwiaXNNYXRjaGVkIiwiZXZlbnQiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3QiLCJ1c2VNYXN0ZXJLZXkiLCJoYXNNYXN0ZXJLZXkiLCJpbnN0YWxsYXRpb25JZCIsInNlbmRFdmVudCIsInB1c2hEZWxldGUiLCJjYXRjaCIsIkNsaWVudCIsInB1c2hFcnJvciIsInBhcnNlV2ViU29ja2V0IiwiY29kZSIsInN0cmluZ2lmeSIsImlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkIiwiaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCIsIm9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiYWxsIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiaGFzaCIsInR5cGUiLCJvcmlnaW5hbCIsImZ1bmN0aW9uTmFtZSIsInJlcXVlc3QiLCJ0djQiLCJ2YWxpZGF0ZSIsIlJlcXVlc3RTY2hlbWEiLCJfaGFuZGxlQ29ubmVjdCIsIl9oYW5kbGVTdWJzY3JpYmUiLCJfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uIiwiX2hhbmRsZVVuc3Vic2NyaWJlIiwiaW5mbyIsImhhcyIsImRlbGV0ZSIsInN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvcyIsImRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbiIsImhhc1N1YnNjcmliaW5nQ2xpZW50IiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImZyb21DYWNoZSIsImF1dGhQcm9taXNlIiwiYXV0aCIsInVzZXJJZCIsInVzZXIiLCJyZXN1bHQiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsImRlbCIsImdldFN1YnNjcmlwdGlvbkluZm8iLCJhY2xHcm91cCIsInB1c2giLCJTY2hlbWFDb250cm9sbGVyIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJfdmVyaWZ5QUNMIiwidG9rZW4iLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInNvbWUiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFB1YmxpY1JlYWRBY2Nlc3MiLCJzdWJzY3JpcHRpb25Ub2tlbiIsImNsaWVudFNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZUtleXMiLCJfaGFzTWFzdGVyS2V5IiwicmVxIiwicHVzaENvbm5lY3QiLCJ2YWxpZEtleVBhaXJzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaXNWYWxpZCIsInNlY3JldCIsInN1YnNjcmlwdGlvbkhhc2giLCJTdWJzY3JpcHRpb24iLCJ3aGVyZSIsImZpZWxkcyIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQU1BOztBQUNBOztBQUNBOztBQUNBOzs7O0FBRUEsTUFBTUEsb0JBQU4sQ0FBMkI7QUFFekI7QUFJQTtBQUdBQyxFQUFBQSxXQUFXLENBQUNDLE1BQUQsRUFBY0MsTUFBVyxHQUFHLEVBQTVCLEVBQWdDQyxpQkFBc0IsR0FBRyxFQUF6RCxFQUE2RDtBQUN0RSxTQUFLRixNQUFMLEdBQWNBLE1BQWQ7QUFDQSxTQUFLRyxPQUFMLEdBQWUsSUFBSUMsR0FBSixFQUFmO0FBQ0EsU0FBS0MsYUFBTCxHQUFxQixJQUFJRCxHQUFKLEVBQXJCO0FBQ0EsU0FBS0gsTUFBTCxHQUFjQSxNQUFkO0FBRUFBLElBQUFBLE1BQU0sQ0FBQ0ssS0FBUCxHQUFlTCxNQUFNLENBQUNLLEtBQVAsSUFBZ0JDLGNBQU1DLGFBQXJDO0FBQ0FQLElBQUFBLE1BQU0sQ0FBQ1EsU0FBUCxHQUFtQlIsTUFBTSxDQUFDUSxTQUFQLElBQW9CRixjQUFNRSxTQUE3QyxDQVBzRSxDQVN0RTs7QUFDQSxVQUFNQyxRQUFRLEdBQUdULE1BQU0sQ0FBQ1MsUUFBUCxJQUFtQixFQUFwQztBQUNBLFNBQUtBLFFBQUwsR0FBZ0IsSUFBSU4sR0FBSixFQUFoQjs7QUFDQSxTQUFLLE1BQU1PLEdBQVgsSUFBa0JDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZSCxRQUFaLENBQWxCLEVBQXlDO0FBQ3ZDLFdBQUtBLFFBQUwsQ0FBY0ksR0FBZCxDQUFrQkgsR0FBbEIsRUFBdUJELFFBQVEsQ0FBQ0MsR0FBRCxDQUEvQjtBQUNEOztBQUNESSxvQkFBT0MsT0FBUCxDQUFlLG1CQUFmLEVBQW9DLEtBQUtOLFFBQXpDLEVBZnNFLENBaUJ0RTs7O0FBQ0FILGtCQUFNSyxNQUFOLENBQWFLLHFCQUFiOztBQUNBLFVBQU1DLFNBQVMsR0FBR2pCLE1BQU0sQ0FBQ2lCLFNBQVAsSUFBb0JYLGNBQU1XLFNBQTVDO0FBQ0FYLGtCQUFNVyxTQUFOLEdBQWtCQSxTQUFsQjs7QUFDQVgsa0JBQU1ZLFVBQU4sQ0FBaUJsQixNQUFNLENBQUNLLEtBQXhCLEVBQStCQyxjQUFNYSxhQUFyQyxFQUFvRG5CLE1BQU0sQ0FBQ1EsU0FBM0QsRUFyQnNFLENBdUJ0RTtBQUNBOzs7QUFDQSxTQUFLWSxlQUFMLEdBQXVCLHFDQUFtQm5CLGlCQUFuQixDQUF2QjtBQUVBRCxJQUFBQSxNQUFNLENBQUNxQixZQUFQLEdBQXNCckIsTUFBTSxDQUFDcUIsWUFBUCxJQUF1QixJQUFJLElBQWpELENBM0JzRSxDQTJCZjtBQUV2RDtBQUNBOztBQUNBLFNBQUtDLFNBQUwsR0FBaUIsSUFBSUMsaUJBQUosQ0FBUTtBQUN2QkMsTUFBQUEsR0FBRyxFQUFFLEdBRGtCO0FBQ2I7QUFDVkMsTUFBQUEsTUFBTSxFQUFFekIsTUFBTSxDQUFDcUI7QUFGUSxLQUFSLENBQWpCLENBL0JzRSxDQW1DdEU7O0FBQ0EsU0FBS0ssb0JBQUwsR0FBNEIsSUFBSUMsMENBQUosQ0FDMUI1QixNQUQwQixFQUUxQjZCLGNBQWMsSUFBSSxLQUFLQyxVQUFMLENBQWdCRCxjQUFoQixDQUZRLEVBRzFCNUIsTUFIMEIsQ0FBNUIsQ0FwQ3NFLENBMEN0RTs7QUFDQSxTQUFLOEIsVUFBTCxHQUFrQkMseUJBQVlDLGdCQUFaLENBQTZCaEMsTUFBN0IsQ0FBbEI7QUFDQSxTQUFLOEIsVUFBTCxDQUFnQkcsU0FBaEIsQ0FBMEIzQixjQUFNQyxhQUFOLEdBQXNCLFdBQWhEO0FBQ0EsU0FBS3VCLFVBQUwsQ0FBZ0JHLFNBQWhCLENBQTBCM0IsY0FBTUMsYUFBTixHQUFzQixhQUFoRCxFQTdDc0UsQ0E4Q3RFO0FBQ0E7O0FBQ0EsU0FBS3VCLFVBQUwsQ0FBZ0JJLEVBQWhCLENBQW1CLFNBQW5CLEVBQThCLENBQUNDLE9BQUQsRUFBVUMsVUFBVixLQUF5QjtBQUNyRHRCLHNCQUFPQyxPQUFQLENBQWUsdUJBQWYsRUFBd0NxQixVQUF4Qzs7QUFDQSxVQUFJQyxPQUFKOztBQUNBLFVBQUk7QUFDRkEsUUFBQUEsT0FBTyxHQUFHQyxJQUFJLENBQUNDLEtBQUwsQ0FBV0gsVUFBWCxDQUFWO0FBQ0QsT0FGRCxDQUVFLE9BQU9JLENBQVAsRUFBVTtBQUNWMUIsd0JBQU8yQixLQUFQLENBQWEseUJBQWIsRUFBd0NMLFVBQXhDLEVBQW9ESSxDQUFwRDs7QUFDQTtBQUNEOztBQUNELFdBQUtFLG1CQUFMLENBQXlCTCxPQUF6Qjs7QUFDQSxVQUFJRixPQUFPLEtBQUs3QixjQUFNQyxhQUFOLEdBQXNCLFdBQXRDLEVBQW1EO0FBQ2pELGFBQUtvQyxZQUFMLENBQWtCTixPQUFsQjtBQUNELE9BRkQsTUFFTyxJQUFJRixPQUFPLEtBQUs3QixjQUFNQyxhQUFOLEdBQXNCLGFBQXRDLEVBQXFEO0FBQzFELGFBQUtxQyxjQUFMLENBQW9CUCxPQUFwQjtBQUNELE9BRk0sTUFFQTtBQUNMdkIsd0JBQU8yQixLQUFQLENBQWEsd0NBQWIsRUFBdURKLE9BQXZELEVBQWdFRixPQUFoRTtBQUNEO0FBQ0YsS0FqQkQ7QUFrQkQsR0EzRXdCLENBNkV6QjtBQUNBOzs7QUFDQU8sRUFBQUEsbUJBQW1CLENBQUNMLE9BQUQsRUFBcUI7QUFDdEM7QUFDQSxVQUFNUSxrQkFBa0IsR0FBR1IsT0FBTyxDQUFDUSxrQkFBbkM7O0FBQ0FDLHlCQUFXQyxzQkFBWCxDQUFrQ0Ysa0JBQWxDOztBQUNBLFFBQUlHLFNBQVMsR0FBR0gsa0JBQWtCLENBQUNHLFNBQW5DO0FBQ0EsUUFBSUMsV0FBVyxHQUFHLElBQUkzQyxjQUFNSyxNQUFWLENBQWlCcUMsU0FBakIsQ0FBbEI7O0FBQ0FDLElBQUFBLFdBQVcsQ0FBQ0MsWUFBWixDQUF5Qkwsa0JBQXpCOztBQUNBUixJQUFBQSxPQUFPLENBQUNRLGtCQUFSLEdBQTZCSSxXQUE3QixDQVBzQyxDQVF0Qzs7QUFDQSxVQUFNRSxtQkFBbUIsR0FBR2QsT0FBTyxDQUFDYyxtQkFBcEM7O0FBQ0EsUUFBSUEsbUJBQUosRUFBeUI7QUFDdkJMLDJCQUFXQyxzQkFBWCxDQUFrQ0ksbUJBQWxDOztBQUNBSCxNQUFBQSxTQUFTLEdBQUdHLG1CQUFtQixDQUFDSCxTQUFoQztBQUNBQyxNQUFBQSxXQUFXLEdBQUcsSUFBSTNDLGNBQU1LLE1BQVYsQ0FBaUJxQyxTQUFqQixDQUFkOztBQUNBQyxNQUFBQSxXQUFXLENBQUNDLFlBQVosQ0FBeUJDLG1CQUF6Qjs7QUFDQWQsTUFBQUEsT0FBTyxDQUFDYyxtQkFBUixHQUE4QkYsV0FBOUI7QUFDRDtBQUNGLEdBaEd3QixDQWtHekI7QUFDQTs7O0FBQ0FMLEVBQUFBLGNBQWMsQ0FBQ1AsT0FBRCxFQUFxQjtBQUNqQ3ZCLG9CQUFPQyxPQUFQLENBQWVULGNBQU1DLGFBQU4sR0FBc0IsMEJBQXJDOztBQUVBLFFBQUk2QyxrQkFBa0IsR0FBR2YsT0FBTyxDQUFDUSxrQkFBUixDQUEyQlEsTUFBM0IsRUFBekI7QUFDQSxVQUFNQyxxQkFBcUIsR0FBR2pCLE9BQU8sQ0FBQ2lCLHFCQUF0QztBQUNBLFVBQU1OLFNBQVMsR0FBR0ksa0JBQWtCLENBQUNKLFNBQXJDOztBQUNBbEMsb0JBQU9DLE9BQVAsQ0FBZSw4QkFBZixFQUErQ2lDLFNBQS9DLEVBQTBESSxrQkFBa0IsQ0FBQ0csRUFBN0U7O0FBQ0F6QyxvQkFBT0MsT0FBUCxDQUFlLDRCQUFmLEVBQTZDLEtBQUtiLE9BQUwsQ0FBYXNELElBQTFEOztBQUVBLFVBQU1DLGtCQUFrQixHQUFHLEtBQUtyRCxhQUFMLENBQW1Cc0QsR0FBbkIsQ0FBdUJWLFNBQXZCLENBQTNCOztBQUNBLFFBQUksT0FBT1Msa0JBQVAsS0FBOEIsV0FBbEMsRUFBK0M7QUFDN0MzQyxzQkFBTzZDLEtBQVAsQ0FBYSxpREFBaURYLFNBQTlEOztBQUNBO0FBQ0Q7O0FBQ0QsU0FBSyxNQUFNWSxZQUFYLElBQTJCSCxrQkFBa0IsQ0FBQ0ksTUFBbkIsRUFBM0IsRUFBd0Q7QUFDdEQsWUFBTUMscUJBQXFCLEdBQUcsS0FBS0Msb0JBQUwsQ0FBMEJYLGtCQUExQixFQUE4Q1EsWUFBOUMsQ0FBOUI7O0FBQ0EsVUFBSSxDQUFDRSxxQkFBTCxFQUE0QjtBQUMxQjtBQUNEOztBQUNELFdBQUssTUFBTSxDQUFDRSxRQUFELEVBQVdDLFVBQVgsQ0FBWCxJQUFxQ0MsZ0JBQUVDLE9BQUYsQ0FBVVAsWUFBWSxDQUFDUSxnQkFBdkIsQ0FBckMsRUFBK0U7QUFDN0UsY0FBTUMsTUFBTSxHQUFHLEtBQUtuRSxPQUFMLENBQWF3RCxHQUFiLENBQWlCTSxRQUFqQixDQUFmOztBQUNBLFlBQUksT0FBT0ssTUFBUCxLQUFrQixXQUF0QixFQUFtQztBQUNqQztBQUNEOztBQUNELGFBQUssTUFBTUMsU0FBWCxJQUF3QkwsVUFBeEIsRUFBb0M7QUFDbEMsZ0JBQU1NLEdBQUcsR0FBR2xDLE9BQU8sQ0FBQ1Esa0JBQVIsQ0FBMkIyQixNQUEzQixFQUFaLENBRGtDLENBRWxDOztBQUNBLGdCQUFNQyxFQUFFLEdBQUcsS0FBS0MsZ0JBQUwsQ0FBc0JkLFlBQVksQ0FBQ2UsS0FBbkMsQ0FBWDs7QUFDQSxjQUFJQyxHQUFHLEdBQUcsRUFBVjs7QUFDQSxlQUFLQyxXQUFMLENBQWlCdkIscUJBQWpCLEVBQXdDakIsT0FBTyxDQUFDUSxrQkFBaEQsRUFBb0V3QixNQUFwRSxFQUE0RUMsU0FBNUUsRUFBdUZHLEVBQXZGLEVBQ0dLLElBREgsQ0FDUSxNQUFNO0FBQ1Y7QUFDQSxtQkFBTyxLQUFLQyxXQUFMLENBQWlCUixHQUFqQixFQUFzQkYsTUFBdEIsRUFBOEJDLFNBQTlCLENBQVA7QUFDRCxXQUpILEVBS0dRLElBTEgsQ0FLUUUsU0FBUyxJQUFJO0FBQ2pCLGdCQUFJLENBQUNBLFNBQUwsRUFBZ0I7QUFDZCxxQkFBTyxJQUFQO0FBQ0Q7O0FBQ0RKLFlBQUFBLEdBQUcsR0FBRztBQUNKSyxjQUFBQSxLQUFLLEVBQUUsUUFESDtBQUVKQyxjQUFBQSxZQUFZLEVBQUViLE1BQU0sQ0FBQ2EsWUFGakI7QUFHSkMsY0FBQUEsTUFBTSxFQUFFL0Isa0JBSEo7QUFJSmxELGNBQUFBLE9BQU8sRUFBRSxLQUFLQSxPQUFMLENBQWFzRCxJQUpsQjtBQUtKcEQsY0FBQUEsYUFBYSxFQUFFLEtBQUtBLGFBQUwsQ0FBbUJvRCxJQUw5QjtBQU1KNEIsY0FBQUEsWUFBWSxFQUFFZixNQUFNLENBQUNnQixZQU5qQjtBQU9KQyxjQUFBQSxjQUFjLEVBQUVqQixNQUFNLENBQUNpQixjQVBuQjtBQVFKQyxjQUFBQSxTQUFTLEVBQUU7QUFSUCxhQUFOO0FBVUEsbUJBQU8seUNBQTBCLFlBQTFCLEVBQXdDdkMsU0FBeEMsRUFBbUQ0QixHQUFuRCxDQUFQO0FBQ0QsV0FwQkgsRUFxQkdFLElBckJILENBcUJRLE1BQU07QUFDVixnQkFBSSxDQUFDRixHQUFHLENBQUNXLFNBQVQsRUFBb0I7QUFDbEI7QUFDRDs7QUFDRCxnQkFBSVgsR0FBRyxDQUFDTyxNQUFKLElBQWMsT0FBT1AsR0FBRyxDQUFDTyxNQUFKLENBQVc5QixNQUFsQixLQUE2QixVQUEvQyxFQUEyRDtBQUN6REQsY0FBQUEsa0JBQWtCLEdBQUd3QixHQUFHLENBQUNPLE1BQUosQ0FBVzlCLE1BQVgsRUFBckI7QUFDQUQsY0FBQUEsa0JBQWtCLENBQUNKLFNBQW5CLEdBQStCQSxTQUEvQjtBQUNEOztBQUNEcUIsWUFBQUEsTUFBTSxDQUFDbUIsVUFBUCxDQUFrQmxCLFNBQWxCLEVBQTZCbEIsa0JBQTdCO0FBQ0QsV0E5QkgsRUErQkdxQyxLQS9CSCxDQStCU2hELEtBQUssSUFBSTtBQUNkaUQsMkJBQU9DLFNBQVAsQ0FDRXRCLE1BQU0sQ0FBQ3VCLGNBRFQsRUFFRW5ELEtBQUssQ0FBQ29ELElBQU4sSUFBYyxHQUZoQixFQUdFcEQsS0FBSyxDQUFDSixPQUFOLElBQWlCSSxLQUhuQixFQUlFLEtBSkYsRUFLRTZCLFNBTEY7O0FBT0F4RCw0QkFBTzJCLEtBQVAsQ0FDRywrQ0FBOENPLFNBQVUsY0FBYTRCLEdBQUcsQ0FBQ0ssS0FBTSxpQkFBZ0JMLEdBQUcsQ0FBQ00sWUFBYSxrQkFBakgsR0FDRTVDLElBQUksQ0FBQ3dELFNBQUwsQ0FBZXJELEtBQWYsQ0FGSjtBQUlELFdBM0NIO0FBNENEO0FBQ0Y7QUFDRjtBQUNGLEdBaEx3QixDQWtMekI7QUFDQTs7O0FBQ0FFLEVBQUFBLFlBQVksQ0FBQ04sT0FBRCxFQUFxQjtBQUMvQnZCLG9CQUFPQyxPQUFQLENBQWVULGNBQU1DLGFBQU4sR0FBc0Isd0JBQXJDOztBQUVBLFFBQUk0QyxtQkFBbUIsR0FBRyxJQUExQjs7QUFDQSxRQUFJZCxPQUFPLENBQUNjLG1CQUFaLEVBQWlDO0FBQy9CQSxNQUFBQSxtQkFBbUIsR0FBR2QsT0FBTyxDQUFDYyxtQkFBUixDQUE0QkUsTUFBNUIsRUFBdEI7QUFDRDs7QUFDRCxVQUFNQyxxQkFBcUIsR0FBR2pCLE9BQU8sQ0FBQ2lCLHFCQUF0QztBQUNBLFFBQUlULGtCQUFrQixHQUFHUixPQUFPLENBQUNRLGtCQUFSLENBQTJCUSxNQUEzQixFQUF6QjtBQUNBLFVBQU1MLFNBQVMsR0FBR0gsa0JBQWtCLENBQUNHLFNBQXJDOztBQUNBbEMsb0JBQU9DLE9BQVAsQ0FBZSw4QkFBZixFQUErQ2lDLFNBQS9DLEVBQTBESCxrQkFBa0IsQ0FBQ1UsRUFBN0U7O0FBQ0F6QyxvQkFBT0MsT0FBUCxDQUFlLDRCQUFmLEVBQTZDLEtBQUtiLE9BQUwsQ0FBYXNELElBQTFEOztBQUVBLFVBQU1DLGtCQUFrQixHQUFHLEtBQUtyRCxhQUFMLENBQW1Cc0QsR0FBbkIsQ0FBdUJWLFNBQXZCLENBQTNCOztBQUNBLFFBQUksT0FBT1Msa0JBQVAsS0FBOEIsV0FBbEMsRUFBK0M7QUFDN0MzQyxzQkFBTzZDLEtBQVAsQ0FBYSxpREFBaURYLFNBQTlEOztBQUNBO0FBQ0Q7O0FBQ0QsU0FBSyxNQUFNWSxZQUFYLElBQTJCSCxrQkFBa0IsQ0FBQ0ksTUFBbkIsRUFBM0IsRUFBd0Q7QUFDdEQsWUFBTWtDLDZCQUE2QixHQUFHLEtBQUtoQyxvQkFBTCxDQUNwQ1osbUJBRG9DLEVBRXBDUyxZQUZvQyxDQUF0Qzs7QUFJQSxZQUFNb0MsNEJBQTRCLEdBQUcsS0FBS2pDLG9CQUFMLENBQ25DbEIsa0JBRG1DLEVBRW5DZSxZQUZtQyxDQUFyQzs7QUFJQSxXQUFLLE1BQU0sQ0FBQ0ksUUFBRCxFQUFXQyxVQUFYLENBQVgsSUFBcUNDLGdCQUFFQyxPQUFGLENBQVVQLFlBQVksQ0FBQ1EsZ0JBQXZCLENBQXJDLEVBQStFO0FBQzdFLGNBQU1DLE1BQU0sR0FBRyxLQUFLbkUsT0FBTCxDQUFhd0QsR0FBYixDQUFpQk0sUUFBakIsQ0FBZjs7QUFDQSxZQUFJLE9BQU9LLE1BQVAsS0FBa0IsV0FBdEIsRUFBbUM7QUFDakM7QUFDRDs7QUFDRCxhQUFLLE1BQU1DLFNBQVgsSUFBd0JMLFVBQXhCLEVBQW9DO0FBQ2xDO0FBQ0E7QUFDQSxjQUFJZ0MsMEJBQUo7O0FBQ0EsY0FBSSxDQUFDRiw2QkFBTCxFQUFvQztBQUNsQ0UsWUFBQUEsMEJBQTBCLEdBQUdDLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQixLQUFoQixDQUE3QjtBQUNELFdBRkQsTUFFTztBQUNMLGdCQUFJQyxXQUFKOztBQUNBLGdCQUFJL0QsT0FBTyxDQUFDYyxtQkFBWixFQUFpQztBQUMvQmlELGNBQUFBLFdBQVcsR0FBRy9ELE9BQU8sQ0FBQ2MsbUJBQVIsQ0FBNEJxQixNQUE1QixFQUFkO0FBQ0Q7O0FBQ0R5QixZQUFBQSwwQkFBMEIsR0FBRyxLQUFLbEIsV0FBTCxDQUFpQnFCLFdBQWpCLEVBQThCL0IsTUFBOUIsRUFBc0NDLFNBQXRDLENBQTdCO0FBQ0QsV0FaaUMsQ0FhbEM7QUFDQTs7O0FBQ0EsY0FBSStCLHlCQUFKO0FBQ0EsY0FBSXpCLEdBQUcsR0FBRyxFQUFWOztBQUNBLGNBQUksQ0FBQ29CLDRCQUFMLEVBQW1DO0FBQ2pDSyxZQUFBQSx5QkFBeUIsR0FBR0gsT0FBTyxDQUFDQyxPQUFSLENBQWdCLEtBQWhCLENBQTVCO0FBQ0QsV0FGRCxNQUVPO0FBQ0wsa0JBQU1HLFVBQVUsR0FBR2pFLE9BQU8sQ0FBQ1Esa0JBQVIsQ0FBMkIyQixNQUEzQixFQUFuQjtBQUNBNkIsWUFBQUEseUJBQXlCLEdBQUcsS0FBS3RCLFdBQUwsQ0FBaUJ1QixVQUFqQixFQUE2QmpDLE1BQTdCLEVBQXFDQyxTQUFyQyxDQUE1QjtBQUNEOztBQUNELGdCQUFNRyxFQUFFLEdBQUcsS0FBS0MsZ0JBQUwsQ0FBc0JkLFlBQVksQ0FBQ2UsS0FBbkMsQ0FBWDs7QUFDQSxlQUFLRSxXQUFMLENBQWlCdkIscUJBQWpCLEVBQXdDakIsT0FBTyxDQUFDUSxrQkFBaEQsRUFBb0V3QixNQUFwRSxFQUE0RUMsU0FBNUUsRUFBdUZHLEVBQXZGLEVBQ0dLLElBREgsQ0FDUSxNQUFNO0FBQ1YsbUJBQU9vQixPQUFPLENBQUNLLEdBQVIsQ0FBWSxDQUFDTiwwQkFBRCxFQUE2QkkseUJBQTdCLENBQVosQ0FBUDtBQUNELFdBSEgsRUFJR3ZCLElBSkgsQ0FJUSxDQUFDLENBQUMwQixpQkFBRCxFQUFvQkMsZ0JBQXBCLENBQUQsS0FBMkM7QUFDL0MzRiw0QkFBT0MsT0FBUCxDQUNFLDhEQURGLEVBRUVvQyxtQkFGRixFQUdFTixrQkFIRixFQUlFa0QsNkJBSkYsRUFLRUMsNEJBTEYsRUFNRVEsaUJBTkYsRUFPRUMsZ0JBUEYsRUFRRTdDLFlBQVksQ0FBQzhDLElBUmYsRUFEK0MsQ0FXL0M7OztBQUNBLGdCQUFJQyxJQUFKOztBQUNBLGdCQUFJSCxpQkFBaUIsSUFBSUMsZ0JBQXpCLEVBQTJDO0FBQ3pDRSxjQUFBQSxJQUFJLEdBQUcsUUFBUDtBQUNELGFBRkQsTUFFTyxJQUFJSCxpQkFBaUIsSUFBSSxDQUFDQyxnQkFBMUIsRUFBNEM7QUFDakRFLGNBQUFBLElBQUksR0FBRyxPQUFQO0FBQ0QsYUFGTSxNQUVBLElBQUksQ0FBQ0gsaUJBQUQsSUFBc0JDLGdCQUExQixFQUE0QztBQUNqRCxrQkFBSXRELG1CQUFKLEVBQXlCO0FBQ3ZCd0QsZ0JBQUFBLElBQUksR0FBRyxPQUFQO0FBQ0QsZUFGRCxNQUVPO0FBQ0xBLGdCQUFBQSxJQUFJLEdBQUcsUUFBUDtBQUNEO0FBQ0YsYUFOTSxNQU1BO0FBQ0wscUJBQU8sSUFBUDtBQUNEOztBQUNEdEUsWUFBQUEsT0FBTyxDQUFDNEMsS0FBUixHQUFnQjBCLElBQWhCO0FBQ0EvQixZQUFBQSxHQUFHLEdBQUc7QUFDSkssY0FBQUEsS0FBSyxFQUFFMEIsSUFESDtBQUVKekIsY0FBQUEsWUFBWSxFQUFFYixNQUFNLENBQUNhLFlBRmpCO0FBR0pDLGNBQUFBLE1BQU0sRUFBRXRDLGtCQUhKO0FBSUorRCxjQUFBQSxRQUFRLEVBQUV6RCxtQkFKTjtBQUtKakQsY0FBQUEsT0FBTyxFQUFFLEtBQUtBLE9BQUwsQ0FBYXNELElBTGxCO0FBTUpwRCxjQUFBQSxhQUFhLEVBQUUsS0FBS0EsYUFBTCxDQUFtQm9ELElBTjlCO0FBT0o0QixjQUFBQSxZQUFZLEVBQUVmLE1BQU0sQ0FBQ2dCLFlBUGpCO0FBUUpDLGNBQUFBLGNBQWMsRUFBRWpCLE1BQU0sQ0FBQ2lCLGNBUm5CO0FBU0pDLGNBQUFBLFNBQVMsRUFBRTtBQVRQLGFBQU47QUFXQSxtQkFBTyx5Q0FBMEIsWUFBMUIsRUFBd0N2QyxTQUF4QyxFQUFtRDRCLEdBQW5ELENBQVA7QUFDRCxXQTNDSCxFQTRDR0UsSUE1Q0gsQ0E2Q0ksTUFBTTtBQUNKLGdCQUFJLENBQUNGLEdBQUcsQ0FBQ1csU0FBVCxFQUFvQjtBQUNsQjtBQUNEOztBQUNELGdCQUFJWCxHQUFHLENBQUNPLE1BQUosSUFBYyxPQUFPUCxHQUFHLENBQUNPLE1BQUosQ0FBVzlCLE1BQWxCLEtBQTZCLFVBQS9DLEVBQTJEO0FBQ3pEUixjQUFBQSxrQkFBa0IsR0FBRytCLEdBQUcsQ0FBQ08sTUFBSixDQUFXOUIsTUFBWCxFQUFyQjtBQUNBUixjQUFBQSxrQkFBa0IsQ0FBQ0csU0FBbkIsR0FBK0I0QixHQUFHLENBQUNPLE1BQUosQ0FBV25DLFNBQVgsSUFBd0JBLFNBQXZEO0FBQ0Q7O0FBRUQsZ0JBQUk0QixHQUFHLENBQUNnQyxRQUFKLElBQWdCLE9BQU9oQyxHQUFHLENBQUNnQyxRQUFKLENBQWF2RCxNQUFwQixLQUErQixVQUFuRCxFQUErRDtBQUM3REYsY0FBQUEsbUJBQW1CLEdBQUd5QixHQUFHLENBQUNnQyxRQUFKLENBQWF2RCxNQUFiLEVBQXRCO0FBQ0FGLGNBQUFBLG1CQUFtQixDQUFDSCxTQUFwQixHQUFnQzRCLEdBQUcsQ0FBQ2dDLFFBQUosQ0FBYTVELFNBQWIsSUFBMEJBLFNBQTFEO0FBQ0Q7O0FBQ0Qsa0JBQU02RCxZQUFZLEdBQUcsU0FBU3hFLE9BQU8sQ0FBQzRDLEtBQXRDOztBQUNBLGdCQUFJWixNQUFNLENBQUN3QyxZQUFELENBQVYsRUFBMEI7QUFDeEJ4QyxjQUFBQSxNQUFNLENBQUN3QyxZQUFELENBQU4sQ0FBcUJ2QyxTQUFyQixFQUFnQ3pCLGtCQUFoQyxFQUFvRE0sbUJBQXBEO0FBQ0Q7QUFDRixXQTlETCxFQStESVYsS0FBSyxJQUFJO0FBQ1BpRCwyQkFBT0MsU0FBUCxDQUNFdEIsTUFBTSxDQUFDdUIsY0FEVCxFQUVFbkQsS0FBSyxDQUFDb0QsSUFBTixJQUFjLEdBRmhCLEVBR0VwRCxLQUFLLENBQUNKLE9BQU4sSUFBaUJJLEtBSG5CLEVBSUUsS0FKRixFQUtFNkIsU0FMRjs7QUFPQXhELDRCQUFPMkIsS0FBUCxDQUNHLCtDQUE4Q08sU0FBVSxjQUFhNEIsR0FBRyxDQUFDSyxLQUFNLGlCQUFnQkwsR0FBRyxDQUFDTSxZQUFhLGtCQUFqSCxHQUNFNUMsSUFBSSxDQUFDd0QsU0FBTCxDQUFlckQsS0FBZixDQUZKO0FBSUQsV0EzRUw7QUE2RUQ7QUFDRjtBQUNGO0FBQ0Y7O0FBRURaLEVBQUFBLFVBQVUsQ0FBQ0QsY0FBRCxFQUE0QjtBQUNwQ0EsSUFBQUEsY0FBYyxDQUFDTSxFQUFmLENBQWtCLFNBQWxCLEVBQTZCNEUsT0FBTyxJQUFJO0FBQ3RDLFVBQUksT0FBT0EsT0FBUCxLQUFtQixRQUF2QixFQUFpQztBQUMvQixZQUFJO0FBQ0ZBLFVBQUFBLE9BQU8sR0FBR3hFLElBQUksQ0FBQ0MsS0FBTCxDQUFXdUUsT0FBWCxDQUFWO0FBQ0QsU0FGRCxDQUVFLE9BQU90RSxDQUFQLEVBQVU7QUFDVjFCLDBCQUFPMkIsS0FBUCxDQUFhLHlCQUFiLEVBQXdDcUUsT0FBeEMsRUFBaUR0RSxDQUFqRDs7QUFDQTtBQUNEO0FBQ0Y7O0FBQ0QxQixzQkFBT0MsT0FBUCxDQUFlLGFBQWYsRUFBOEIrRixPQUE5QixFQVRzQyxDQVd0Qzs7O0FBQ0EsVUFDRSxDQUFDQyxZQUFJQyxRQUFKLENBQWFGLE9BQWIsRUFBc0JHLHVCQUFjLFNBQWQsQ0FBdEIsQ0FBRCxJQUNBLENBQUNGLFlBQUlDLFFBQUosQ0FBYUYsT0FBYixFQUFzQkcsdUJBQWNILE9BQU8sQ0FBQ3JDLEVBQXRCLENBQXRCLENBRkgsRUFHRTtBQUNBaUIsdUJBQU9DLFNBQVAsQ0FBaUIvRCxjQUFqQixFQUFpQyxDQUFqQyxFQUFvQ21GLFlBQUl0RSxLQUFKLENBQVVKLE9BQTlDOztBQUNBdkIsd0JBQU8yQixLQUFQLENBQWEsMEJBQWIsRUFBeUNzRSxZQUFJdEUsS0FBSixDQUFVSixPQUFuRDs7QUFDQTtBQUNEOztBQUVELGNBQVF5RSxPQUFPLENBQUNyQyxFQUFoQjtBQUNFLGFBQUssU0FBTDtBQUNFLGVBQUt5QyxjQUFMLENBQW9CdEYsY0FBcEIsRUFBb0NrRixPQUFwQzs7QUFDQTs7QUFDRixhQUFLLFdBQUw7QUFDRSxlQUFLSyxnQkFBTCxDQUFzQnZGLGNBQXRCLEVBQXNDa0YsT0FBdEM7O0FBQ0E7O0FBQ0YsYUFBSyxRQUFMO0FBQ0UsZUFBS00seUJBQUwsQ0FBK0J4RixjQUEvQixFQUErQ2tGLE9BQS9DOztBQUNBOztBQUNGLGFBQUssYUFBTDtBQUNFLGVBQUtPLGtCQUFMLENBQXdCekYsY0FBeEIsRUFBd0NrRixPQUF4Qzs7QUFDQTs7QUFDRjtBQUNFcEIseUJBQU9DLFNBQVAsQ0FBaUIvRCxjQUFqQixFQUFpQyxDQUFqQyxFQUFvQyx1QkFBcEM7O0FBQ0FkLDBCQUFPMkIsS0FBUCxDQUFhLHVCQUFiLEVBQXNDcUUsT0FBTyxDQUFDckMsRUFBOUM7O0FBZko7QUFpQkQsS0F0Q0Q7QUF3Q0E3QyxJQUFBQSxjQUFjLENBQUNNLEVBQWYsQ0FBa0IsWUFBbEIsRUFBZ0MsTUFBTTtBQUNwQ3BCLHNCQUFPd0csSUFBUCxDQUFhLHNCQUFxQjFGLGNBQWMsQ0FBQ29DLFFBQVMsRUFBMUQ7O0FBQ0EsWUFBTUEsUUFBUSxHQUFHcEMsY0FBYyxDQUFDb0MsUUFBaEM7O0FBQ0EsVUFBSSxDQUFDLEtBQUs5RCxPQUFMLENBQWFxSCxHQUFiLENBQWlCdkQsUUFBakIsQ0FBTCxFQUFpQztBQUMvQixpREFBMEI7QUFDeEJpQixVQUFBQSxLQUFLLEVBQUUscUJBRGlCO0FBRXhCL0UsVUFBQUEsT0FBTyxFQUFFLEtBQUtBLE9BQUwsQ0FBYXNELElBRkU7QUFHeEJwRCxVQUFBQSxhQUFhLEVBQUUsS0FBS0EsYUFBTCxDQUFtQm9ELElBSFY7QUFJeEJmLFVBQUFBLEtBQUssRUFBRyx5QkFBd0J1QixRQUFTO0FBSmpCLFNBQTFCOztBQU1BbEQsd0JBQU8yQixLQUFQLENBQWMsdUJBQXNCdUIsUUFBUyxnQkFBN0M7O0FBQ0E7QUFDRCxPQVptQyxDQWNwQzs7O0FBQ0EsWUFBTUssTUFBTSxHQUFHLEtBQUtuRSxPQUFMLENBQWF3RCxHQUFiLENBQWlCTSxRQUFqQixDQUFmO0FBQ0EsV0FBSzlELE9BQUwsQ0FBYXNILE1BQWIsQ0FBb0J4RCxRQUFwQixFQWhCb0MsQ0FrQnBDOztBQUNBLFdBQUssTUFBTSxDQUFDTSxTQUFELEVBQVltRCxnQkFBWixDQUFYLElBQTRDdkQsZ0JBQUVDLE9BQUYsQ0FBVUUsTUFBTSxDQUFDcUQsaUJBQWpCLENBQTVDLEVBQWlGO0FBQy9FLGNBQU05RCxZQUFZLEdBQUc2RCxnQkFBZ0IsQ0FBQzdELFlBQXRDO0FBQ0FBLFFBQUFBLFlBQVksQ0FBQytELHdCQUFiLENBQXNDM0QsUUFBdEMsRUFBZ0RNLFNBQWhELEVBRitFLENBSS9FOztBQUNBLGNBQU1iLGtCQUFrQixHQUFHLEtBQUtyRCxhQUFMLENBQW1Cc0QsR0FBbkIsQ0FBdUJFLFlBQVksQ0FBQ1osU0FBcEMsQ0FBM0I7O0FBQ0EsWUFBSSxDQUFDWSxZQUFZLENBQUNnRSxvQkFBYixFQUFMLEVBQTBDO0FBQ3hDbkUsVUFBQUEsa0JBQWtCLENBQUMrRCxNQUFuQixDQUEwQjVELFlBQVksQ0FBQzhDLElBQXZDO0FBQ0QsU0FSOEUsQ0FTL0U7OztBQUNBLFlBQUlqRCxrQkFBa0IsQ0FBQ0QsSUFBbkIsS0FBNEIsQ0FBaEMsRUFBbUM7QUFDakMsZUFBS3BELGFBQUwsQ0FBbUJvSCxNQUFuQixDQUEwQjVELFlBQVksQ0FBQ1osU0FBdkM7QUFDRDtBQUNGOztBQUVEbEMsc0JBQU9DLE9BQVAsQ0FBZSxvQkFBZixFQUFxQyxLQUFLYixPQUFMLENBQWFzRCxJQUFsRDs7QUFDQTFDLHNCQUFPQyxPQUFQLENBQWUsMEJBQWYsRUFBMkMsS0FBS1gsYUFBTCxDQUFtQm9ELElBQTlEOztBQUNBLCtDQUEwQjtBQUN4QnlCLFFBQUFBLEtBQUssRUFBRSxlQURpQjtBQUV4Qi9FLFFBQUFBLE9BQU8sRUFBRSxLQUFLQSxPQUFMLENBQWFzRCxJQUZFO0FBR3hCcEQsUUFBQUEsYUFBYSxFQUFFLEtBQUtBLGFBQUwsQ0FBbUJvRCxJQUhWO0FBSXhCNEIsUUFBQUEsWUFBWSxFQUFFZixNQUFNLENBQUNnQixZQUpHO0FBS3hCQyxRQUFBQSxjQUFjLEVBQUVqQixNQUFNLENBQUNpQjtBQUxDLE9BQTFCO0FBT0QsS0EzQ0Q7QUE2Q0EsNkNBQTBCO0FBQ3hCTCxNQUFBQSxLQUFLLEVBQUUsWUFEaUI7QUFFeEIvRSxNQUFBQSxPQUFPLEVBQUUsS0FBS0EsT0FBTCxDQUFhc0QsSUFGRTtBQUd4QnBELE1BQUFBLGFBQWEsRUFBRSxLQUFLQSxhQUFMLENBQW1Cb0Q7QUFIVixLQUExQjtBQUtEOztBQUVETyxFQUFBQSxvQkFBb0IsQ0FBQ2QsV0FBRCxFQUFtQlcsWUFBbkIsRUFBK0M7QUFDakU7QUFDQSxRQUFJLENBQUNYLFdBQUwsRUFBa0I7QUFDaEIsYUFBTyxLQUFQO0FBQ0Q7O0FBQ0QsV0FBTyw4QkFBYUEsV0FBYixFQUEwQlcsWUFBWSxDQUFDZSxLQUF2QyxDQUFQO0FBQ0Q7O0FBRURrRCxFQUFBQSxzQkFBc0IsQ0FBQzNDLFlBQUQsRUFBbUU7QUFDdkYsUUFBSSxDQUFDQSxZQUFMLEVBQW1CO0FBQ2pCLGFBQU9nQixPQUFPLENBQUNDLE9BQVIsQ0FBZ0IsRUFBaEIsQ0FBUDtBQUNEOztBQUNELFVBQU0yQixTQUFTLEdBQUcsS0FBS3hHLFNBQUwsQ0FBZW9DLEdBQWYsQ0FBbUJ3QixZQUFuQixDQUFsQjs7QUFDQSxRQUFJNEMsU0FBSixFQUFlO0FBQ2IsYUFBT0EsU0FBUDtBQUNEOztBQUNELFVBQU1DLFdBQVcsR0FBRyxrQ0FBdUI7QUFDekMzRyxNQUFBQSxlQUFlLEVBQUUsS0FBS0EsZUFEbUI7QUFFekM4RCxNQUFBQSxZQUFZLEVBQUVBO0FBRjJCLEtBQXZCLEVBSWpCSixJQUppQixDQUlaa0QsSUFBSSxJQUFJO0FBQ1osYUFBTztBQUFFQSxRQUFBQSxJQUFGO0FBQVFDLFFBQUFBLE1BQU0sRUFBRUQsSUFBSSxJQUFJQSxJQUFJLENBQUNFLElBQWIsSUFBcUJGLElBQUksQ0FBQ0UsSUFBTCxDQUFVM0U7QUFBL0MsT0FBUDtBQUNELEtBTmlCLEVBT2pCa0MsS0FQaUIsQ0FPWGhELEtBQUssSUFBSTtBQUNkO0FBQ0EsWUFBTTBGLE1BQU0sR0FBRyxFQUFmOztBQUNBLFVBQUkxRixLQUFLLElBQUlBLEtBQUssQ0FBQ29ELElBQU4sS0FBZXZGLGNBQU04SCxLQUFOLENBQVlDLHFCQUF4QyxFQUErRDtBQUM3REYsUUFBQUEsTUFBTSxDQUFDMUYsS0FBUCxHQUFlQSxLQUFmO0FBQ0EsYUFBS25CLFNBQUwsQ0FBZVQsR0FBZixDQUFtQnFFLFlBQW5CLEVBQWlDZ0IsT0FBTyxDQUFDQyxPQUFSLENBQWdCZ0MsTUFBaEIsQ0FBakMsRUFBMEQsS0FBS25JLE1BQUwsQ0FBWXFCLFlBQXRFO0FBQ0QsT0FIRCxNQUdPO0FBQ0wsYUFBS0MsU0FBTCxDQUFlZ0gsR0FBZixDQUFtQnBELFlBQW5CO0FBQ0Q7O0FBQ0QsYUFBT2lELE1BQVA7QUFDRCxLQWpCaUIsQ0FBcEI7QUFrQkEsU0FBSzdHLFNBQUwsQ0FBZVQsR0FBZixDQUFtQnFFLFlBQW5CLEVBQWlDNkMsV0FBakM7QUFDQSxXQUFPQSxXQUFQO0FBQ0Q7O0FBRUQsUUFBTWxELFdBQU4sQ0FDRXZCLHFCQURGLEVBRUU2QixNQUZGLEVBR0VkLE1BSEYsRUFJRUMsU0FKRixFQUtFRyxFQUxGLEVBTU87QUFDTDtBQUNBLFVBQU1nRCxnQkFBZ0IsR0FBR3BELE1BQU0sQ0FBQ2tFLG1CQUFQLENBQTJCakUsU0FBM0IsQ0FBekI7QUFDQSxVQUFNa0UsUUFBUSxHQUFHLENBQUMsR0FBRCxDQUFqQjtBQUNBLFFBQUlQLE1BQUo7O0FBQ0EsUUFBSSxPQUFPUixnQkFBUCxLQUE0QixXQUFoQyxFQUE2QztBQUMzQyxZQUFNO0FBQUVRLFFBQUFBO0FBQUYsVUFBYSxNQUFNLEtBQUtKLHNCQUFMLENBQTRCSixnQkFBZ0IsQ0FBQ3ZDLFlBQTdDLENBQXpCOztBQUNBLFVBQUkrQyxNQUFKLEVBQVk7QUFDVk8sUUFBQUEsUUFBUSxDQUFDQyxJQUFULENBQWNSLE1BQWQ7QUFDRDtBQUNGOztBQUNELFFBQUk7QUFDRixZQUFNUywwQkFBaUJDLGtCQUFqQixDQUNKckYscUJBREksRUFFSjZCLE1BQU0sQ0FBQ25DLFNBRkgsRUFHSndGLFFBSEksRUFJSi9ELEVBSkksQ0FBTjtBQU1BLGFBQU8sSUFBUDtBQUNELEtBUkQsQ0FRRSxPQUFPakMsQ0FBUCxFQUFVO0FBQ1YxQixzQkFBT0MsT0FBUCxDQUFnQiwyQkFBMEJvRSxNQUFNLENBQUM1QixFQUFHLElBQUcwRSxNQUFPLElBQUd6RixDQUFFLEVBQW5FOztBQUNBLGFBQU8sS0FBUDtBQUNELEtBdEJJLENBdUJMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBQ0Q7O0FBRURrQyxFQUFBQSxnQkFBZ0IsQ0FBQ0MsS0FBRCxFQUFhO0FBQzNCLFdBQU8sT0FBT0EsS0FBUCxLQUFpQixRQUFqQixJQUNMaEUsTUFBTSxDQUFDQyxJQUFQLENBQVkrRCxLQUFaLEVBQW1CaUUsTUFBbkIsSUFBNkIsQ0FEeEIsSUFFTCxPQUFPakUsS0FBSyxDQUFDa0UsUUFBYixLQUEwQixRQUZyQixHQUdILEtBSEcsR0FJSCxNQUpKO0FBS0Q7O0FBRUQsUUFBTUMsVUFBTixDQUFpQnZFLEdBQWpCLEVBQTJCd0UsS0FBM0IsRUFBMEM7QUFDeEMsUUFBSSxDQUFDQSxLQUFMLEVBQVk7QUFDVixhQUFPLEtBQVA7QUFDRDs7QUFFRCxVQUFNO0FBQUVmLE1BQUFBLElBQUY7QUFBUUMsTUFBQUE7QUFBUixRQUFtQixNQUFNLEtBQUtKLHNCQUFMLENBQTRCa0IsS0FBNUIsQ0FBL0IsQ0FMd0MsQ0FPeEM7QUFDQTtBQUNBOztBQUNBLFFBQUksQ0FBQ2YsSUFBRCxJQUFTLENBQUNDLE1BQWQsRUFBc0I7QUFDcEIsYUFBTyxLQUFQO0FBQ0Q7O0FBQ0QsVUFBTWUsaUNBQWlDLEdBQUd6RSxHQUFHLENBQUMwRSxhQUFKLENBQWtCaEIsTUFBbEIsQ0FBMUM7O0FBQ0EsUUFBSWUsaUNBQUosRUFBdUM7QUFDckMsYUFBTyxJQUFQO0FBQ0QsS0FoQnVDLENBa0J4Qzs7O0FBQ0EsV0FBTzlDLE9BQU8sQ0FBQ0MsT0FBUixHQUNKckIsSUFESSxDQUNDLFlBQVk7QUFDaEI7QUFDQSxZQUFNb0UsYUFBYSxHQUFHdkksTUFBTSxDQUFDQyxJQUFQLENBQVkyRCxHQUFHLENBQUM0RSxlQUFoQixFQUFpQ0MsSUFBakMsQ0FBc0MxSSxHQUFHLElBQUlBLEdBQUcsQ0FBQzJJLFVBQUosQ0FBZSxPQUFmLENBQTdDLENBQXRCOztBQUNBLFVBQUksQ0FBQ0gsYUFBTCxFQUFvQjtBQUNsQixlQUFPLEtBQVA7QUFDRDs7QUFFRCxZQUFNSSxTQUFTLEdBQUcsTUFBTXRCLElBQUksQ0FBQ3VCLFlBQUwsRUFBeEIsQ0FQZ0IsQ0FRaEI7O0FBQ0EsV0FBSyxNQUFNQyxJQUFYLElBQW1CRixTQUFuQixFQUE4QjtBQUM1QjtBQUNBLFlBQUkvRSxHQUFHLENBQUMwRSxhQUFKLENBQWtCTyxJQUFsQixDQUFKLEVBQTZCO0FBQzNCLGlCQUFPLElBQVA7QUFDRDtBQUNGOztBQUNELGFBQU8sS0FBUDtBQUNELEtBakJJLEVBa0JKL0QsS0FsQkksQ0FrQkUsTUFBTTtBQUNYLGFBQU8sS0FBUDtBQUNELEtBcEJJLENBQVA7QUFxQkQ7O0FBRUQsUUFBTVYsV0FBTixDQUFrQlIsR0FBbEIsRUFBNEJGLE1BQTVCLEVBQXlDQyxTQUF6QyxFQUE4RTtBQUM1RTtBQUNBLFFBQUksQ0FBQ0MsR0FBRCxJQUFRQSxHQUFHLENBQUNrRixtQkFBSixFQUFSLElBQXFDcEYsTUFBTSxDQUFDZ0IsWUFBaEQsRUFBOEQ7QUFDNUQsYUFBTyxJQUFQO0FBQ0QsS0FKMkUsQ0FLNUU7OztBQUNBLFVBQU1vQyxnQkFBZ0IsR0FBR3BELE1BQU0sQ0FBQ2tFLG1CQUFQLENBQTJCakUsU0FBM0IsQ0FBekI7O0FBQ0EsUUFBSSxPQUFPbUQsZ0JBQVAsS0FBNEIsV0FBaEMsRUFBNkM7QUFDM0MsYUFBTyxLQUFQO0FBQ0Q7O0FBRUQsVUFBTWlDLGlCQUFpQixHQUFHakMsZ0JBQWdCLENBQUN2QyxZQUEzQztBQUNBLFVBQU15RSxrQkFBa0IsR0FBR3RGLE1BQU0sQ0FBQ2EsWUFBbEM7O0FBRUEsUUFBSSxNQUFNLEtBQUs0RCxVQUFMLENBQWdCdkUsR0FBaEIsRUFBcUJtRixpQkFBckIsQ0FBVixFQUFtRDtBQUNqRCxhQUFPLElBQVA7QUFDRDs7QUFFRCxRQUFJLE1BQU0sS0FBS1osVUFBTCxDQUFnQnZFLEdBQWhCLEVBQXFCb0Ysa0JBQXJCLENBQVYsRUFBb0Q7QUFDbEQsYUFBTyxJQUFQO0FBQ0Q7O0FBRUQsV0FBTyxLQUFQO0FBQ0Q7O0FBRUQsUUFBTXpDLGNBQU4sQ0FBcUJ0RixjQUFyQixFQUEwQ2tGLE9BQTFDLEVBQTZEO0FBQzNELFFBQUksQ0FBQyxLQUFLOEMsYUFBTCxDQUFtQjlDLE9BQW5CLEVBQTRCLEtBQUtyRyxRQUFqQyxDQUFMLEVBQWlEO0FBQy9DaUYscUJBQU9DLFNBQVAsQ0FBaUIvRCxjQUFqQixFQUFpQyxDQUFqQyxFQUFvQyw2QkFBcEM7O0FBQ0FkLHNCQUFPMkIsS0FBUCxDQUFhLDZCQUFiOztBQUNBO0FBQ0Q7O0FBQ0QsVUFBTTRDLFlBQVksR0FBRyxLQUFLd0UsYUFBTCxDQUFtQi9DLE9BQW5CLEVBQTRCLEtBQUtyRyxRQUFqQyxDQUFyQjs7QUFDQSxVQUFNdUQsUUFBUSxHQUFHLGVBQWpCO0FBQ0EsVUFBTUssTUFBTSxHQUFHLElBQUlxQixjQUFKLENBQ2IxQixRQURhLEVBRWJwQyxjQUZhLEVBR2J5RCxZQUhhLEVBSWJ5QixPQUFPLENBQUM1QixZQUpLLEVBS2I0QixPQUFPLENBQUN4QixjQUxLLENBQWY7O0FBT0EsUUFBSTtBQUNGLFlBQU13RSxHQUFHLEdBQUc7QUFDVnpGLFFBQUFBLE1BRFU7QUFFVlksUUFBQUEsS0FBSyxFQUFFLFNBRkc7QUFHVi9FLFFBQUFBLE9BQU8sRUFBRSxLQUFLQSxPQUFMLENBQWFzRCxJQUhaO0FBSVZwRCxRQUFBQSxhQUFhLEVBQUUsS0FBS0EsYUFBTCxDQUFtQm9ELElBSnhCO0FBS1YwQixRQUFBQSxZQUFZLEVBQUU0QixPQUFPLENBQUM1QixZQUxaO0FBTVZFLFFBQUFBLFlBQVksRUFBRWYsTUFBTSxDQUFDZ0IsWUFOWDtBQU9WQyxRQUFBQSxjQUFjLEVBQUV3QixPQUFPLENBQUN4QjtBQVBkLE9BQVo7QUFTQSxZQUFNLHNDQUF1QixlQUF2QixFQUF3Q3dFLEdBQXhDLENBQU47QUFDQWxJLE1BQUFBLGNBQWMsQ0FBQ29DLFFBQWYsR0FBMEJBLFFBQTFCO0FBQ0EsV0FBSzlELE9BQUwsQ0FBYVcsR0FBYixDQUFpQmUsY0FBYyxDQUFDb0MsUUFBaEMsRUFBMENLLE1BQTFDOztBQUNBdkQsc0JBQU93RyxJQUFQLENBQWEsc0JBQXFCMUYsY0FBYyxDQUFDb0MsUUFBUyxFQUExRDs7QUFDQUssTUFBQUEsTUFBTSxDQUFDMEYsV0FBUDtBQUNBLCtDQUEwQkQsR0FBMUI7QUFDRCxLQWhCRCxDQWdCRSxPQUFPckgsS0FBUCxFQUFjO0FBQ2RpRCxxQkFBT0MsU0FBUCxDQUFpQi9ELGNBQWpCLEVBQWlDYSxLQUFLLENBQUNvRCxJQUFOLElBQWMsR0FBL0MsRUFBb0RwRCxLQUFLLENBQUNKLE9BQU4sSUFBaUJJLEtBQXJFLEVBQTRFLEtBQTVFOztBQUNBM0Isc0JBQU8yQixLQUFQLENBQ0csNENBQTJDcUUsT0FBTyxDQUFDNUIsWUFBYSxrQkFBakUsR0FDRTVDLElBQUksQ0FBQ3dELFNBQUwsQ0FBZXJELEtBQWYsQ0FGSjtBQUlEO0FBQ0Y7O0FBRURvSCxFQUFBQSxhQUFhLENBQUMvQyxPQUFELEVBQWVrRCxhQUFmLEVBQTRDO0FBQ3ZELFFBQUksQ0FBQ0EsYUFBRCxJQUFrQkEsYUFBYSxDQUFDeEcsSUFBZCxJQUFzQixDQUF4QyxJQUE2QyxDQUFDd0csYUFBYSxDQUFDekMsR0FBZCxDQUFrQixXQUFsQixDQUFsRCxFQUFrRjtBQUNoRixhQUFPLEtBQVA7QUFDRDs7QUFDRCxRQUFJLENBQUNULE9BQUQsSUFBWSxDQUFDbkcsTUFBTSxDQUFDc0osU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDckQsT0FBckMsRUFBOEMsV0FBOUMsQ0FBakIsRUFBNkU7QUFDM0UsYUFBTyxLQUFQO0FBQ0Q7O0FBQ0QsV0FBT0EsT0FBTyxDQUFDdEcsU0FBUixLQUFzQndKLGFBQWEsQ0FBQ3RHLEdBQWQsQ0FBa0IsV0FBbEIsQ0FBN0I7QUFDRDs7QUFFRGtHLEVBQUFBLGFBQWEsQ0FBQzlDLE9BQUQsRUFBZWtELGFBQWYsRUFBNEM7QUFDdkQsUUFBSSxDQUFDQSxhQUFELElBQWtCQSxhQUFhLENBQUN4RyxJQUFkLElBQXNCLENBQTVDLEVBQStDO0FBQzdDLGFBQU8sSUFBUDtBQUNEOztBQUNELFFBQUk0RyxPQUFPLEdBQUcsS0FBZDs7QUFDQSxTQUFLLE1BQU0sQ0FBQzFKLEdBQUQsRUFBTTJKLE1BQU4sQ0FBWCxJQUE0QkwsYUFBNUIsRUFBMkM7QUFDekMsVUFBSSxDQUFDbEQsT0FBTyxDQUFDcEcsR0FBRCxDQUFSLElBQWlCb0csT0FBTyxDQUFDcEcsR0FBRCxDQUFQLEtBQWlCMkosTUFBdEMsRUFBOEM7QUFDNUM7QUFDRDs7QUFDREQsTUFBQUEsT0FBTyxHQUFHLElBQVY7QUFDQTtBQUNEOztBQUNELFdBQU9BLE9BQVA7QUFDRDs7QUFFRCxRQUFNakQsZ0JBQU4sQ0FBdUJ2RixjQUF2QixFQUE0Q2tGLE9BQTVDLEVBQStEO0FBQzdEO0FBQ0EsUUFBSSxDQUFDbkcsTUFBTSxDQUFDc0osU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDdkksY0FBckMsRUFBcUQsVUFBckQsQ0FBTCxFQUF1RTtBQUNyRThELHFCQUFPQyxTQUFQLENBQ0UvRCxjQURGLEVBRUUsQ0FGRixFQUdFLDhFQUhGOztBQUtBZCxzQkFBTzJCLEtBQVAsQ0FBYSw4RUFBYjs7QUFDQTtBQUNEOztBQUNELFVBQU00QixNQUFNLEdBQUcsS0FBS25FLE9BQUwsQ0FBYXdELEdBQWIsQ0FBaUI5QixjQUFjLENBQUNvQyxRQUFoQyxDQUFmO0FBQ0EsVUFBTWhCLFNBQVMsR0FBRzhELE9BQU8sQ0FBQ25DLEtBQVIsQ0FBYzNCLFNBQWhDOztBQUNBLFFBQUk7QUFDRixZQUFNLHdDQUF5QixpQkFBekIsRUFBNENBLFNBQTVDLEVBQXVEOEQsT0FBdkQsQ0FBTixDQURFLENBR0Y7O0FBQ0EsWUFBTXdELGdCQUFnQixHQUFHLDJCQUFVeEQsT0FBTyxDQUFDbkMsS0FBbEIsQ0FBekIsQ0FKRSxDQUtGOztBQUVBLFVBQUksQ0FBQyxLQUFLdkUsYUFBTCxDQUFtQm1ILEdBQW5CLENBQXVCdkUsU0FBdkIsQ0FBTCxFQUF3QztBQUN0QyxhQUFLNUMsYUFBTCxDQUFtQlMsR0FBbkIsQ0FBdUJtQyxTQUF2QixFQUFrQyxJQUFJN0MsR0FBSixFQUFsQztBQUNEOztBQUNELFlBQU1zRCxrQkFBa0IsR0FBRyxLQUFLckQsYUFBTCxDQUFtQnNELEdBQW5CLENBQXVCVixTQUF2QixDQUEzQjtBQUNBLFVBQUlZLFlBQUo7O0FBQ0EsVUFBSUgsa0JBQWtCLENBQUM4RCxHQUFuQixDQUF1QitDLGdCQUF2QixDQUFKLEVBQThDO0FBQzVDMUcsUUFBQUEsWUFBWSxHQUFHSCxrQkFBa0IsQ0FBQ0MsR0FBbkIsQ0FBdUI0RyxnQkFBdkIsQ0FBZjtBQUNELE9BRkQsTUFFTztBQUNMMUcsUUFBQUEsWUFBWSxHQUFHLElBQUkyRywwQkFBSixDQUFpQnZILFNBQWpCLEVBQTRCOEQsT0FBTyxDQUFDbkMsS0FBUixDQUFjNkYsS0FBMUMsRUFBaURGLGdCQUFqRCxDQUFmO0FBQ0E3RyxRQUFBQSxrQkFBa0IsQ0FBQzVDLEdBQW5CLENBQXVCeUosZ0JBQXZCLEVBQXlDMUcsWUFBekM7QUFDRCxPQWpCQyxDQW1CRjs7O0FBQ0EsWUFBTTZELGdCQUFnQixHQUFHO0FBQ3ZCN0QsUUFBQUEsWUFBWSxFQUFFQTtBQURTLE9BQXpCLENBcEJFLENBdUJGOztBQUNBLFVBQUlrRCxPQUFPLENBQUNuQyxLQUFSLENBQWM4RixNQUFsQixFQUEwQjtBQUN4QmhELFFBQUFBLGdCQUFnQixDQUFDZ0QsTUFBakIsR0FBMEIzRCxPQUFPLENBQUNuQyxLQUFSLENBQWM4RixNQUF4QztBQUNEOztBQUNELFVBQUkzRCxPQUFPLENBQUM1QixZQUFaLEVBQTBCO0FBQ3hCdUMsUUFBQUEsZ0JBQWdCLENBQUN2QyxZQUFqQixHQUFnQzRCLE9BQU8sQ0FBQzVCLFlBQXhDO0FBQ0Q7O0FBQ0RiLE1BQUFBLE1BQU0sQ0FBQ3FHLG1CQUFQLENBQTJCNUQsT0FBTyxDQUFDeEMsU0FBbkMsRUFBOENtRCxnQkFBOUMsRUE5QkUsQ0FnQ0Y7O0FBQ0E3RCxNQUFBQSxZQUFZLENBQUMrRyxxQkFBYixDQUFtQy9JLGNBQWMsQ0FBQ29DLFFBQWxELEVBQTREOEMsT0FBTyxDQUFDeEMsU0FBcEU7QUFFQUQsTUFBQUEsTUFBTSxDQUFDdUcsYUFBUCxDQUFxQjlELE9BQU8sQ0FBQ3hDLFNBQTdCOztBQUVBeEQsc0JBQU9DLE9BQVAsQ0FDRyxpQkFBZ0JhLGNBQWMsQ0FBQ29DLFFBQVMsc0JBQXFCOEMsT0FBTyxDQUFDeEMsU0FBVSxFQURsRjs7QUFHQXhELHNCQUFPQyxPQUFQLENBQWUsMkJBQWYsRUFBNEMsS0FBS2IsT0FBTCxDQUFhc0QsSUFBekQ7O0FBQ0EsK0NBQTBCO0FBQ3hCYSxRQUFBQSxNQUR3QjtBQUV4QlksUUFBQUEsS0FBSyxFQUFFLFdBRmlCO0FBR3hCL0UsUUFBQUEsT0FBTyxFQUFFLEtBQUtBLE9BQUwsQ0FBYXNELElBSEU7QUFJeEJwRCxRQUFBQSxhQUFhLEVBQUUsS0FBS0EsYUFBTCxDQUFtQm9ELElBSlY7QUFLeEIwQixRQUFBQSxZQUFZLEVBQUU0QixPQUFPLENBQUM1QixZQUxFO0FBTXhCRSxRQUFBQSxZQUFZLEVBQUVmLE1BQU0sQ0FBQ2dCLFlBTkc7QUFPeEJDLFFBQUFBLGNBQWMsRUFBRWpCLE1BQU0sQ0FBQ2lCO0FBUEMsT0FBMUI7QUFTRCxLQWxERCxDQWtERSxPQUFPOUMsQ0FBUCxFQUFVO0FBQ1ZrRCxxQkFBT0MsU0FBUCxDQUFpQi9ELGNBQWpCLEVBQWlDWSxDQUFDLENBQUNxRCxJQUFGLElBQVUsR0FBM0MsRUFBZ0RyRCxDQUFDLENBQUNILE9BQUYsSUFBYUcsQ0FBN0QsRUFBZ0UsS0FBaEUsRUFBdUVzRSxPQUFPLENBQUN4QyxTQUEvRTs7QUFDQXhELHNCQUFPMkIsS0FBUCxDQUNHLHFDQUFvQ08sU0FBVSxnQkFBZThELE9BQU8sQ0FBQzVCLFlBQWEsa0JBQW5GLEdBQ0U1QyxJQUFJLENBQUN3RCxTQUFMLENBQWV0RCxDQUFmLENBRko7QUFJRDtBQUNGOztBQUVENEUsRUFBQUEseUJBQXlCLENBQUN4RixjQUFELEVBQXNCa0YsT0FBdEIsRUFBeUM7QUFDaEUsU0FBS08sa0JBQUwsQ0FBd0J6RixjQUF4QixFQUF3Q2tGLE9BQXhDLEVBQWlELEtBQWpEOztBQUNBLFNBQUtLLGdCQUFMLENBQXNCdkYsY0FBdEIsRUFBc0NrRixPQUF0QztBQUNEOztBQUVETyxFQUFBQSxrQkFBa0IsQ0FBQ3pGLGNBQUQsRUFBc0JrRixPQUF0QixFQUFvQytELFlBQXFCLEdBQUcsSUFBNUQsRUFBdUU7QUFDdkY7QUFDQSxRQUFJLENBQUNsSyxNQUFNLENBQUNzSixTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUN2SSxjQUFyQyxFQUFxRCxVQUFyRCxDQUFMLEVBQXVFO0FBQ3JFOEQscUJBQU9DLFNBQVAsQ0FDRS9ELGNBREYsRUFFRSxDQUZGLEVBR0UsZ0ZBSEY7O0FBS0FkLHNCQUFPMkIsS0FBUCxDQUNFLGdGQURGOztBQUdBO0FBQ0Q7O0FBQ0QsVUFBTTZCLFNBQVMsR0FBR3dDLE9BQU8sQ0FBQ3hDLFNBQTFCO0FBQ0EsVUFBTUQsTUFBTSxHQUFHLEtBQUtuRSxPQUFMLENBQWF3RCxHQUFiLENBQWlCOUIsY0FBYyxDQUFDb0MsUUFBaEMsQ0FBZjs7QUFDQSxRQUFJLE9BQU9LLE1BQVAsS0FBa0IsV0FBdEIsRUFBbUM7QUFDakNxQixxQkFBT0MsU0FBUCxDQUNFL0QsY0FERixFQUVFLENBRkYsRUFHRSxzQ0FDRUEsY0FBYyxDQUFDb0MsUUFEakIsR0FFRSxvRUFMSjs7QUFPQWxELHNCQUFPMkIsS0FBUCxDQUFhLDhCQUE4QmIsY0FBYyxDQUFDb0MsUUFBMUQ7O0FBQ0E7QUFDRDs7QUFFRCxVQUFNeUQsZ0JBQWdCLEdBQUdwRCxNQUFNLENBQUNrRSxtQkFBUCxDQUEyQmpFLFNBQTNCLENBQXpCOztBQUNBLFFBQUksT0FBT21ELGdCQUFQLEtBQTRCLFdBQWhDLEVBQTZDO0FBQzNDL0IscUJBQU9DLFNBQVAsQ0FDRS9ELGNBREYsRUFFRSxDQUZGLEVBR0UsNENBQ0VBLGNBQWMsQ0FBQ29DLFFBRGpCLEdBRUUsa0JBRkYsR0FHRU0sU0FIRixHQUlFLHNFQVBKOztBQVNBeEQsc0JBQU8yQixLQUFQLENBQ0UsNkNBQ0ViLGNBQWMsQ0FBQ29DLFFBRGpCLEdBRUUsa0JBRkYsR0FHRU0sU0FKSjs7QUFNQTtBQUNELEtBN0NzRixDQStDdkY7OztBQUNBRCxJQUFBQSxNQUFNLENBQUN5RyxzQkFBUCxDQUE4QnhHLFNBQTlCLEVBaER1RixDQWlEdkY7O0FBQ0EsVUFBTVYsWUFBWSxHQUFHNkQsZ0JBQWdCLENBQUM3RCxZQUF0QztBQUNBLFVBQU1aLFNBQVMsR0FBR1ksWUFBWSxDQUFDWixTQUEvQjtBQUNBWSxJQUFBQSxZQUFZLENBQUMrRCx3QkFBYixDQUFzQy9GLGNBQWMsQ0FBQ29DLFFBQXJELEVBQStETSxTQUEvRCxFQXBEdUYsQ0FxRHZGOztBQUNBLFVBQU1iLGtCQUFrQixHQUFHLEtBQUtyRCxhQUFMLENBQW1Cc0QsR0FBbkIsQ0FBdUJWLFNBQXZCLENBQTNCOztBQUNBLFFBQUksQ0FBQ1ksWUFBWSxDQUFDZ0Usb0JBQWIsRUFBTCxFQUEwQztBQUN4Q25FLE1BQUFBLGtCQUFrQixDQUFDK0QsTUFBbkIsQ0FBMEI1RCxZQUFZLENBQUM4QyxJQUF2QztBQUNELEtBekRzRixDQTBEdkY7OztBQUNBLFFBQUlqRCxrQkFBa0IsQ0FBQ0QsSUFBbkIsS0FBNEIsQ0FBaEMsRUFBbUM7QUFDakMsV0FBS3BELGFBQUwsQ0FBbUJvSCxNQUFuQixDQUEwQnhFLFNBQTFCO0FBQ0Q7O0FBQ0QsNkNBQTBCO0FBQ3hCcUIsTUFBQUEsTUFEd0I7QUFFeEJZLE1BQUFBLEtBQUssRUFBRSxhQUZpQjtBQUd4Qi9FLE1BQUFBLE9BQU8sRUFBRSxLQUFLQSxPQUFMLENBQWFzRCxJQUhFO0FBSXhCcEQsTUFBQUEsYUFBYSxFQUFFLEtBQUtBLGFBQUwsQ0FBbUJvRCxJQUpWO0FBS3hCMEIsTUFBQUEsWUFBWSxFQUFFdUMsZ0JBQWdCLENBQUN2QyxZQUxQO0FBTXhCRSxNQUFBQSxZQUFZLEVBQUVmLE1BQU0sQ0FBQ2dCLFlBTkc7QUFPeEJDLE1BQUFBLGNBQWMsRUFBRWpCLE1BQU0sQ0FBQ2lCO0FBUEMsS0FBMUI7O0FBVUEsUUFBSSxDQUFDdUYsWUFBTCxFQUFtQjtBQUNqQjtBQUNEOztBQUVEeEcsSUFBQUEsTUFBTSxDQUFDMEcsZUFBUCxDQUF1QmpFLE9BQU8sQ0FBQ3hDLFNBQS9COztBQUVBeEQsb0JBQU9DLE9BQVAsQ0FDRyxrQkFBaUJhLGNBQWMsQ0FBQ29DLFFBQVMsb0JBQW1COEMsT0FBTyxDQUFDeEMsU0FBVSxFQURqRjtBQUdEOztBQXJ4QndCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR2NCBmcm9tICd0djQnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi9TdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgQ2xpZW50IH0gZnJvbSAnLi9DbGllbnQnO1xuaW1wb3J0IHsgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIgfSBmcm9tICcuL1BhcnNlV2ViU29ja2V0U2VydmVyJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBSZXF1ZXN0U2NoZW1hIGZyb20gJy4vUmVxdWVzdFNjaGVtYSc7XG5pbXBvcnQgeyBtYXRjaGVzUXVlcnksIHF1ZXJ5SGFzaCB9IGZyb20gJy4vUXVlcnlUb29scyc7XG5pbXBvcnQgeyBQYXJzZVB1YlN1YiB9IGZyb20gJy4vUGFyc2VQdWJTdWInO1xuaW1wb3J0IFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQge1xuICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzLFxuICBtYXliZVJ1bkNvbm5lY3RUcmlnZ2VyLFxuICBtYXliZVJ1blN1YnNjcmliZVRyaWdnZXIsXG4gIG1heWJlUnVuQWZ0ZXJFdmVudFRyaWdnZXIsXG59IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sIEF1dGggfSBmcm9tICcuLi9BdXRoJztcbmltcG9ydCB7IGdldENhY2hlQ29udHJvbGxlciB9IGZyb20gJy4uL0NvbnRyb2xsZXJzJztcbmltcG9ydCBMUlUgZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBVc2VyUm91dGVyIGZyb20gJy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuXG5jbGFzcyBQYXJzZUxpdmVRdWVyeVNlcnZlciB7XG4gIGNsaWVudHM6IE1hcDtcbiAgLy8gY2xhc3NOYW1lIC0+IChxdWVyeUhhc2ggLT4gc3Vic2NyaXB0aW9uKVxuICBzdWJzY3JpcHRpb25zOiBPYmplY3Q7XG4gIHBhcnNlV2ViU29ja2V0U2VydmVyOiBPYmplY3Q7XG4gIGtleVBhaXJzOiBhbnk7XG4gIC8vIFRoZSBzdWJzY3JpYmVyIHdlIHVzZSB0byBnZXQgb2JqZWN0IHVwZGF0ZSBmcm9tIHB1Ymxpc2hlclxuICBzdWJzY3JpYmVyOiBPYmplY3Q7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIGNvbmZpZzogYW55ID0ge30sIHBhcnNlU2VydmVyQ29uZmlnOiBhbnkgPSB7fSkge1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuICAgIHRoaXMuY2xpZW50cyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICBjb25maWcuYXBwSWQgPSBjb25maWcuYXBwSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICBjb25maWcubWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleSB8fCBQYXJzZS5tYXN0ZXJLZXk7XG5cbiAgICAvLyBTdG9yZSBrZXlzLCBjb252ZXJ0IG9iaiB0byBtYXBcbiAgICBjb25zdCBrZXlQYWlycyA9IGNvbmZpZy5rZXlQYWlycyB8fCB7fTtcbiAgICB0aGlzLmtleVBhaXJzID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGtleVBhaXJzKSkge1xuICAgICAgdGhpcy5rZXlQYWlycy5zZXQoa2V5LCBrZXlQYWlyc1trZXldKTtcbiAgICB9XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ1N1cHBvcnQga2V5IHBhaXJzJywgdGhpcy5rZXlQYWlycyk7XG5cbiAgICAvLyBJbml0aWFsaXplIFBhcnNlXG4gICAgUGFyc2UuT2JqZWN0LmRpc2FibGVTaW5nbGVJbnN0YW5jZSgpO1xuICAgIGNvbnN0IHNlcnZlclVSTCA9IGNvbmZpZy5zZXJ2ZXJVUkwgfHwgUGFyc2Uuc2VydmVyVVJMO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBQYXJzZS5pbml0aWFsaXplKGNvbmZpZy5hcHBJZCwgUGFyc2UuamF2YVNjcmlwdEtleSwgY29uZmlnLm1hc3RlcktleSk7XG5cbiAgICAvLyBUaGUgY2FjaGUgY29udHJvbGxlciBpcyBhIHByb3BlciBjYWNoZSBjb250cm9sbGVyXG4gICAgLy8gd2l0aCBhY2Nlc3MgdG8gVXNlciBhbmQgUm9sZXNcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGdldENhY2hlQ29udHJvbGxlcihwYXJzZVNlcnZlckNvbmZpZyk7XG5cbiAgICBjb25maWcuY2FjaGVUaW1lb3V0ID0gY29uZmlnLmNhY2hlVGltZW91dCB8fCA1ICogMTAwMDsgLy8gNXNcblxuICAgIC8vIFRoaXMgYXV0aCBjYWNoZSBzdG9yZXMgdGhlIHByb21pc2VzIGZvciBlYWNoIGF1dGggcmVzb2x1dGlvbi5cbiAgICAvLyBUaGUgbWFpbiBiZW5lZml0IGlzIHRvIGJlIGFibGUgdG8gcmV1c2UgdGhlIHNhbWUgdXNlciAvIHNlc3Npb24gdG9rZW4gcmVzb2x1dGlvbi5cbiAgICB0aGlzLmF1dGhDYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgbWF4OiA1MDAsIC8vIDUwMCBjb25jdXJyZW50XG4gICAgICBtYXhBZ2U6IGNvbmZpZy5jYWNoZVRpbWVvdXQsXG4gICAgfSk7XG4gICAgLy8gSW5pdGlhbGl6ZSB3ZWJzb2NrZXQgc2VydmVyXG4gICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlciA9IG5ldyBQYXJzZVdlYlNvY2tldFNlcnZlcihcbiAgICAgIHNlcnZlcixcbiAgICAgIHBhcnNlV2Vic29ja2V0ID0+IHRoaXMuX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldCksXG4gICAgICBjb25maWdcbiAgICApO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBzdWJzY3JpYmVyXG4gICAgdGhpcy5zdWJzY3JpYmVyID0gUGFyc2VQdWJTdWIuY3JlYXRlU3Vic2NyaWJlcihjb25maWcpO1xuICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKTtcbiAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKTtcbiAgICAvLyBSZWdpc3RlciBtZXNzYWdlIGhhbmRsZXIgZm9yIHN1YnNjcmliZXIuIFdoZW4gcHVibGlzaGVyIGdldCBtZXNzYWdlcywgaXQgd2lsbCBwdWJsaXNoIG1lc3NhZ2VcbiAgICAvLyB0byB0aGUgc3Vic2NyaWJlcnMgYW5kIHRoZSBoYW5kbGVyIHdpbGwgYmUgY2FsbGVkLlxuICAgIHRoaXMuc3Vic2NyaWJlci5vbignbWVzc2FnZScsIChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiB7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnU3Vic2NyaWJlIG1lc3NzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlKTtcbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlclNhdmUobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJEZWxldGUobWVzc2FnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCBtZXNzYWdlICVzIGZyb20gdW5rbm93biBjaGFubmVsICVqJywgbWVzc2FnZSwgY2hhbm5lbCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc1N1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKGRlbGV0ZWRQYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIGlmICghaXNTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgcmVxdWVzdElkIG9mIHJlcXVlc3RJZHMpIHtcbiAgICAgICAgICBjb25zdCBhY2wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAvLyBDaGVjayBDTFBcbiAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICB0aGlzLl9tYXRjaGVzQ0xQKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsIGNsaWVudCwgcmVxdWVzdElkLCBvcClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgLy8gQ2hlY2sgQUNMXG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGlzTWF0Y2hlZCA9PiB7XG4gICAgICAgICAgICAgIGlmICghaXNNYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICAgIGV2ZW50OiAnRGVsZXRlJyxcbiAgICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgICAgb2JqZWN0OiBkZWxldGVkUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICByZXR1cm4gbWF5YmVSdW5BZnRlckV2ZW50VHJpZ2dlcignYWZ0ZXJFdmVudCcsIGNsYXNzTmFtZSwgcmVzKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBkZWxldGVkUGFyc2VPYmplY3QgPSByZXMub2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY2xpZW50LnB1c2hEZWxldGUocmVxdWVzdElkLCBkZWxldGVkUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgICAgICAgICAgY2xpZW50LnBhcnNlV2ViU29ja2V0LFxuICAgICAgICAgICAgICAgIGVycm9yLmNvZGUgfHwgMTQxLFxuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3IsXG4gICAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAgICAgcmVxdWVzdElkXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBfb25BZnRlclNhdmUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG51bGw7XG4gICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgbGV0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJXMgfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGN1cnJlbnRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgY29uc3QgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgcmVxdWVzdElkIG9mIHJlcXVlc3RJZHMpIHtcbiAgICAgICAgICAvLyBTZXQgb3JpZ25hbCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGlmICghaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG9yaWdpbmFsQUNMO1xuICAgICAgICAgICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChvcmlnaW5hbEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBTZXQgY3VycmVudCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIGlmICghaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRBQ0wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKGN1cnJlbnRBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICB0aGlzLl9tYXRjaGVzQ0xQKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsIGNsaWVudCwgcmVxdWVzdElkLCBvcClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFtvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSwgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZV0pO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKChbaXNPcmlnaW5hbE1hdGNoZWQsIGlzQ3VycmVudE1hdGNoZWRdKSA9PiB7XG4gICAgICAgICAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICAgICAgICAgICdPcmlnaW5hbCAlaiB8IEN1cnJlbnQgJWogfCBNYXRjaDogJXMsICVzLCAlcywgJXMgfCBRdWVyeTogJXMnLFxuICAgICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICAgIGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgICAgaXNPcmlnaW5hbE1hdGNoZWQsXG4gICAgICAgICAgICAgICAgaXNDdXJyZW50TWF0Y2hlZCxcbiAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAvLyBEZWNpZGUgZXZlbnQgdHlwZVxuICAgICAgICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgICAgICAgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ1VwZGF0ZSc7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgIWlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ0xlYXZlJztcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICghaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgICB0eXBlID0gJ0VudGVyJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgdHlwZSA9ICdDcmVhdGUnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBtZXNzYWdlLmV2ZW50ID0gdHlwZTtcbiAgICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICAgIGV2ZW50OiB0eXBlLFxuICAgICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgICBvYmplY3Q6IGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIHJldHVybiBtYXliZVJ1bkFmdGVyRXZlbnRUcmlnZ2VyKCdhZnRlckV2ZW50JywgY2xhc3NOYW1lLCByZXMpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKFxuICAgICAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0ID0gcmVzLm9iamVjdC50b0pTT04oKTtcbiAgICAgICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWUgPSByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCAmJiB0eXBlb2YgcmVzLm9yaWdpbmFsLnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IHJlcy5vcmlnaW5hbC50b0pTT04oKTtcbiAgICAgICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QuY2xhc3NOYW1lID0gcmVzLm9yaWdpbmFsLmNsYXNzTmFtZSB8fCBjbGFzc05hbWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9ICdwdXNoJyArIG1lc3NhZ2UuZXZlbnQ7XG4gICAgICAgICAgICAgICAgaWYgKGNsaWVudFtmdW5jdGlvbk5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICBjbGllbnRbZnVuY3Rpb25OYW1lXShyZXF1ZXN0SWQsIGN1cnJlbnRQYXJzZU9iamVjdCwgb3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgICAgICAgIGNsaWVudC5wYXJzZVdlYlNvY2tldCxcbiAgICAgICAgICAgICAgICAgIGVycm9yLmNvZGUgfHwgMTQxLFxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSB8fCBlcnJvcixcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVxdWVzdElkXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfb25Db25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnkpOiB2b2lkIHtcbiAgICBwYXJzZVdlYnNvY2tldC5vbignbWVzc2FnZScsIHJlcXVlc3QgPT4ge1xuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKHJlcXVlc3QpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgcmVxdWVzdCcsIHJlcXVlc3QsIGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1JlcXVlc3Q6ICVqJywgcmVxdWVzdCk7XG5cbiAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyByZXF1ZXN0IGlzIGEgdmFsaWQgcmVxdWVzdCwgcmV0dXJuIGVycm9yIGRpcmVjdGx5IGlmIG5vdFxuICAgICAgaWYgKFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbJ2dlbmVyYWwnXSkgfHxcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hW3JlcXVlc3Qub3BdKVxuICAgICAgKSB7XG4gICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDEsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25uZWN0IG1lc3NhZ2UgZXJyb3IgJXMnLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChyZXF1ZXN0Lm9wKSB7XG4gICAgICAgIGNhc2UgJ2Nvbm5lY3QnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdzdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VwZGF0ZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndW5zdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAzLCAnR2V0IHVua25vd24gb3BlcmF0aW9uJyk7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgdW5rbm93biBvcGVyYXRpb24nLCByZXF1ZXN0Lm9wKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oYENsaWVudCBkaXNjb25uZWN0OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY29uc3QgY2xpZW50SWQgPSBwYXJzZVdlYnNvY2tldC5jbGllbnRJZDtcbiAgICAgIGlmICghdGhpcy5jbGllbnRzLmhhcyhjbGllbnRJZCkpIHtcbiAgICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0X2Vycm9yJyxcbiAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICBlcnJvcjogYFVuYWJsZSB0byBmaW5kIGNsaWVudCAke2NsaWVudElkfWAsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYENhbiBub3QgZmluZCBjbGllbnQgJHtjbGllbnRJZH0gb24gZGlzY29ubmVjdGApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnRcbiAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgdGhpcy5jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICBmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm9dIG9mIF8uZW50cmllcyhjbGllbnQuc3Vic2NyaXB0aW9uSW5mb3MpKSB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgICAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKGNsaWVudElkLCByZXF1ZXN0SWQpO1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50cyAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IHN1YnNjcmlwdGlvbnMgJWQnLCB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KHBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW46ID9zdHJpbmcpOiBQcm9taXNlPHsgYXV0aDogP0F1dGgsIHVzZXJJZDogP3N0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbChzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIG9iamVjdDogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmdcbiAgKTogYW55IHtcbiAgICAvLyB0cnkgdG8gbWF0Y2ggb24gdXNlciBmaXJzdCwgbGVzcyBleHBlbnNpdmUgdGhhbiB3aXRoIHJvbGVzXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgdXNlcklkO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgRmFpbGVkIG1hdGNoaW5nIENMUCBmb3IgJHtvYmplY3QuaWR9ICR7dXNlcklkfSAke2V9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIFRPRE86IGhhbmRsZSByb2xlcyBwZXJtaXNzaW9uc1xuICAgIC8vIE9iamVjdC5rZXlzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICBjb25zdCBwZXJtID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zW2tleV07XG4gICAgLy8gICBPYmplY3Qua2V5cyhwZXJtKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgICAgaWYgKGtleS5pbmRleE9mKCdyb2xlJykpXG4gICAgLy8gICB9KTtcbiAgICAvLyB9KVxuICAgIC8vIC8vIGl0J3MgcmVqZWN0ZWQgaGVyZSwgY2hlY2sgdGhlIHJvbGVzXG4gICAgLy8gdmFyIHJvbGVzUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSk7XG4gICAgLy8gcm9sZXNRdWVyeS5lcXVhbFRvKFwidXNlcnNcIiwgdXNlcik7XG4gICAgLy8gcmV0dXJuIHJvbGVzUXVlcnkuZmluZCh7dXNlTWFzdGVyS2V5OnRydWV9KTtcbiAgfVxuXG4gIF9nZXRDTFBPcGVyYXRpb24ocXVlcnk6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YgcXVlcnkgPT09ICdvYmplY3QnICYmXG4gICAgICBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09IDEgJiZcbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZydcbiAgICAgID8gJ2dldCdcbiAgICAgIDogJ2ZpbmQnO1xuICB9XG5cbiAgYXN5bmMgX3ZlcmlmeUFDTChhY2w6IGFueSwgdG9rZW46IHN0cmluZykge1xuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGF1dGgsIHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHRva2VuKTtcblxuICAgIC8vIEdldHRpbmcgdGhlIHNlc3Npb24gdG9rZW4gZmFpbGVkXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IG5vIGFkZGl0aW9uYWwgYXV0aCBpcyBhdmFpbGFibGVcbiAgICAvLyBBdCB0aGlzIHBvaW50LCBqdXN0IGJhaWwgb3V0IGFzIG5vIGFkZGl0aW9uYWwgdmlzaWJpbGl0eSBjYW4gYmUgaW5mZXJyZWQuXG4gICAgaWYgKCFhdXRoIHx8ICF1c2VySWQpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkID0gYWNsLmdldFJlYWRBY2Nlc3ModXNlcklkKTtcbiAgICBpZiAoaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGUgdXNlciBoYXMgYW55IHJvbGVzIHRoYXQgbWF0Y2ggdGhlIEFDTFxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBSZXNvbHZlIGZhbHNlIHJpZ2h0IGF3YXkgaWYgdGhlIGFjbCBkb2Vzbid0IGhhdmUgYW55IHJvbGVzXG4gICAgICAgIGNvbnN0IGFjbF9oYXNfcm9sZXMgPSBPYmplY3Qua2V5cyhhY2wucGVybWlzc2lvbnNCeUlkKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSk7XG4gICAgICAgIGlmICghYWNsX2hhc19yb2xlcykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNBQ0woYWNsOiBhbnksIGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIC8vIFJldHVybiB0cnVlIGRpcmVjdGx5IGlmIEFDTCBpc24ndCBwcmVzZW50LCBBQ0wgaXMgcHVibGljIHJlYWQsIG9yIGNsaWVudCBoYXMgbWFzdGVyIGtleVxuICAgIGlmICghYWNsIHx8IGFjbC5nZXRQdWJsaWNSZWFkQWNjZXNzKCkgfHwgY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHN1YnNjcmlwdGlvbiBzZXNzaW9uVG9rZW4gbWF0Y2hlcyBBQ0wgZmlyc3RcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uVG9rZW4gPSBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbjtcbiAgICBjb25zdCBjbGllbnRTZXNzaW9uVG9rZW4gPSBjbGllbnQuc2Vzc2lvblRva2VuO1xuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIHN1YnNjcmlwdGlvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIGNsaWVudFNlc3Npb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgaWYgKCF0aGlzLl92YWxpZGF0ZUtleXMocmVxdWVzdCwgdGhpcy5rZXlQYWlycykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDQsICdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIGxvZ2dlci5lcnJvcignS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGhhc01hc3RlcktleSA9IHRoaXMuX2hhc01hc3RlcktleShyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKTtcbiAgICBjb25zdCBjbGllbnRJZCA9IHV1aWR2NCgpO1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoXG4gICAgICBjbGllbnRJZCxcbiAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgaGFzTWFzdGVyS2V5LFxuICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICByZXF1ZXN0Lmluc3RhbGxhdGlvbklkXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxID0ge1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxdWVzdC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH07XG4gICAgICBhd2FpdCBtYXliZVJ1bkNvbm5lY3RUcmlnZ2VyKCdiZWZvcmVDb25uZWN0JywgcmVxKTtcbiAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkID0gY2xpZW50SWQ7XG4gICAgICB0aGlzLmNsaWVudHMuc2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCBjbGllbnQpO1xuICAgICAgbG9nZ2VyLmluZm8oYENyZWF0ZSBuZXcgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY2xpZW50LnB1c2hDb25uZWN0KCk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHJlcSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUgfHwgMTQxLCBlcnJvci5tZXNzYWdlIHx8IGVycm9yLCBmYWxzZSk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVDb25uZWN0IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhc01hc3RlcktleShyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCB8fCAhdmFsaWRLZXlQYWlycy5oYXMoJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICghcmVxdWVzdCB8fCAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlcXVlc3QsICdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gcmVxdWVzdC5tYXN0ZXJLZXkgPT09IHZhbGlkS2V5UGFpcnMuZ2V0KCdtYXN0ZXJLZXknKTtcbiAgfVxuXG4gIF92YWxpZGF0ZUtleXMocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBsZXQgaXNWYWxpZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgW2tleSwgc2VjcmV0XSBvZiB2YWxpZEtleVBhaXJzKSB7XG4gICAgICBpZiAoIXJlcXVlc3Rba2V5XSB8fCByZXF1ZXN0W2tleV0gIT09IHNlY3JldCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBpc1ZhbGlkO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSByZXF1ZXN0LnF1ZXJ5LmNsYXNzTmFtZTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgbWF5YmVSdW5TdWJzY3JpYmVUcmlnZ2VyKCdiZWZvcmVTdWJzY3JpYmUnLCBjbGFzc05hbWUsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBHZXQgc3Vic2NyaXB0aW9uIGZyb20gc3Vic2NyaXB0aW9ucywgY3JlYXRlIG9uZSBpZiBuZWNlc3NhcnlcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkhhc2ggPSBxdWVyeUhhc2gocmVxdWVzdC5xdWVyeSk7XG4gICAgICAvLyBBZGQgY2xhc3NOYW1lIHRvIHN1YnNjcmlwdGlvbnMgaWYgbmVjZXNzYXJ5XG5cbiAgICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25zLmhhcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NOYW1lLCBuZXcgTWFwKCkpO1xuICAgICAgfVxuICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgICAgbGV0IHN1YnNjcmlwdGlvbjtcbiAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuaGFzKHN1YnNjcmlwdGlvbkhhc2gpKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IGNsYXNzU3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBuZXcgU3Vic2NyaXB0aW9uKGNsYXNzTmFtZSwgcmVxdWVzdC5xdWVyeS53aGVyZSwgc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5zZXQoc3Vic2NyaXB0aW9uSGFzaCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIHN1YnNjcmlwdGlvbkluZm8gdG8gY2xpZW50XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0ge1xuICAgICAgICBzdWJzY3JpcHRpb246IHN1YnNjcmlwdGlvbixcbiAgICAgIH07XG4gICAgICAvLyBBZGQgc2VsZWN0ZWQgZmllbGRzLCBzZXNzaW9uVG9rZW4gYW5kIGluc3RhbGxhdGlvbklkIGZvciB0aGlzIHN1YnNjcmlwdGlvbiBpZiBuZWNlc3NhcnlcbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LmZpZWxkcykge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLmZpZWxkcyA9IHJlcXVlc3QucXVlcnkuZmllbGRzO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3Quc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBjbGllbnQuYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0LnJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG5cbiAgICAgIC8vIEFkZCBjbGllbnRJZCB0byBzdWJzY3JpcHRpb25cbiAgICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgY2xpZW50LnB1c2hTdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgICApO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlcjogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ3N1YnNjcmliZScsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZS5jb2RlIHx8IDE0MSwgZS5tZXNzYWdlIHx8IGUsIGZhbHNlLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVTdWJzY3JpYmUgb24gJHtjbGFzc05hbWV9IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSwgbm90aWZ5Q2xpZW50OiBib29sZWFuID0gdHJ1ZSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgY2xpZW50IHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQgJyArIHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBzdWJzY3JpYmUgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHN1YnNjcmlwdGlvbiBmcm9tIGNsaWVudFxuICAgIGNsaWVudC5kZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHN1YnNjcmlwdGlvbi5jbGFzc05hbWU7XG4gICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdElkKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgfVxuICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShjbGFzc05hbWUpO1xuICAgIH1cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAndW5zdWJzY3JpYmUnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgIHNlc3Npb25Ub2tlbjogc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXX0=
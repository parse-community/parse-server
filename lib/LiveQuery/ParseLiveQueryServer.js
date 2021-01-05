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
              event: 'delete',
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
              type = 'update';
            } else if (isOriginalMatched && !isCurrentMatched) {
              type = 'leave';
            } else if (!isOriginalMatched && isCurrentMatched) {
              if (originalParseObject) {
                type = 'enter';
              } else {
                type = 'create';
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

            const functionName = 'push' + message.event.charAt(0).toUpperCase() + message.event.slice(1);

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
        installationId: client.installationId,
        sessionToken: client.sessionToken
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsIm1heEFnZSIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwic3Vic2NyaWJlIiwib24iLCJjaGFubmVsIiwibWVzc2FnZVN0ciIsIm1lc3NhZ2UiLCJKU09OIiwicGFyc2UiLCJlIiwiZXJyb3IiLCJfaW5mbGF0ZVBhcnNlT2JqZWN0IiwiX29uQWZ0ZXJTYXZlIiwiX29uQWZ0ZXJEZWxldGUiLCJjdXJyZW50UGFyc2VPYmplY3QiLCJVc2VyUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsImNsYXNzTmFtZSIsInBhcnNlT2JqZWN0IiwiX2ZpbmlzaEZldGNoIiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImRlbGV0ZWRQYXJzZU9iamVjdCIsInRvSlNPTiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlkIiwic2l6ZSIsImNsYXNzU3Vic2NyaXB0aW9ucyIsImdldCIsImRlYnVnIiwic3Vic2NyaXB0aW9uIiwidmFsdWVzIiwiaXNTdWJzY3JpcHRpb25NYXRjaGVkIiwiX21hdGNoZXNTdWJzY3JpcHRpb24iLCJjbGllbnRJZCIsInJlcXVlc3RJZHMiLCJfIiwiZW50cmllcyIsImNsaWVudFJlcXVlc3RJZHMiLCJjbGllbnQiLCJyZXF1ZXN0SWQiLCJhY2wiLCJnZXRBQ0wiLCJvcCIsIl9nZXRDTFBPcGVyYXRpb24iLCJxdWVyeSIsInJlcyIsIl9tYXRjaGVzQ0xQIiwidGhlbiIsIl9tYXRjaGVzQUNMIiwiaXNNYXRjaGVkIiwiZXZlbnQiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3QiLCJ1c2VNYXN0ZXJLZXkiLCJoYXNNYXN0ZXJLZXkiLCJpbnN0YWxsYXRpb25JZCIsInNlbmRFdmVudCIsInB1c2hEZWxldGUiLCJjYXRjaCIsIkNsaWVudCIsInB1c2hFcnJvciIsInBhcnNlV2ViU29ja2V0IiwiY29kZSIsInN0cmluZ2lmeSIsImlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkIiwiaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCIsIm9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiYWxsIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiaGFzaCIsInR5cGUiLCJvcmlnaW5hbCIsImZ1bmN0aW9uTmFtZSIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic2xpY2UiLCJyZXF1ZXN0IiwidHY0IiwidmFsaWRhdGUiLCJSZXF1ZXN0U2NoZW1hIiwiX2hhbmRsZUNvbm5lY3QiLCJfaGFuZGxlU3Vic2NyaWJlIiwiX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbiIsIl9oYW5kbGVVbnN1YnNjcmliZSIsImluZm8iLCJoYXMiLCJkZWxldGUiLCJzdWJzY3JpcHRpb25JbmZvIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJoYXNTdWJzY3JpYmluZ0NsaWVudCIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJmcm9tQ2FjaGUiLCJhdXRoUHJvbWlzZSIsImF1dGgiLCJ1c2VySWQiLCJ1c2VyIiwicmVzdWx0IiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJkZWwiLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiYWNsR3JvdXAiLCJwdXNoIiwiU2NoZW1hQ29udHJvbGxlciIsInZhbGlkYXRlUGVybWlzc2lvbiIsImxlbmd0aCIsIm9iamVjdElkIiwiX3ZlcmlmeUFDTCIsInRva2VuIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzb21lIiwic3RhcnRzV2l0aCIsInJvbGVOYW1lcyIsImdldFVzZXJSb2xlcyIsInJvbGUiLCJnZXRQdWJsaWNSZWFkQWNjZXNzIiwic3Vic2NyaXB0aW9uVG9rZW4iLCJjbGllbnRTZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVLZXlzIiwiX2hhc01hc3RlcktleSIsInJlcSIsInB1c2hDb25uZWN0IiwidmFsaWRLZXlQYWlycyIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImlzVmFsaWQiLCJzZWNyZXQiLCJzdWJzY3JpcHRpb25IYXNoIiwiU3Vic2NyaXB0aW9uIiwid2hlcmUiLCJmaWVsZHMiLCJhZGRTdWJzY3JpcHRpb25JbmZvIiwiYWRkQ2xpZW50U3Vic2NyaXB0aW9uIiwicHVzaFN1YnNjcmliZSIsIm5vdGlmeUNsaWVudCIsImRlbGV0ZVN1YnNjcmlwdGlvbkluZm8iLCJwdXNoVW5zdWJzY3JpYmUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFNQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztB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LFlBQVksQ0FBQ21FLG9CQUFiLEVBQUwsRUFBMEM7QUFDeEN0RSxNQUFBQSxrQkFBa0IsQ0FBQ2tFLE1BQW5CLENBQTBCL0QsWUFBWSxDQUFDOEMsSUFBdkM7QUFDRCxLQXpEc0YsQ0EwRHZGOzs7QUFDQSxRQUFJakQsa0JBQWtCLENBQUNELElBQW5CLEtBQTRCLENBQWhDLEVBQW1DO0FBQ2pDLFdBQUtwRCxhQUFMLENBQW1CdUgsTUFBbkIsQ0FBMEIzRSxTQUExQjtBQUNEOztBQUNELDZDQUEwQjtBQUN4QnFCLE1BQUFBLE1BRHdCO0FBRXhCWSxNQUFBQSxLQUFLLEVBQUUsYUFGaUI7QUFHeEIvRSxNQUFBQSxPQUFPLEVBQUUsS0FBS0EsT0FBTCxDQUFhc0QsSUFIRTtBQUl4QnBELE1BQUFBLGFBQWEsRUFBRSxLQUFLQSxhQUFMLENBQW1Cb0QsSUFKVjtBQUt4QjBCLE1BQUFBLFlBQVksRUFBRTBDLGdCQUFnQixDQUFDMUMsWUFMUDtBQU14QkUsTUFBQUEsWUFBWSxFQUFFZixNQUFNLENBQUNnQixZQU5HO0FBT3hCQyxNQUFBQSxjQUFjLEVBQUVqQixNQUFNLENBQUNpQjtBQVBDLEtBQTFCOztBQVVBLFFBQUksQ0FBQzBGLFlBQUwsRUFBbUI7QUFDakI7QUFDRDs7QUFFRDNHLElBQUFBLE1BQU0sQ0FBQzZHLGVBQVAsQ0FBdUJqRSxPQUFPLENBQUMzQyxTQUEvQjs7QUFFQXhELG9CQUFPQyxPQUFQLENBQ0csa0JBQWlCYSxjQUFjLENBQUNvQyxRQUFTLG9CQUFtQmlELE9BQU8sQ0FBQzNDLFNBQVUsRUFEakY7QUFHRDs7QUF2eEJ3QiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHtcbiAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyxcbiAgbWF5YmVSdW5Db25uZWN0VHJpZ2dlcixcbiAgbWF5YmVSdW5TdWJzY3JpYmVUcmlnZ2VyLFxuICBtYXliZVJ1bkFmdGVyRXZlbnRUcmlnZ2VyLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLCBBdXRoIH0gZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgeyBnZXRDYWNoZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9LCBwYXJzZVNlcnZlckNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICB0aGlzLmNsaWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgY29uZmlnLmFwcElkID0gY29uZmlnLmFwcElkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uZmlnLm1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXkgfHwgUGFyc2UubWFzdGVyS2V5O1xuXG4gICAgLy8gU3RvcmUga2V5cywgY29udmVydCBvYmogdG8gbWFwXG4gICAgY29uc3Qga2V5UGFpcnMgPSBjb25maWcua2V5UGFpcnMgfHwge307XG4gICAgdGhpcy5rZXlQYWlycyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhrZXlQYWlycykpIHtcbiAgICAgIHRoaXMua2V5UGFpcnMuc2V0KGtleSwga2V5UGFpcnNba2V5XSk7XG4gICAgfVxuICAgIGxvZ2dlci52ZXJib3NlKCdTdXBwb3J0IGtleSBwYWlycycsIHRoaXMua2V5UGFpcnMpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBQYXJzZVxuICAgIFBhcnNlLk9iamVjdC5kaXNhYmxlU2luZ2xlSW5zdGFuY2UoKTtcbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBjb25maWcuc2VydmVyVVJMIHx8IFBhcnNlLnNlcnZlclVSTDtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShjb25maWcuYXBwSWQsIFBhcnNlLmphdmFTY3JpcHRLZXksIGNvbmZpZy5tYXN0ZXJLZXkpO1xuXG4gICAgLy8gVGhlIGNhY2hlIGNvbnRyb2xsZXIgaXMgYSBwcm9wZXIgY2FjaGUgY29udHJvbGxlclxuICAgIC8vIHdpdGggYWNjZXNzIHRvIFVzZXIgYW5kIFJvbGVzXG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIocGFyc2VTZXJ2ZXJDb25maWcpO1xuXG4gICAgY29uZmlnLmNhY2hlVGltZW91dCA9IGNvbmZpZy5jYWNoZVRpbWVvdXQgfHwgNSAqIDEwMDA7IC8vIDVzXG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgbWF4QWdlOiBjb25maWcuY2FjaGVUaW1lb3V0LFxuICAgIH0pO1xuICAgIC8vIEluaXRpYWxpemUgd2Vic29ja2V0IHNlcnZlclxuICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIgPSBuZXcgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIoXG4gICAgICBzZXJ2ZXIsXG4gICAgICBwYXJzZVdlYnNvY2tldCA9PiB0aGlzLl9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQpLFxuICAgICAgY29uZmlnXG4gICAgKTtcblxuICAgIC8vIEluaXRpYWxpemUgc3Vic2NyaWJlclxuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJyk7XG4gICAgLy8gUmVnaXN0ZXIgbWVzc2FnZSBoYW5kbGVyIGZvciBzdWJzY3JpYmVyLiBXaGVuIHB1Ymxpc2hlciBnZXQgbWVzc2FnZXMsIGl0IHdpbGwgcHVibGlzaCBtZXNzYWdlXG4gICAgLy8gdG8gdGhlIHN1YnNjcmliZXJzIGFuZCB0aGUgaGFuZGxlciB3aWxsIGJlIGNhbGxlZC5cbiAgICB0aGlzLnN1YnNjcmliZXIub24oJ21lc3NhZ2UnLCAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzc2FnZSAlaicsIG1lc3NhZ2VTdHIpO1xuICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICB0cnkge1xuICAgICAgICBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlU3RyKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgbWVzc2FnZScsIG1lc3NhZ2VTdHIsIGUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLl9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZSk7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJTYXZlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyRGVsZXRlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgbWVzc2FnZSAlcyBmcm9tIHVua25vd24gY2hhbm5lbCAlaicsIG1lc3NhZ2UsIGNoYW5uZWwpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBKU09OIGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QgSlNPTi5cbiAgX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICAvLyBJbmZsYXRlIG1lcmdlZCBvYmplY3RcbiAgICBjb25zdCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMoY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBsZXQgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsZXQgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICAvLyBJbmZsYXRlIG9yaWdpbmFsIG9iamVjdFxuICAgIGNvbnN0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIGNsYXNzTmFtZSA9IG9yaWdpbmFsUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgICAgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2gob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIF9vbkFmdGVyRGVsZXRlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgZGVsZXRlZFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlaiB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgZGVsZXRlZFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihkZWxldGVkUGFyc2VPYmplY3QsIHN1YnNjcmlwdGlvbik7XG4gICAgICBpZiAoIWlzU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IHJlcXVlc3RJZCBvZiByZXF1ZXN0SWRzKSB7XG4gICAgICAgICAgY29uc3QgYWNsID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgLy8gQ2hlY2sgQ0xQXG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgdGhpcy5fbWF0Y2hlc0NMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LCBjbGllbnQsIHJlcXVlc3RJZCwgb3ApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIC8vIENoZWNrIEFDTFxuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fbWF0Y2hlc0FDTChhY2wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihpc01hdGNoZWQgPT4ge1xuICAgICAgICAgICAgICBpZiAoIWlzTWF0Y2hlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgICBldmVudDogJ2RlbGV0ZScsXG4gICAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICAgIG9iamVjdDogZGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgcmV0dXJuIG1heWJlUnVuQWZ0ZXJFdmVudFRyaWdnZXIoJ2FmdGVyRXZlbnQnLCBjbGFzc05hbWUsIHJlcyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0ID0gcmVzLm9iamVjdC50b0pTT04oKTtcbiAgICAgICAgICAgICAgICBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNsaWVudC5wdXNoRGVsZXRlKHJlcXVlc3RJZCwgZGVsZXRlZFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgICAgIGNsaWVudC5wYXJzZVdlYlNvY2tldCxcbiAgICAgICAgICAgICAgICBlcnJvci5jb2RlIHx8IDE0MSxcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlIHx8IGVycm9yLFxuICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgX29uQWZ0ZXJTYXZlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBudWxsO1xuICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGxldCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVzIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBjdXJyZW50UGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGNvbnN0IGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IHJlcXVlc3RJZCBvZiByZXF1ZXN0SWRzKSB7XG4gICAgICAgICAgLy8gU2V0IG9yaWduYWwgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBpZiAoIWlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBvcmlnaW5hbEFDTDtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0wgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0wob3JpZ2luYWxBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gU2V0IGN1cnJlbnQgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICBpZiAoIWlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QUNMID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChjdXJyZW50QUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgdGhpcy5fbWF0Y2hlc0NMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LCBjbGllbnQsIHJlcXVlc3RJZCwgb3ApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChbb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2VdKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoW2lzT3JpZ2luYWxNYXRjaGVkLCBpc0N1cnJlbnRNYXRjaGVkXSkgPT4ge1xuICAgICAgICAgICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgICBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICAgIGlzT3JpZ2luYWxNYXRjaGVkLFxuICAgICAgICAgICAgICAgIGlzQ3VycmVudE1hdGNoZWQsXG4gICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmhhc2hcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgLy8gRGVjaWRlIGV2ZW50IHR5cGVcbiAgICAgICAgICAgICAgbGV0IHR5cGU7XG4gICAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICd1cGRhdGUnO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmICFpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdsZWF2ZSc7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICAgICAgdHlwZSA9ICdlbnRlcic7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHR5cGUgPSAnY3JlYXRlJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgbWVzc2FnZS5ldmVudCA9IHR5cGU7XG4gICAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgICBldmVudDogdHlwZSxcbiAgICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgICAgb2JqZWN0OiBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICByZXR1cm4gbWF5YmVSdW5BZnRlckV2ZW50VHJpZ2dlcignYWZ0ZXJFdmVudCcsIGNsYXNzTmFtZSwgcmVzKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihcbiAgICAgICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCA9IHJlcy5vYmplY3QudG9KU09OKCk7XG4gICAgICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lID0gcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwgJiYgdHlwZW9mIHJlcy5vcmlnaW5hbC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSByZXMub3JpZ2luYWwudG9KU09OKCk7XG4gICAgICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LmNsYXNzTmFtZSA9IHJlcy5vcmlnaW5hbC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPVxuICAgICAgICAgICAgICAgICAgJ3B1c2gnICsgbWVzc2FnZS5ldmVudC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lc3NhZ2UuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICAgICAgaWYgKGNsaWVudFtmdW5jdGlvbk5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICBjbGllbnRbZnVuY3Rpb25OYW1lXShyZXF1ZXN0SWQsIGN1cnJlbnRQYXJzZU9iamVjdCwgb3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgICAgICAgIGNsaWVudC5wYXJzZVdlYlNvY2tldCxcbiAgICAgICAgICAgICAgICAgIGVycm9yLmNvZGUgfHwgMTQxLFxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSB8fCBlcnJvcixcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVxdWVzdElkXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfb25Db25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnkpOiB2b2lkIHtcbiAgICBwYXJzZVdlYnNvY2tldC5vbignbWVzc2FnZScsIHJlcXVlc3QgPT4ge1xuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKHJlcXVlc3QpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgcmVxdWVzdCcsIHJlcXVlc3QsIGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1JlcXVlc3Q6ICVqJywgcmVxdWVzdCk7XG5cbiAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyByZXF1ZXN0IGlzIGEgdmFsaWQgcmVxdWVzdCwgcmV0dXJuIGVycm9yIGRpcmVjdGx5IGlmIG5vdFxuICAgICAgaWYgKFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbJ2dlbmVyYWwnXSkgfHxcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hW3JlcXVlc3Qub3BdKVxuICAgICAgKSB7XG4gICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDEsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25uZWN0IG1lc3NhZ2UgZXJyb3IgJXMnLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChyZXF1ZXN0Lm9wKSB7XG4gICAgICAgIGNhc2UgJ2Nvbm5lY3QnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdzdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VwZGF0ZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndW5zdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAzLCAnR2V0IHVua25vd24gb3BlcmF0aW9uJyk7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgdW5rbm93biBvcGVyYXRpb24nLCByZXF1ZXN0Lm9wKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oYENsaWVudCBkaXNjb25uZWN0OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY29uc3QgY2xpZW50SWQgPSBwYXJzZVdlYnNvY2tldC5jbGllbnRJZDtcbiAgICAgIGlmICghdGhpcy5jbGllbnRzLmhhcyhjbGllbnRJZCkpIHtcbiAgICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0X2Vycm9yJyxcbiAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICBlcnJvcjogYFVuYWJsZSB0byBmaW5kIGNsaWVudCAke2NsaWVudElkfWAsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYENhbiBub3QgZmluZCBjbGllbnQgJHtjbGllbnRJZH0gb24gZGlzY29ubmVjdGApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnRcbiAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgdGhpcy5jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICBmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm9dIG9mIF8uZW50cmllcyhjbGllbnQuc3Vic2NyaXB0aW9uSW5mb3MpKSB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgICAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKGNsaWVudElkLCByZXF1ZXN0SWQpO1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50cyAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IHN1YnNjcmlwdGlvbnMgJWQnLCB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBldmVudDogJ3dzX2Nvbm5lY3QnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICB9KTtcbiAgfVxuXG4gIF9tYXRjaGVzU3Vic2NyaXB0aW9uKHBhcnNlT2JqZWN0OiBhbnksIHN1YnNjcmlwdGlvbjogYW55KTogYm9vbGVhbiB7XG4gICAgLy8gT2JqZWN0IGlzIHVuZGVmaW5lZCBvciBudWxsLCBub3QgbWF0Y2hcbiAgICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzUXVlcnkocGFyc2VPYmplY3QsIHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gIH1cblxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbjogP3N0cmluZyk6IFByb21pc2U8eyBhdXRoOiA/QXV0aCwgdXNlcklkOiA/c3RyaW5nIH0+IHtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfVxuICAgIGNvbnN0IGZyb21DYWNoZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmIChmcm9tQ2FjaGUpIHtcbiAgICAgIHJldHVybiBmcm9tQ2FjaGU7XG4gICAgfVxuICAgIGNvbnN0IGF1dGhQcm9taXNlID0gZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLFxuICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgfSlcbiAgICAgIC50aGVuKGF1dGggPT4ge1xuICAgICAgICByZXR1cm4geyBhdXRoLCB1c2VySWQ6IGF1dGggJiYgYXV0aC51c2VyICYmIGF1dGgudXNlci5pZCB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlcnJvciB3aXRoIHRoZSBzZXNzaW9uIHRva2VuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksIHRoaXMuY29uZmlnLmNhY2hlVGltZW91dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6ID9hbnksXG4gICAgb2JqZWN0OiBhbnksXG4gICAgY2xpZW50OiBhbnksXG4gICAgcmVxdWVzdElkOiBudW1iZXIsXG4gICAgb3A6IHN0cmluZ1xuICApOiBhbnkge1xuICAgIC8vIHRyeSB0byBtYXRjaCBvbiB1c2VyIGZpcnN0LCBsZXNzIGV4cGVuc2l2ZSB0aGFuIHdpdGggcm9sZXNcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgeyB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbik7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIG9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBvcFxuICAgICAgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBGYWlsZWQgbWF0Y2hpbmcgQ0xQIGZvciAke29iamVjdC5pZH0gJHt1c2VySWR9ICR7ZX1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gVE9ETzogaGFuZGxlIHJvbGVzIHBlcm1pc3Npb25zXG4gICAgLy8gT2JqZWN0LmtleXMoY2xhc3NMZXZlbFBlcm1pc3Npb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgIGNvbnN0IHBlcm0gPSBjbGFzc0xldmVsUGVybWlzc2lvbnNba2V5XTtcbiAgICAvLyAgIE9iamVjdC5rZXlzKHBlcm0pLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgICBpZiAoa2V5LmluZGV4T2YoJ3JvbGUnKSlcbiAgICAvLyAgIH0pO1xuICAgIC8vIH0pXG4gICAgLy8gLy8gaXQncyByZWplY3RlZCBoZXJlLCBjaGVjayB0aGUgcm9sZXNcbiAgICAvLyB2YXIgcm9sZXNRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKTtcbiAgICAvLyByb2xlc1F1ZXJ5LmVxdWFsVG8oXCJ1c2Vyc1wiLCB1c2VyKTtcbiAgICAvLyByZXR1cm4gcm9sZXNRdWVyeS5maW5kKHt1c2VNYXN0ZXJLZXk6dHJ1ZX0pO1xuICB9XG5cbiAgX2dldENMUE9wZXJhdGlvbihxdWVyeTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBxdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT0gMSAmJlxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgPyAnZ2V0J1xuICAgICAgOiAnZmluZCc7XG4gIH1cblxuICBhc3luYyBfdmVyaWZ5QUNMKGFjbDogYW55LCB0b2tlbjogc3RyaW5nKSB7XG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHsgYXV0aCwgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4odG9rZW4pO1xuXG4gICAgLy8gR2V0dGluZyB0aGUgc2Vzc2lvbiB0b2tlbiBmYWlsZWRcbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgbm8gYWRkaXRpb25hbCBhdXRoIGlzIGF2YWlsYWJsZVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIGp1c3QgYmFpbCBvdXQgYXMgbm8gYWRkaXRpb25hbCB2aXNpYmlsaXR5IGNhbiBiZSBpbmZlcnJlZC5cbiAgICBpZiAoIWF1dGggfHwgIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQgPSBhY2wuZ2V0UmVhZEFjY2Vzcyh1c2VySWQpO1xuICAgIGlmIChpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSB1c2VyIGhhcyBhbnkgcm9sZXMgdGhhdCBtYXRjaCB0aGUgQUNMXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIFJlc29sdmUgZmFsc2UgcmlnaHQgYXdheSBpZiB0aGUgYWNsIGRvZXNuJ3QgaGF2ZSBhbnkgcm9sZXNcbiAgICAgICAgY29uc3QgYWNsX2hhc19yb2xlcyA9IE9iamVjdC5rZXlzKGFjbC5wZXJtaXNzaW9uc0J5SWQpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKCdyb2xlOicpKTtcbiAgICAgICAgaWYgKCFhY2xfaGFzX3JvbGVzKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgICAgICAgLy8gRmluYWxseSwgc2VlIGlmIGFueSBvZiB0aGUgdXNlcidzIHJvbGVzIGFsbG93IHRoZW0gcmVhZCBhY2Nlc3NcbiAgICAgICAgZm9yIChjb25zdCByb2xlIG9mIHJvbGVOYW1lcykge1xuICAgICAgICAgIC8vIFdlIHVzZSBnZXRSZWFkQWNjZXNzIGFzIGByb2xlYCBpcyBpbiB0aGUgZm9ybSBgcm9sZTpyb2xlTmFtZWBcbiAgICAgICAgICBpZiAoYWNsLmdldFJlYWRBY2Nlc3Mocm9sZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0FDTChhY2w6IGFueSwgY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgLy8gUmV0dXJuIHRydWUgZGlyZWN0bHkgaWYgQUNMIGlzbid0IHByZXNlbnQsIEFDTCBpcyBwdWJsaWMgcmVhZCwgb3IgY2xpZW50IGhhcyBtYXN0ZXIga2V5XG4gICAgaWYgKCFhY2wgfHwgYWNsLmdldFB1YmxpY1JlYWRBY2Nlc3MoKSB8fCBjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgc3Vic2NyaXB0aW9uIHNlc3Npb25Ub2tlbiBtYXRjaGVzIEFDTCBmaXJzdFxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25Ub2tlbiA9IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuO1xuICAgIGNvbnN0IGNsaWVudFNlc3Npb25Ub2tlbiA9IGNsaWVudC5zZXNzaW9uVG9rZW47XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgc3Vic2NyaXB0aW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgY2xpZW50U2Vzc2lvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICBpZiAoIXRoaXMuX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgNCwgJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgbG9nZ2VyLmVycm9yKCdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaGFzTWFzdGVyS2V5ID0gdGhpcy5faGFzTWFzdGVyS2V5KHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpO1xuICAgIGNvbnN0IGNsaWVudElkID0gdXVpZHY0KCk7XG4gICAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudChcbiAgICAgIGNsaWVudElkLFxuICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICBoYXNNYXN0ZXJLZXksXG4gICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgIHJlcXVlc3QuaW5zdGFsbGF0aW9uSWRcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXEgPSB7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiByZXF1ZXN0Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfTtcbiAgICAgIGF3YWl0IG1heWJlUnVuQ29ubmVjdFRyaWdnZXIoJ2JlZm9yZUNvbm5lY3QnLCByZXEpO1xuICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICAgIHRoaXMuY2xpZW50cy5zZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIGNsaWVudCk7XG4gICAgICBsb2dnZXIuaW5mbyhgQ3JlYXRlIG5ldyBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjbGllbnQucHVzaENvbm5lY3QoKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMocmVxKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSB8fCAxNDEsIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3IsIGZhbHNlKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZUNvbm5lY3QgZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFzTWFzdGVyS2V5KHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwIHx8ICF2YWxpZEtleVBhaXJzLmhhcygnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0IHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVxdWVzdCwgJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiByZXF1ZXN0Lm1hc3RlcktleSA9PT0gdmFsaWRLZXlQYWlycy5nZXQoJ21hc3RlcktleScpO1xuICB9XG5cbiAgX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGxldCBpc1ZhbGlkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBba2V5LCBzZWNyZXRdIG9mIHZhbGlkS2V5UGFpcnMpIHtcbiAgICAgIGlmICghcmVxdWVzdFtrZXldIHx8IHJlcXVlc3Rba2V5XSAhPT0gc2VjcmV0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGlzVmFsaWQ7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHJlcXVlc3QucXVlcnkuY2xhc3NOYW1lO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBtYXliZVJ1blN1YnNjcmliZVRyaWdnZXIoJ2JlZm9yZVN1YnNjcmliZScsIGNsYXNzTmFtZSwgcmVxdWVzdCk7XG5cbiAgICAgIC8vIEdldCBzdWJzY3JpcHRpb24gZnJvbSBzdWJzY3JpcHRpb25zLCBjcmVhdGUgb25lIGlmIG5lY2Vzc2FyeVxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSGFzaCA9IHF1ZXJ5SGFzaChyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgIC8vIEFkZCBjbGFzc05hbWUgdG8gc3Vic2NyaXB0aW9ucyBpZiBuZWNlc3NhcnlcblxuICAgICAgaWYgKCF0aGlzLnN1YnNjcmlwdGlvbnMuaGFzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChjbGFzc05hbWUsIG5ldyBNYXAoKSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgICBsZXQgc3Vic2NyaXB0aW9uO1xuICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5oYXMoc3Vic2NyaXB0aW9uSGFzaCkpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gY2xhc3NTdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IG5ldyBTdWJzY3JpcHRpb24oY2xhc3NOYW1lLCByZXF1ZXN0LnF1ZXJ5LndoZXJlLCBzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLnNldChzdWJzY3JpcHRpb25IYXNoLCBzdWJzY3JpcHRpb24pO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgc3Vic2NyaXB0aW9uSW5mbyB0byBjbGllbnRcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbjogc3Vic2NyaXB0aW9uLFxuICAgICAgfTtcbiAgICAgIC8vIEFkZCBzZWxlY3RlZCBmaWVsZHMsIHNlc3Npb25Ub2tlbiBhbmQgaW5zdGFsbGF0aW9uSWQgZm9yIHRoaXMgc3Vic2NyaXB0aW9uIGlmIG5lY2Vzc2FyeVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkuZmllbGRzKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uZmllbGRzID0gcmVxdWVzdC5xdWVyeS5maWVsZHM7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5zZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gPSByZXF1ZXN0LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGNsaWVudC5hZGRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3QucmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvKTtcblxuICAgICAgLy8gQWRkIGNsaWVudElkIHRvIHN1YnNjcmlwdGlvblxuICAgICAgc3Vic2NyaXB0aW9uLmFkZENsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBjbGllbnQucHVzaFN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICBgQ3JlYXRlIGNsaWVudCAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSBuZXcgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICAgICk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnc3Vic2NyaWJlJyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlLmNvZGUgfHwgMTQxLCBlLm1lc3NhZ2UgfHwgZSwgZmFsc2UsIHJlcXVlc3QucmVxdWVzdElkKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZVN1YnNjcmliZSBvbiAke2NsYXNzTmFtZX0gZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCwgZmFsc2UpO1xuICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gIH1cblxuICBfaGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55LCBub3RpZnlDbGllbnQ6IGJvb2xlYW4gPSB0cnVlKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIW5vdGlmeUNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNsaWVudC5wdXNoVW5zdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICBgRGVsZXRlIGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gfCBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfTtcbiJdfQ==
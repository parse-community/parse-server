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
      _logger.default.verbose('Subscribe message %j', messageStr);

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


  async _onAfterDelete(message) {
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

        requestIds.forEach(async requestId => {
          const acl = message.currentParseObject.getACL(); // Check CLP

          const op = this._getCLPOperation(subscription.query);

          let res = {};

          try {
            await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            const isMatched = await this._matchesACL(acl, client, requestId);

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
            const trigger = (0, _triggers.getTrigger)(className, 'afterEvent', _node.default.applicationId);

            if (trigger) {
              const auth = await this.getAuthFromClient(client, requestId);

              if (auth && auth.user) {
                res.user = auth.user;
              }

              if (res.object) {
                res.object = _node.default.Object.fromJSON(res.object);
              }

              await (0, _triggers.runTrigger)(trigger, `afterEvent.${className}`, res, auth);
            }

            if (!res.sendEvent) {
              return;
            }

            if (res.object && typeof res.object.toJSON === 'function') {
              deletedParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }

            if ((deletedParseObject.className === '_User' || deletedParseObject.className === '_Session') && !client.hasMasterKey) {
              delete deletedParseObject.sessionToken;
              delete deletedParseObject.authData;
            }

            client.pushDelete(requestId, deletedParseObject);
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);

            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);

            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.


  async _onAfterSave(message) {
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

        requestIds.forEach(async requestId => {
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

          try {
            const op = this._getCLPOperation(subscription.query);

            await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            const [isOriginalMatched, isCurrentMatched] = await Promise.all([originalACLCheckingPromise, currentACLCheckingPromise]);

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
            const trigger = (0, _triggers.getTrigger)(className, 'afterEvent', _node.default.applicationId);

            if (trigger) {
              if (res.object) {
                res.object = _node.default.Object.fromJSON(res.object);
              }

              if (res.original) {
                res.original = _node.default.Object.fromJSON(res.original);
              }

              const auth = await this.getAuthFromClient(client, requestId);

              if (auth && auth.user) {
                res.user = auth.user;
              }

              await (0, _triggers.runTrigger)(trigger, `afterEvent.${className}`, res, auth);
            }

            if (!res.sendEvent) {
              return;
            }

            if (res.object && typeof res.object.toJSON === 'function') {
              currentParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }

            if (res.original && typeof res.original.toJSON === 'function') {
              originalParseObject = (0, _triggers.toJSONwithObjects)(res.original, res.original.className || className);
            }

            if ((currentParseObject.className === '_User' || currentParseObject.className === '_Session') && !client.hasMasterKey) {
              var _originalParseObject, _originalParseObject2;

              delete currentParseObject.sessionToken;
              (_originalParseObject = originalParseObject) === null || _originalParseObject === void 0 ? true : delete _originalParseObject.sessionToken;
              delete currentParseObject.authData;
              (_originalParseObject2 = originalParseObject) === null || _originalParseObject2 === void 0 ? true : delete _originalParseObject2.authData;
            }

            const functionName = 'push' + res.event.charAt(0).toUpperCase() + res.event.slice(1);

            if (client[functionName]) {
              client[functionName](requestId, currentParseObject, originalParseObject);
            }
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);

            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);

            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
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

  async getAuthFromClient(client, requestId, sessionToken) {
    const getSessionFromClient = () => {
      const subscriptionInfo = client.getSubscriptionInfo(requestId);

      if (typeof subscriptionInfo === 'undefined') {
        return client.sessionToken;
      }

      return subscriptionInfo.sessionToken || client.sessionToken;
    };

    if (!sessionToken) {
      sessionToken = getSessionFromClient();
    }

    if (!sessionToken) {
      return;
    }

    const {
      auth
    } = await this.getAuthForSessionToken(sessionToken);
    return auth;
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
      const trigger = (0, _triggers.getTrigger)('@Connect', 'beforeConnect', _node.default.applicationId);

      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, req.sessionToken);

        if (auth && auth.user) {
          req.user = auth.user;
        }

        await (0, _triggers.runTrigger)(trigger, `beforeConnect.@Connect`, req, auth);
      }

      parseWebsocket.clientId = clientId;
      this.clients.set(parseWebsocket.clientId, client);

      _logger.default.info(`Create new client: ${parseWebsocket.clientId}`);

      client.pushConnect();
      (0, _triggers.runLiveQueryEventHandlers)(req);
    } catch (e) {
      const error = (0, _triggers.resolveError)(e);

      _Client.Client.pushError(parseWebsocket, error.code, error.message, false);

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
    let authCalled = false;

    try {
      const trigger = (0, _triggers.getTrigger)(className, 'beforeSubscribe', _node.default.applicationId);

      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
        authCalled = true;

        if (auth && auth.user) {
          request.user = auth.user;
        }

        const parseQuery = new _node.default.Query(className);
        parseQuery.withJSON(request.query);
        request.query = parseQuery;
        await (0, _triggers.runTrigger)(trigger, `beforeSubscribe.${className}`, request, auth);
        const query = request.query.toJSON();

        if (query.keys) {
          query.fields = query.keys.split(',');
        }

        request.query = query;
      }

      if (className === '_Session') {
        if (!authCalled) {
          const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);

          if (auth && auth.user) {
            request.user = auth.user;
          }
        }

        if (request.user) {
          request.query.where.user = request.user.toPointer();
        } else if (!request.master) {
          _Client.Client.pushError(parseWebsocket, _node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token', false, request.requestId);

          return;
        }
      } // Get subscription from subscriptions, create one if necessary


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
      const error = (0, _triggers.resolveError)(e);

      _Client.Client.pushError(parseWebsocket, error.code, error.message, false, request.requestId);

      _logger.default.error(`Failed running beforeSubscribe on ${className} for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(error));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsIm1heEFnZSIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwic3Vic2NyaWJlIiwib24iLCJjaGFubmVsIiwibWVzc2FnZVN0ciIsIm1lc3NhZ2UiLCJKU09OIiwicGFyc2UiLCJlIiwiZXJyb3IiLCJfaW5mbGF0ZVBhcnNlT2JqZWN0IiwiX29uQWZ0ZXJTYXZlIiwiX29uQWZ0ZXJEZWxldGUiLCJjdXJyZW50UGFyc2VPYmplY3QiLCJVc2VyUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsImNsYXNzTmFtZSIsInBhcnNlT2JqZWN0IiwiX2ZpbmlzaEZldGNoIiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImRlbGV0ZWRQYXJzZU9iamVjdCIsInRvSlNPTiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlkIiwic2l6ZSIsImNsYXNzU3Vic2NyaXB0aW9ucyIsImdldCIsImRlYnVnIiwic3Vic2NyaXB0aW9uIiwidmFsdWVzIiwiaXNTdWJzY3JpcHRpb25NYXRjaGVkIiwiX21hdGNoZXNTdWJzY3JpcHRpb24iLCJjbGllbnRJZCIsInJlcXVlc3RJZHMiLCJfIiwiZW50cmllcyIsImNsaWVudFJlcXVlc3RJZHMiLCJjbGllbnQiLCJmb3JFYWNoIiwicmVxdWVzdElkIiwiYWNsIiwiZ2V0QUNMIiwib3AiLCJfZ2V0Q0xQT3BlcmF0aW9uIiwicXVlcnkiLCJyZXMiLCJfbWF0Y2hlc0NMUCIsImlzTWF0Y2hlZCIsIl9tYXRjaGVzQUNMIiwiZXZlbnQiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3QiLCJ1c2VNYXN0ZXJLZXkiLCJoYXNNYXN0ZXJLZXkiLCJpbnN0YWxsYXRpb25JZCIsInNlbmRFdmVudCIsInRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJhdXRoRGF0YSIsInB1c2hEZWxldGUiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJwYXJzZVdlYlNvY2tldCIsImNvZGUiLCJzdHJpbmdpZnkiLCJpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCIsImlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwib3JpZ2luYWxBQ0wiLCJjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlIiwiY3VycmVudEFDTCIsImlzT3JpZ2luYWxNYXRjaGVkIiwiaXNDdXJyZW50TWF0Y2hlZCIsImFsbCIsImhhc2giLCJ0eXBlIiwib3JpZ2luYWwiLCJmdW5jdGlvbk5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwicmVxdWVzdCIsInR2NCIsInZhbGlkYXRlIiwiUmVxdWVzdFNjaGVtYSIsIl9oYW5kbGVDb25uZWN0IiwiX2hhbmRsZVN1YnNjcmliZSIsIl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24iLCJfaGFuZGxlVW5zdWJzY3JpYmUiLCJpbmZvIiwiaGFzIiwiZGVsZXRlIiwic3Vic2NyaXB0aW9uSW5mbyIsInN1YnNjcmlwdGlvbkluZm9zIiwiZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uIiwiaGFzU3Vic2NyaWJpbmdDbGllbnQiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiZnJvbUNhY2hlIiwiYXV0aFByb21pc2UiLCJ0aGVuIiwidXNlcklkIiwiY2F0Y2giLCJyZXN1bHQiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsImRlbCIsImdldFN1YnNjcmlwdGlvbkluZm8iLCJhY2xHcm91cCIsInB1c2giLCJTY2hlbWFDb250cm9sbGVyIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJfdmVyaWZ5QUNMIiwidG9rZW4iLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInNvbWUiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFNlc3Npb25Gcm9tQ2xpZW50IiwiZ2V0UHVibGljUmVhZEFjY2VzcyIsInN1YnNjcmlwdGlvblRva2VuIiwiY2xpZW50U2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlS2V5cyIsIl9oYXNNYXN0ZXJLZXkiLCJyZXEiLCJwdXNoQ29ubmVjdCIsInZhbGlkS2V5UGFpcnMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpc1ZhbGlkIiwic2VjcmV0IiwiYXV0aENhbGxlZCIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwiZmllbGRzIiwic3BsaXQiLCJ3aGVyZSIsInRvUG9pbnRlciIsIm1hc3RlciIsInN1YnNjcmlwdGlvbkhhc2giLCJTdWJzY3JpcHRpb24iLCJhZGRTdWJzY3JpcHRpb25JbmZvIiwiYWRkQ2xpZW50U3Vic2NyaXB0aW9uIiwicHVzaFN1YnNjcmliZSIsIm5vdGlmeUNsaWVudCIsImRlbGV0ZVN1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RUFwRHVGLENBcUR2Rjs7QUFDQSxVQUFNZCxrQkFBa0IsR0FBRyxLQUFLckQsYUFBTCxDQUFtQnNELEdBQW5CLENBQXVCVixTQUF2QixDQUEzQjs7QUFDQSxRQUFJLENBQUNZLFlBQVksQ0FBQ3dFLG9CQUFiLEVBQUwsRUFBMEM7QUFDeEMzRSxNQUFBQSxrQkFBa0IsQ0FBQ3VFLE1BQW5CLENBQTBCcEUsWUFBWSxDQUFDbUQsSUFBdkM7QUFDRCxLQXpEc0YsQ0EwRHZGOzs7QUFDQSxRQUFJdEQsa0JBQWtCLENBQUNELElBQW5CLEtBQTRCLENBQWhDLEVBQW1DO0FBQ2pDLFdBQUtwRCxhQUFMLENBQW1CNEgsTUFBbkIsQ0FBMEJoRixTQUExQjtBQUNEOztBQUNELDZDQUEwQjtBQUN4QnFCLE1BQUFBLE1BRHdCO0FBRXhCWSxNQUFBQSxLQUFLLEVBQUUsYUFGaUI7QUFHeEIvRSxNQUFBQSxPQUFPLEVBQUUsS0FBS0EsT0FBTCxDQUFhc0QsSUFIRTtBQUl4QnBELE1BQUFBLGFBQWEsRUFBRSxLQUFLQSxhQUFMLENBQW1Cb0QsSUFKVjtBQUt4QjBCLE1BQUFBLFlBQVksRUFBRStDLGdCQUFnQixDQUFDL0MsWUFMUDtBQU14QkUsTUFBQUEsWUFBWSxFQUFFZixNQUFNLENBQUNnQixZQU5HO0FBT3hCQyxNQUFBQSxjQUFjLEVBQUVqQixNQUFNLENBQUNpQjtBQVBDLEtBQTFCOztBQVVBLFFBQUksQ0FBQ3VHLFlBQUwsRUFBbUI7QUFDakI7QUFDRDs7QUFFRHhILElBQUFBLE1BQU0sQ0FBQzBILGVBQVAsQ0FBdUJ6RSxPQUFPLENBQUMvQyxTQUEvQjs7QUFFQXpELG9CQUFPQyxPQUFQLENBQ0csa0JBQWlCYSxjQUFjLENBQUNvQyxRQUFTLG9CQUFtQnNELE9BQU8sQ0FBQy9DLFNBQVUsRUFEakY7QUFHRDs7QUE1M0J3QiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHtcbiAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyxcbiAgZ2V0VHJpZ2dlcixcbiAgcnVuVHJpZ2dlcixcbiAgcmVzb2x2ZUVycm9yLFxuICB0b0pTT053aXRoT2JqZWN0cyxcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiwgQXV0aCB9IGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHsgZ2V0Q2FjaGVDb250cm9sbGVyIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IExSVSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IFVzZXJSb3V0ZXIgZnJvbSAnLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5cbmNsYXNzIFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIHtcbiAgY2xpZW50czogTWFwO1xuICAvLyBjbGFzc05hbWUgLT4gKHF1ZXJ5SGFzaCAtPiBzdWJzY3JpcHRpb24pXG4gIHN1YnNjcmlwdGlvbnM6IE9iamVjdDtcbiAgcGFyc2VXZWJTb2NrZXRTZXJ2ZXI6IE9iamVjdDtcbiAga2V5UGFpcnM6IGFueTtcbiAgLy8gVGhlIHN1YnNjcmliZXIgd2UgdXNlIHRvIGdldCBvYmplY3QgdXBkYXRlIGZyb20gcHVibGlzaGVyXG4gIHN1YnNjcmliZXI6IE9iamVjdDtcblxuICBjb25zdHJ1Y3RvcihzZXJ2ZXI6IGFueSwgY29uZmlnOiBhbnkgPSB7fSwgcGFyc2VTZXJ2ZXJDb25maWc6IGFueSA9IHt9KSB7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgdGhpcy5jbGllbnRzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIGNvbmZpZy5hcHBJZCA9IGNvbmZpZy5hcHBJZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgIGNvbmZpZy5tYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5IHx8IFBhcnNlLm1hc3RlcktleTtcblxuICAgIC8vIFN0b3JlIGtleXMsIGNvbnZlcnQgb2JqIHRvIG1hcFxuICAgIGNvbnN0IGtleVBhaXJzID0gY29uZmlnLmtleVBhaXJzIHx8IHt9O1xuICAgIHRoaXMua2V5UGFpcnMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoa2V5UGFpcnMpKSB7XG4gICAgICB0aGlzLmtleVBhaXJzLnNldChrZXksIGtleVBhaXJzW2tleV0pO1xuICAgIH1cbiAgICBsb2dnZXIudmVyYm9zZSgnU3VwcG9ydCBrZXkgcGFpcnMnLCB0aGlzLmtleVBhaXJzKTtcblxuICAgIC8vIEluaXRpYWxpemUgUGFyc2VcbiAgICBQYXJzZS5PYmplY3QuZGlzYWJsZVNpbmdsZUluc3RhbmNlKCk7XG4gICAgY29uc3Qgc2VydmVyVVJMID0gY29uZmlnLnNlcnZlclVSTCB8fCBQYXJzZS5zZXJ2ZXJVUkw7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuICAgIFBhcnNlLmluaXRpYWxpemUoY29uZmlnLmFwcElkLCBQYXJzZS5qYXZhU2NyaXB0S2V5LCBjb25maWcubWFzdGVyS2V5KTtcblxuICAgIC8vIFRoZSBjYWNoZSBjb250cm9sbGVyIGlzIGEgcHJvcGVyIGNhY2hlIGNvbnRyb2xsZXJcbiAgICAvLyB3aXRoIGFjY2VzcyB0byBVc2VyIGFuZCBSb2xlc1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gZ2V0Q2FjaGVDb250cm9sbGVyKHBhcnNlU2VydmVyQ29uZmlnKTtcblxuICAgIGNvbmZpZy5jYWNoZVRpbWVvdXQgPSBjb25maWcuY2FjaGVUaW1lb3V0IHx8IDUgKiAxMDAwOyAvLyA1c1xuXG4gICAgLy8gVGhpcyBhdXRoIGNhY2hlIHN0b3JlcyB0aGUgcHJvbWlzZXMgZm9yIGVhY2ggYXV0aCByZXNvbHV0aW9uLlxuICAgIC8vIFRoZSBtYWluIGJlbmVmaXQgaXMgdG8gYmUgYWJsZSB0byByZXVzZSB0aGUgc2FtZSB1c2VyIC8gc2Vzc2lvbiB0b2tlbiByZXNvbHV0aW9uLlxuICAgIHRoaXMuYXV0aENhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IDUwMCwgLy8gNTAwIGNvbmN1cnJlbnRcbiAgICAgIG1heEFnZTogY29uZmlnLmNhY2hlVGltZW91dCxcbiAgICB9KTtcbiAgICAvLyBJbml0aWFsaXplIHdlYnNvY2tldCBzZXJ2ZXJcbiAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyID0gbmV3IFBhcnNlV2ViU29ja2V0U2VydmVyKFxuICAgICAgc2VydmVyLFxuICAgICAgcGFyc2VXZWJzb2NrZXQgPT4gdGhpcy5fb25Db25uZWN0KHBhcnNlV2Vic29ja2V0KSxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBJbml0aWFsaXplIHN1YnNjcmliZXJcbiAgICB0aGlzLnN1YnNjcmliZXIgPSBQYXJzZVB1YlN1Yi5jcmVhdGVTdWJzY3JpYmVyKGNvbmZpZyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpO1xuICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpO1xuICAgIC8vIFJlZ2lzdGVyIG1lc3NhZ2UgaGFuZGxlciBmb3Igc3Vic2NyaWJlci4gV2hlbiBwdWJsaXNoZXIgZ2V0IG1lc3NhZ2VzLCBpdCB3aWxsIHB1Ymxpc2ggbWVzc2FnZVxuICAgIC8vIHRvIHRoZSBzdWJzY3JpYmVycyBhbmQgdGhlIGhhbmRsZXIgd2lsbCBiZSBjYWxsZWQuXG4gICAgdGhpcy5zdWJzY3JpYmVyLm9uKCdtZXNzYWdlJywgKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdTdWJzY3JpYmUgbWVzc2FnZSAlaicsIG1lc3NhZ2VTdHIpO1xuICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICB0cnkge1xuICAgICAgICBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlU3RyKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgbWVzc2FnZScsIG1lc3NhZ2VTdHIsIGUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLl9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZSk7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJTYXZlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyRGVsZXRlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgbWVzc2FnZSAlcyBmcm9tIHVua25vd24gY2hhbm5lbCAlaicsIG1lc3NhZ2UsIGNoYW5uZWwpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBKU09OIGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QgSlNPTi5cbiAgX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICAvLyBJbmZsYXRlIG1lcmdlZCBvYmplY3RcbiAgICBjb25zdCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMoY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBsZXQgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsZXQgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICAvLyBJbmZsYXRlIG9yaWdpbmFsIG9iamVjdFxuICAgIGNvbnN0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIGNsYXNzTmFtZSA9IG9yaWdpbmFsUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgICAgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2gob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyRGVsZXRlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgZGVsZXRlZFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlaiB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgZGVsZXRlZFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc1N1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKGRlbGV0ZWRQYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIGlmICghaXNTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIGNvbnN0IGFjbCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgIC8vIENoZWNrIENMUFxuICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBpc01hdGNoZWQgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgaWYgKCFpc01hdGNoZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiAnZGVsZXRlJyxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGRlbGV0ZWRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZWRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIChkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInIHx8XG4gICAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykgJiZcbiAgICAgICAgICAgICAgIWNsaWVudC5oYXNNYXN0ZXJLZXlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBkZWxldGUgZGVsZXRlZFBhcnNlT2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICAgICAgZGVsZXRlIGRlbGV0ZWRQYXJzZU9iamVjdC5hdXRoRGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNsaWVudC5wdXNoRGVsZXRlKHJlcXVlc3RJZCwgZGVsZXRlZFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJTYXZlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBudWxsO1xuICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGxldCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVzIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBjdXJyZW50UGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGNvbnN0IGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0SWRzLmZvckVhY2goYXN5bmMgcmVxdWVzdElkID0+IHtcbiAgICAgICAgICAvLyBTZXQgb3JpZ25hbCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGlmICghaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG9yaWdpbmFsQUNMO1xuICAgICAgICAgICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChvcmlnaW5hbEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBTZXQgY3VycmVudCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIGlmICghaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRBQ0wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKGN1cnJlbnRBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBbaXNPcmlnaW5hbE1hdGNoZWQsIGlzQ3VycmVudE1hdGNoZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgICAgICAgICdPcmlnaW5hbCAlaiB8IEN1cnJlbnQgJWogfCBNYXRjaDogJXMsICVzLCAlcywgJXMgfCBRdWVyeTogJXMnLFxuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc09yaWdpbmFsTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50TWF0Y2hlZCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmhhc2hcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvLyBEZWNpZGUgZXZlbnQgdHlwZVxuICAgICAgICAgICAgbGV0IHR5cGU7XG4gICAgICAgICAgICBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ3VwZGF0ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmICFpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAnbGVhdmUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnZW50ZXInO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnY3JlYXRlJztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiB0eXBlLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJlcy5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9iamVjdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCkge1xuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub3JpZ2luYWwpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYWZ0ZXJFdmVudC4ke2NsYXNzTmFtZX1gLCByZXMsIGF1dGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCAmJiB0eXBlb2YgcmVzLm9yaWdpbmFsLnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMoXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIChjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInIHx8XG4gICAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykgJiZcbiAgICAgICAgICAgICAgIWNsaWVudC5oYXNNYXN0ZXJLZXlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBkZWxldGUgY3VycmVudFBhcnNlT2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICAgICAgZGVsZXRlIG9yaWdpbmFsUGFyc2VPYmplY3Q/LnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICAgICAgZGVsZXRlIGN1cnJlbnRQYXJzZU9iamVjdC5hdXRoRGF0YTtcbiAgICAgICAgICAgICAgZGVsZXRlIG9yaWdpbmFsUGFyc2VPYmplY3Q/LmF1dGhEYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZnVuY3Rpb25OYW1lID0gJ3B1c2gnICsgcmVzLmV2ZW50LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcmVzLmV2ZW50LnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGNsaWVudFtmdW5jdGlvbk5hbWVdKSB7XG4gICAgICAgICAgICAgIGNsaWVudFtmdW5jdGlvbk5hbWVdKHJlcXVlc3RJZCwgY3VycmVudFBhcnNlT2JqZWN0LCBvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSk6IHZvaWQge1xuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdtZXNzYWdlJywgcmVxdWVzdCA9PiB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UocmVxdWVzdCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSByZXF1ZXN0JywgcmVxdWVzdCwgZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsb2dnZXIudmVyYm9zZSgnUmVxdWVzdDogJWonLCByZXF1ZXN0KTtcblxuICAgICAgLy8gQ2hlY2sgd2hldGhlciB0aGlzIHJlcXVlc3QgaXMgYSB2YWxpZCByZXF1ZXN0LCByZXR1cm4gZXJyb3IgZGlyZWN0bHkgaWYgbm90XG4gICAgICBpZiAoXG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVsnZ2VuZXJhbCddKSB8fFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbcmVxdWVzdC5vcF0pXG4gICAgICApIHtcbiAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMSwgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0Nvbm5lY3QgbWVzc2FnZSBlcnJvciAlcycsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHJlcXVlc3Qub3ApIHtcbiAgICAgICAgY2FzZSAnY29ubmVjdCc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXBkYXRlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1bnN1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDMsICdHZXQgdW5rbm93biBvcGVyYXRpb24nKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCB1bmtub3duIG9wZXJhdGlvbicsIHJlcXVlc3Qub3ApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbyhgQ2xpZW50IGRpc2Nvbm5lY3Q6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjb25zdCBjbGllbnRJZCA9IHBhcnNlV2Vic29ja2V0LmNsaWVudElkO1xuICAgICAgaWYgKCF0aGlzLmNsaWVudHMuaGFzKGNsaWVudElkKSkge1xuICAgICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3RfZXJyb3InLFxuICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgIGVycm9yOiBgVW5hYmxlIHRvIGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgQ2FuIG5vdCBmaW5kIGNsaWVudCAke2NsaWVudElkfSBvbiBkaXNjb25uZWN0YCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gRGVsZXRlIGNsaWVudFxuICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICB0aGlzLmNsaWVudHMuZGVsZXRlKGNsaWVudElkKTtcblxuICAgICAgLy8gRGVsZXRlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgIGZvciAoY29uc3QgW3JlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mb10gb2YgXy5lbnRyaWVzKGNsaWVudC5zdWJzY3JpcHRpb25JbmZvcykpIHtcbiAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24oY2xpZW50SWQsIHJlcXVlc3RJZCk7XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnRzICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgc3Vic2NyaXB0aW9ucyAlZCcsIHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGV2ZW50OiAnd3NfY29ubmVjdCcsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgIH0pO1xuICB9XG5cbiAgX21hdGNoZXNTdWJzY3JpcHRpb24ocGFyc2VPYmplY3Q6IGFueSwgc3Vic2NyaXB0aW9uOiBhbnkpOiBib29sZWFuIHtcbiAgICAvLyBPYmplY3QgaXMgdW5kZWZpbmVkIG9yIG51bGwsIG5vdCBtYXRjaFxuICAgIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoZXNRdWVyeShwYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgfVxuXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuOiA/c3RyaW5nKTogUHJvbWlzZTx7IGF1dGg6ID9BdXRoLCB1c2VySWQ6ID9zdHJpbmcgfT4ge1xuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICB9XG4gICAgY29uc3QgZnJvbUNhY2hlID0gdGhpcy5hdXRoQ2FjaGUuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKGZyb21DYWNoZSkge1xuICAgICAgcmV0dXJuIGZyb21DYWNoZTtcbiAgICB9XG4gICAgY29uc3QgYXV0aFByb21pc2UgPSBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgIGNhY2hlQ29udHJvbGxlcjogdGhpcy5jYWNoZUNvbnRyb2xsZXIsXG4gICAgICBzZXNzaW9uVG9rZW46IHNlc3Npb25Ub2tlbixcbiAgICB9KVxuICAgICAgLnRoZW4oYXV0aCA9PiB7XG4gICAgICAgIHJldHVybiB7IGF1dGgsIHVzZXJJZDogYXV0aCAmJiBhdXRoLnVzZXIgJiYgYXV0aC51c2VyLmlkIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gVGhlcmUgd2FzIGFuIGVycm9yIHdpdGggdGhlIHNlc3Npb24gdG9rZW5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0ge307XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4pIHtcbiAgICAgICAgICByZXN1bHQuZXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBQcm9taXNlLnJlc29sdmUocmVzdWx0KSwgdGhpcy5jb25maWcuY2FjaGVUaW1lb3V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5kZWwoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfSk7XG4gICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgYXV0aFByb21pc2UpO1xuICAgIHJldHVybiBhdXRoUHJvbWlzZTtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQ0xQKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogP2FueSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBjbGllbnQ6IGFueSxcbiAgICByZXF1ZXN0SWQ6IG51bWJlcixcbiAgICBvcDogc3RyaW5nXG4gICk6IGFueSB7XG4gICAgLy8gdHJ5IHRvIG1hdGNoIG9uIHVzZXIgZmlyc3QsIGxlc3MgZXhwZW5zaXZlIHRoYW4gd2l0aCByb2xlc1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gWycqJ107XG4gICAgbGV0IHVzZXJJZDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgIH1cbiAgICB0cnkge1xuICAgICAgYXdhaXQgU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIG9wXG4gICAgICApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoYEZhaWxlZCBtYXRjaGluZyBDTFAgZm9yICR7b2JqZWN0LmlkfSAke3VzZXJJZH0gJHtlfWApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBUT0RPOiBoYW5kbGUgcm9sZXMgcGVybWlzc2lvbnNcbiAgICAvLyBPYmplY3Qua2V5cyhjbGFzc0xldmVsUGVybWlzc2lvbnMpLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgY29uc3QgcGVybSA9IGNsYXNzTGV2ZWxQZXJtaXNzaW9uc1trZXldO1xuICAgIC8vICAgT2JqZWN0LmtleXMocGVybSkuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICAgIGlmIChrZXkuaW5kZXhPZigncm9sZScpKVxuICAgIC8vICAgfSk7XG4gICAgLy8gfSlcbiAgICAvLyAvLyBpdCdzIHJlamVjdGVkIGhlcmUsIGNoZWNrIHRoZSByb2xlc1xuICAgIC8vIHZhciByb2xlc1F1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpO1xuICAgIC8vIHJvbGVzUXVlcnkuZXF1YWxUbyhcInVzZXJzXCIsIHVzZXIpO1xuICAgIC8vIHJldHVybiByb2xlc1F1ZXJ5LmZpbmQoe3VzZU1hc3RlcktleTp0cnVlfSk7XG4gIH1cblxuICBfZ2V0Q0xQT3BlcmF0aW9uKHF1ZXJ5OiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mIHF1ZXJ5ID09PSAnb2JqZWN0JyAmJlxuICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PSAxICYmXG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICA/ICdnZXQnXG4gICAgICA6ICdmaW5kJztcbiAgfVxuXG4gIGFzeW5jIF92ZXJpZnlBQ0woYWNsOiBhbnksIHRva2VuOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgeyBhdXRoLCB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih0b2tlbik7XG5cbiAgICAvLyBHZXR0aW5nIHRoZSBzZXNzaW9uIHRva2VuIGZhaWxlZFxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBubyBhZGRpdGlvbmFsIGF1dGggaXMgYXZhaWxhYmxlXG4gICAgLy8gQXQgdGhpcyBwb2ludCwganVzdCBiYWlsIG91dCBhcyBubyBhZGRpdGlvbmFsIHZpc2liaWxpdHkgY2FuIGJlIGluZmVycmVkLlxuICAgIGlmICghYXV0aCB8fCAhdXNlcklkKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCA9IGFjbC5nZXRSZWFkQWNjZXNzKHVzZXJJZCk7XG4gICAgaWYgKGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHVzZXIgaGFzIGFueSByb2xlcyB0aGF0IG1hdGNoIHRoZSBBQ0xcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgLy8gUmVzb2x2ZSBmYWxzZSByaWdodCBhd2F5IGlmIHRoZSBhY2wgZG9lc24ndCBoYXZlIGFueSByb2xlc1xuICAgICAgICBjb25zdCBhY2xfaGFzX3JvbGVzID0gT2JqZWN0LmtleXMoYWNsLnBlcm1pc3Npb25zQnlJZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpO1xuICAgICAgICBpZiAoIWFjbF9oYXNfcm9sZXMpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCBhdXRoLmdldFVzZXJSb2xlcygpO1xuICAgICAgICAvLyBGaW5hbGx5LCBzZWUgaWYgYW55IG9mIHRoZSB1c2VyJ3Mgcm9sZXMgYWxsb3cgdGhlbSByZWFkIGFjY2Vzc1xuICAgICAgICBmb3IgKGNvbnN0IHJvbGUgb2Ygcm9sZU5hbWVzKSB7XG4gICAgICAgICAgLy8gV2UgdXNlIGdldFJlYWRBY2Nlc3MgYXMgYHJvbGVgIGlzIGluIHRoZSBmb3JtIGByb2xlOnJvbGVOYW1lYFxuICAgICAgICAgIGlmIChhY2wuZ2V0UmVhZEFjY2Vzcyhyb2xlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGdldEF1dGhGcm9tQ2xpZW50KGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlciwgc2Vzc2lvblRva2VuOiBzdHJpbmcpIHtcbiAgICBjb25zdCBnZXRTZXNzaW9uRnJvbUNsaWVudCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiB8fCBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgIH07XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHNlc3Npb25Ub2tlbiA9IGdldFNlc3Npb25Gcm9tQ2xpZW50KCk7XG4gICAgfVxuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbik7XG4gICAgcmV0dXJuIGF1dGg7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0FDTChhY2w6IGFueSwgY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgLy8gUmV0dXJuIHRydWUgZGlyZWN0bHkgaWYgQUNMIGlzbid0IHByZXNlbnQsIEFDTCBpcyBwdWJsaWMgcmVhZCwgb3IgY2xpZW50IGhhcyBtYXN0ZXIga2V5XG4gICAgaWYgKCFhY2wgfHwgYWNsLmdldFB1YmxpY1JlYWRBY2Nlc3MoKSB8fCBjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgc3Vic2NyaXB0aW9uIHNlc3Npb25Ub2tlbiBtYXRjaGVzIEFDTCBmaXJzdFxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25Ub2tlbiA9IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuO1xuICAgIGNvbnN0IGNsaWVudFNlc3Npb25Ub2tlbiA9IGNsaWVudC5zZXNzaW9uVG9rZW47XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgc3Vic2NyaXB0aW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgY2xpZW50U2Vzc2lvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICBpZiAoIXRoaXMuX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgNCwgJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgbG9nZ2VyLmVycm9yKCdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaGFzTWFzdGVyS2V5ID0gdGhpcy5faGFzTWFzdGVyS2V5KHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpO1xuICAgIGNvbnN0IGNsaWVudElkID0gdXVpZHY0KCk7XG4gICAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudChcbiAgICAgIGNsaWVudElkLFxuICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICBoYXNNYXN0ZXJLZXksXG4gICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgIHJlcXVlc3QuaW5zdGFsbGF0aW9uSWRcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXEgPSB7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiByZXF1ZXN0Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKCdAQ29ubmVjdCcsICdiZWZvcmVDb25uZWN0JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXEuc2Vzc2lvblRva2VuKTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlQ29ubmVjdC5AQ29ubmVjdGAsIHJlcSwgYXV0aCk7XG4gICAgICB9XG4gICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCA9IGNsaWVudElkO1xuICAgICAgdGhpcy5jbGllbnRzLnNldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgY2xpZW50KTtcbiAgICAgIGxvZ2dlci5pbmZvKGBDcmVhdGUgbmV3IGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNsaWVudC5wdXNoQ29ubmVjdCgpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhyZXEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlQ29ubmVjdCBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYXNNYXN0ZXJLZXkocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDAgfHwgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXJlcXVlc3QgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC5xdWVyeS5jbGFzc05hbWU7XG4gICAgbGV0IGF1dGhDYWxsZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYmVmb3JlU3Vic2NyaWJlJywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gICAgICAgIHBhcnNlUXVlcnkud2l0aEpTT04ocmVxdWVzdC5xdWVyeSk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVTdWJzY3JpYmUuJHtjbGFzc05hbWV9YCwgcmVxdWVzdCwgYXV0aCk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXF1ZXN0LnF1ZXJ5LnRvSlNPTigpO1xuICAgICAgICBpZiAocXVlcnkua2V5cykge1xuICAgICAgICAgIHF1ZXJ5LmZpZWxkcyA9IHF1ZXJ5LmtleXMuc3BsaXQoJywnKTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgaWYgKCFhdXRoQ2FsbGVkKSB7XG4gICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoXG4gICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZCxcbiAgICAgICAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3QudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUudXNlciA9IHJlcXVlc3QudXNlci50b1BvaW50ZXIoKTtcbiAgICAgICAgfSBlbHNlIGlmICghcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWRcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gR2V0IHN1YnNjcmlwdGlvbiBmcm9tIHN1YnNjcmlwdGlvbnMsIGNyZWF0ZSBvbmUgaWYgbmVjZXNzYXJ5XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25IYXNoID0gcXVlcnlIYXNoKHJlcXVlc3QucXVlcnkpO1xuICAgICAgLy8gQWRkIGNsYXNzTmFtZSB0byBzdWJzY3JpcHRpb25zIGlmIG5lY2Vzc2FyeVxuXG4gICAgICBpZiAoIXRoaXMuc3Vic2NyaXB0aW9ucy5oYXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzTmFtZSwgbmV3IE1hcCgpKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICAgIGxldCBzdWJzY3JpcHRpb247XG4gICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLmhhcyhzdWJzY3JpcHRpb25IYXNoKSkge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBjbGFzc1N1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gbmV3IFN1YnNjcmlwdGlvbihjbGFzc05hbWUsIHJlcXVlc3QucXVlcnkud2hlcmUsIHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuc2V0KHN1YnNjcmlwdGlvbkhhc2gsIHN1YnNjcmlwdGlvbik7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBzdWJzY3JpcHRpb25JbmZvIHRvIGNsaWVudFxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb24sXG4gICAgICB9O1xuICAgICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5maWVsZHMpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5maWVsZHMgPSByZXF1ZXN0LnF1ZXJ5LmZpZWxkcztcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnNlc3Npb25Ub2tlbikge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiA9IHJlcXVlc3Quc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgY2xpZW50LmFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdC5yZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuXG4gICAgICAvLyBBZGQgY2xpZW50SWQgdG8gc3Vic2NyaXB0aW9uXG4gICAgICBzdWJzY3JpcHRpb24uYWRkQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGNsaWVudC5wdXNoU3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgIGBDcmVhdGUgY2xpZW50ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IG5ldyBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXI6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdzdWJzY3JpYmUnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3QucmVxdWVzdElkKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZVN1YnNjcmliZSBvbiAke2NsYXNzTmFtZX0gZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSwgbm90aWZ5Q2xpZW50OiBib29sZWFuID0gdHJ1ZSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgY2xpZW50IHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQgJyArIHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBzdWJzY3JpYmUgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHN1YnNjcmlwdGlvbiBmcm9tIGNsaWVudFxuICAgIGNsaWVudC5kZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHN1YnNjcmlwdGlvbi5jbGFzc05hbWU7XG4gICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdElkKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgfVxuICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShjbGFzc05hbWUpO1xuICAgIH1cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAndW5zdWJzY3JpYmUnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgIHNlc3Npb25Ub2tlbjogc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXX0=
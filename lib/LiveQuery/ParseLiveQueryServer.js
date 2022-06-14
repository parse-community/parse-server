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
      ttl: config.cacheTimeout
    }); // Initialize websocket server

    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config); // Initialize subscriber

    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(_node.default.applicationId + 'afterSave');
    this.subscriber.subscribe(_node.default.applicationId + 'afterDelete');
    this.subscriber.subscribe(_node.default.applicationId + 'clearCache'); // Register message handler for subscriber. When publisher get messages, it will publish message
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

      if (channel === _node.default.applicationId + 'clearCache') {
        this._clearCachedRoles(message.userId);

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

  async _clearCachedRoles(userId) {
    try {
      const validTokens = await new _node.default.Query(_node.default.Session).equalTo('user', _node.default.User.createWithoutData(userId)).find({
        useMasterKey: true
      });
      await Promise.all(validTokens.map(async token => {
        var _auth1$auth, _auth2$auth;

        const sessionToken = token.get('sessionToken');
        const authPromise = this.authCache.get(sessionToken);

        if (!authPromise) {
          return;
        }

        const [auth1, auth2] = await Promise.all([authPromise, (0, _Auth.getAuthForSessionToken)({
          cacheController: this.cacheController,
          sessionToken
        })]);
        (_auth1$auth = auth1.auth) === null || _auth1$auth === void 0 ? void 0 : _auth1$auth.clearRoleCache(sessionToken);
        (_auth2$auth = auth2.auth) === null || _auth2$auth === void 0 ? void 0 : _auth2$auth.clearRoleCache(sessionToken);
        this.authCache.delete(sessionToken);
      }));
    } catch (e) {
      _logger.default.verbose(`Could not clear role cache. ${e}`);
    }
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
        this.authCache.delete(sessionToken);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsInR0bCIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwic3Vic2NyaWJlIiwib24iLCJjaGFubmVsIiwibWVzc2FnZVN0ciIsIm1lc3NhZ2UiLCJKU09OIiwicGFyc2UiLCJlIiwiZXJyb3IiLCJfY2xlYXJDYWNoZWRSb2xlcyIsInVzZXJJZCIsIl9pbmZsYXRlUGFyc2VPYmplY3QiLCJfb25BZnRlclNhdmUiLCJfb25BZnRlckRlbGV0ZSIsImN1cnJlbnRQYXJzZU9iamVjdCIsIlVzZXJSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiY2xhc3NOYW1lIiwicGFyc2VPYmplY3QiLCJfZmluaXNoRmV0Y2giLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiZGVsZXRlZFBhcnNlT2JqZWN0IiwidG9KU09OIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaWQiLCJzaXplIiwiY2xhc3NTdWJzY3JpcHRpb25zIiwiZ2V0IiwiZGVidWciLCJzdWJzY3JpcHRpb24iLCJ2YWx1ZXMiLCJpc1N1YnNjcmlwdGlvbk1hdGNoZWQiLCJfbWF0Y2hlc1N1YnNjcmlwdGlvbiIsImNsaWVudElkIiwicmVxdWVzdElkcyIsIl8iLCJlbnRyaWVzIiwiY2xpZW50UmVxdWVzdElkcyIsImNsaWVudCIsImZvckVhY2giLCJyZXF1ZXN0SWQiLCJhY2wiLCJnZXRBQ0wiLCJvcCIsIl9nZXRDTFBPcGVyYXRpb24iLCJxdWVyeSIsInJlcyIsIl9tYXRjaGVzQ0xQIiwiaXNNYXRjaGVkIiwiX21hdGNoZXNBQ0wiLCJldmVudCIsInNlc3Npb25Ub2tlbiIsIm9iamVjdCIsInVzZU1hc3RlcktleSIsImhhc01hc3RlcktleSIsImluc3RhbGxhdGlvbklkIiwic2VuZEV2ZW50IiwidHJpZ2dlciIsImF1dGgiLCJnZXRBdXRoRnJvbUNsaWVudCIsInVzZXIiLCJmcm9tSlNPTiIsImF1dGhEYXRhIiwicHVzaERlbGV0ZSIsIkNsaWVudCIsInB1c2hFcnJvciIsInBhcnNlV2ViU29ja2V0IiwiY29kZSIsInN0cmluZ2lmeSIsImlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkIiwiaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCIsIm9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiYWxsIiwiaGFzaCIsInR5cGUiLCJvcmlnaW5hbCIsImZ1bmN0aW9uTmFtZSIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic2xpY2UiLCJyZXF1ZXN0IiwidHY0IiwidmFsaWRhdGUiLCJSZXF1ZXN0U2NoZW1hIiwiX2hhbmRsZUNvbm5lY3QiLCJfaGFuZGxlU3Vic2NyaWJlIiwiX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbiIsIl9oYW5kbGVVbnN1YnNjcmliZSIsImluZm8iLCJoYXMiLCJkZWxldGUiLCJzdWJzY3JpcHRpb25JbmZvIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJoYXNTdWJzY3JpYmluZ0NsaWVudCIsInZhbGlkVG9rZW5zIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsIlVzZXIiLCJjcmVhdGVXaXRob3V0RGF0YSIsImZpbmQiLCJtYXAiLCJ0b2tlbiIsImF1dGhQcm9taXNlIiwiYXV0aDEiLCJhdXRoMiIsImNsZWFyUm9sZUNhY2hlIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImZyb21DYWNoZSIsInRoZW4iLCJjYXRjaCIsInJlc3VsdCIsIkVycm9yIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImFjbEdyb3VwIiwicHVzaCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJsZW5ndGgiLCJvYmplY3RJZCIsIl92ZXJpZnlBQ0wiLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInNvbWUiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFNlc3Npb25Gcm9tQ2xpZW50IiwiZ2V0UHVibGljUmVhZEFjY2VzcyIsInN1YnNjcmlwdGlvblRva2VuIiwiY2xpZW50U2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlS2V5cyIsIl9oYXNNYXN0ZXJLZXkiLCJyZXEiLCJwdXNoQ29ubmVjdCIsInZhbGlkS2V5UGFpcnMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpc1ZhbGlkIiwic2VjcmV0IiwiYXV0aENhbGxlZCIsInBhcnNlUXVlcnkiLCJ3aXRoSlNPTiIsImZpZWxkcyIsInNwbGl0Iiwid2hlcmUiLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJzdWJzY3JpcHRpb25IYXNoIiwiU3Vic2NyaXB0aW9uIiwiYWRkU3Vic2NyaXB0aW9uSW5mbyIsImFkZENsaWVudFN1YnNjcmlwdGlvbiIsInB1c2hTdWJzY3JpYmUiLCJub3RpZnlDbGllbnQiLCJkZWxldGVTdWJzY3JpcHRpb25JbmZvIiwicHVzaFVuc3Vic2NyaWJlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBT0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFFQSxNQUFNQSxvQkFBTixDQUEyQjtBQUV6QjtBQUlBO0FBR0FDLEVBQUFBLFdBQVcsQ0FBQ0MsTUFBRCxFQUFjQyxNQUFXLEdBQUcsRUFBNUIsRUFBZ0NDLGlCQUFzQixHQUFHLEVBQXpELEVBQTZEO0FBQ3RFLFNBQUtGLE1BQUwsR0FBY0EsTUFBZDtBQUNBLFNBQUtHLE9BQUwsR0FBZSxJQUFJQyxHQUFKLEVBQWY7QUFDQSxTQUFLQyxhQUFMLEdBQXFCLElBQUlELEdBQUosRUFBckI7QUFDQSxTQUFLSCxNQUFMLEdBQWNBLE1BQWQ7QUFFQUEsSUFBQUEsTUFBTSxDQUFDSyxLQUFQLEdBQWVMLE1BQU0sQ0FBQ0ssS0FBUCxJQUFnQkMsY0FBTUMsYUFBckM7QUFDQVAsSUFBQUEsTUFBTSxDQUFDUSxTQUFQLEdBQW1CUixNQUFNLENBQUNRLFNBQVAsSUFBb0JGLGNBQU1FLFNBQTdDLENBUHNFLENBU3RFOztBQUNBLFVBQU1DLFFBQVEsR0FBR1QsTUFBTSxDQUFDUyxRQUFQLElBQW1CLEVBQXBDO0FBQ0EsU0FBS0EsUUFBTCxHQUFnQixJQUFJTixHQUFKLEVBQWhCOztBQUNBLFNBQUssTUFBTU8sR0FBWCxJQUFrQkMsTUFBTSxDQUFDQyxJQUFQLENBQVlILFFBQVosQ0FBbEIsRUFBeUM7QUFDdkMsV0FBS0EsUUFBTCxDQUFjSSxHQUFkLENBQWtCSCxHQUFsQixFQUF1QkQsUUFBUSxDQUFDQyxHQUFELENBQS9C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QUFBLGNBQWMsRUFBRWpCLE1BQU0sQ0FBQ2lCO0FBUEMsS0FBMUI7O0FBVUEsUUFBSSxDQUFDK0csWUFBTCxFQUFtQjtBQUNqQjtBQUNEOztBQUVEaEksSUFBQUEsTUFBTSxDQUFDa0ksZUFBUCxDQUF1QmpGLE9BQU8sQ0FBQy9DLFNBQS9COztBQUVBM0Qsb0JBQU9DLE9BQVAsQ0FDRyxrQkFBaUJhLGNBQWMsQ0FBQ3NDLFFBQVMsb0JBQW1Cc0QsT0FBTyxDQUFDL0MsU0FBVSxFQURqRjtBQUdEOztBQTE1QndCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR2NCBmcm9tICd0djQnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi9TdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgQ2xpZW50IH0gZnJvbSAnLi9DbGllbnQnO1xuaW1wb3J0IHsgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIgfSBmcm9tICcuL1BhcnNlV2ViU29ja2V0U2VydmVyJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBSZXF1ZXN0U2NoZW1hIGZyb20gJy4vUmVxdWVzdFNjaGVtYSc7XG5pbXBvcnQgeyBtYXRjaGVzUXVlcnksIHF1ZXJ5SGFzaCB9IGZyb20gJy4vUXVlcnlUb29scyc7XG5pbXBvcnQgeyBQYXJzZVB1YlN1YiB9IGZyb20gJy4vUGFyc2VQdWJTdWInO1xuaW1wb3J0IFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQge1xuICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzLFxuICBnZXRUcmlnZ2VyLFxuICBydW5UcmlnZ2VyLFxuICByZXNvbHZlRXJyb3IsXG4gIHRvSlNPTndpdGhPYmplY3RzLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLCBBdXRoIH0gZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgeyBnZXRDYWNoZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9LCBwYXJzZVNlcnZlckNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICB0aGlzLmNsaWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgY29uZmlnLmFwcElkID0gY29uZmlnLmFwcElkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uZmlnLm1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXkgfHwgUGFyc2UubWFzdGVyS2V5O1xuXG4gICAgLy8gU3RvcmUga2V5cywgY29udmVydCBvYmogdG8gbWFwXG4gICAgY29uc3Qga2V5UGFpcnMgPSBjb25maWcua2V5UGFpcnMgfHwge307XG4gICAgdGhpcy5rZXlQYWlycyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhrZXlQYWlycykpIHtcbiAgICAgIHRoaXMua2V5UGFpcnMuc2V0KGtleSwga2V5UGFpcnNba2V5XSk7XG4gICAgfVxuICAgIGxvZ2dlci52ZXJib3NlKCdTdXBwb3J0IGtleSBwYWlycycsIHRoaXMua2V5UGFpcnMpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBQYXJzZVxuICAgIFBhcnNlLk9iamVjdC5kaXNhYmxlU2luZ2xlSW5zdGFuY2UoKTtcbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBjb25maWcuc2VydmVyVVJMIHx8IFBhcnNlLnNlcnZlclVSTDtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShjb25maWcuYXBwSWQsIFBhcnNlLmphdmFTY3JpcHRLZXksIGNvbmZpZy5tYXN0ZXJLZXkpO1xuXG4gICAgLy8gVGhlIGNhY2hlIGNvbnRyb2xsZXIgaXMgYSBwcm9wZXIgY2FjaGUgY29udHJvbGxlclxuICAgIC8vIHdpdGggYWNjZXNzIHRvIFVzZXIgYW5kIFJvbGVzXG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIocGFyc2VTZXJ2ZXJDb25maWcpO1xuXG4gICAgY29uZmlnLmNhY2hlVGltZW91dCA9IGNvbmZpZy5jYWNoZVRpbWVvdXQgfHwgNSAqIDEwMDA7IC8vIDVzXG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgdHRsOiBjb25maWcuY2FjaGVUaW1lb3V0LFxuICAgIH0pO1xuICAgIC8vIEluaXRpYWxpemUgd2Vic29ja2V0IHNlcnZlclxuICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIgPSBuZXcgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIoXG4gICAgICBzZXJ2ZXIsXG4gICAgICBwYXJzZVdlYnNvY2tldCA9PiB0aGlzLl9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQpLFxuICAgICAgY29uZmlnXG4gICAgKTtcblxuICAgIC8vIEluaXRpYWxpemUgc3Vic2NyaWJlclxuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2NsZWFyQ2FjaGUnKTtcbiAgICAvLyBSZWdpc3RlciBtZXNzYWdlIGhhbmRsZXIgZm9yIHN1YnNjcmliZXIuIFdoZW4gcHVibGlzaGVyIGdldCBtZXNzYWdlcywgaXQgd2lsbCBwdWJsaXNoIG1lc3NhZ2VcbiAgICAvLyB0byB0aGUgc3Vic2NyaWJlcnMgYW5kIHRoZSBoYW5kbGVyIHdpbGwgYmUgY2FsbGVkLlxuICAgIHRoaXMuc3Vic2NyaWJlci5vbignbWVzc2FnZScsIChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiB7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnU3Vic2NyaWJlIG1lc3NhZ2UgJWonLCBtZXNzYWdlU3RyKTtcbiAgICAgIGxldCBtZXNzYWdlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgbWVzc2FnZSA9IEpTT04ucGFyc2UobWVzc2FnZVN0cik7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIG1lc3NhZ2UnLCBtZXNzYWdlU3RyLCBlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnY2xlYXJDYWNoZScpIHtcbiAgICAgICAgdGhpcy5fY2xlYXJDYWNoZWRSb2xlcyhtZXNzYWdlLnVzZXJJZCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlKTtcbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlclNhdmUobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJEZWxldGUobWVzc2FnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCBtZXNzYWdlICVzIGZyb20gdW5rbm93biBjaGFubmVsICVqJywgbWVzc2FnZSwgY2hhbm5lbCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oZGVsZXRlZFBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24pO1xuICAgICAgaWYgKCFpc1N1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgY29uc3QgYWNsID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgLy8gQ2hlY2sgQ0xQXG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2hlZCA9IGF3YWl0IHRoaXMuX21hdGNoZXNBQ0woYWNsLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBpZiAoIWlzTWF0Y2hlZCkge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6ICdkZWxldGUnLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogZGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgKGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgfHxcbiAgICAgICAgICAgICAgICBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSAmJlxuICAgICAgICAgICAgICAhY2xpZW50Lmhhc01hc3RlcktleVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBkZWxldGVkUGFyc2VPYmplY3Quc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgZGVsZXRlZFBhcnNlT2JqZWN0LmF1dGhEYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2xpZW50LnB1c2hEZWxldGUocmVxdWVzdElkLCBkZWxldGVkUGFyc2VPYmplY3QpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlclNhdmUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG51bGw7XG4gICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgbGV0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJXMgfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGN1cnJlbnRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgY29uc3QgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIFNldCBvcmlnbmFsIFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgaWYgKCFpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0w7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKG9yaWdpbmFsQUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFNldCBjdXJyZW50IFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgaWYgKCFpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFDTCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0woY3VycmVudEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IFtpc09yaWdpbmFsTWF0Y2hlZCwgaXNDdXJyZW50TWF0Y2hlZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgICAgICAgJ09yaWdpbmFsICVqIHwgQ3VycmVudCAlaiB8IE1hdGNoOiAlcywgJXMsICVzLCAlcyB8IFF1ZXJ5OiAlcycsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxNYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRNYXRjaGVkLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vIERlY2lkZSBldmVudCB0eXBlXG4gICAgICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAndXBkYXRlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgIWlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICdsZWF2ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdlbnRlcic7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjcmVhdGUnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6IHR5cGUsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vcmlnaW5hbCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsICYmIHR5cGVvZiByZXMub3JpZ2luYWwudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwsXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLmNsYXNzTmFtZSB8fCBjbGFzc05hbWVcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgKGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgfHxcbiAgICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSAmJlxuICAgICAgICAgICAgICAhY2xpZW50Lmhhc01hc3RlcktleVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBjdXJyZW50UGFyc2VPYmplY3Quc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgb3JpZ2luYWxQYXJzZU9iamVjdD8uc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgY3VycmVudFBhcnNlT2JqZWN0LmF1dGhEYXRhO1xuICAgICAgICAgICAgICBkZWxldGUgb3JpZ2luYWxQYXJzZU9iamVjdD8uYXV0aERhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCBjdXJyZW50UGFyc2VPYmplY3QsIG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55KTogdm9pZCB7XG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ21lc3NhZ2UnLCByZXF1ZXN0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShyZXF1ZXN0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIHJlcXVlc3QnLCByZXF1ZXN0LCBlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdSZXF1ZXN0OiAlaicsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBhIHZhbGlkIHJlcXVlc3QsIHJldHVybiBlcnJvciBkaXJlY3RseSBpZiBub3RcbiAgICAgIGlmIChcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hWydnZW5lcmFsJ10pIHx8XG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVtyZXF1ZXN0Lm9wXSlcbiAgICAgICkge1xuICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAxLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ29ubmVjdCBtZXNzYWdlIGVycm9yICVzJywgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocmVxdWVzdC5vcCkge1xuICAgICAgICBjYXNlICdjb25uZWN0JzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Vuc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMywgJ0dldCB1bmtub3duIG9wZXJhdGlvbicpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignR2V0IHVua25vd24gb3BlcmF0aW9uJywgcmVxdWVzdC5vcCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBwYXJzZVdlYnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5pbmZvKGBDbGllbnQgZGlzY29ubmVjdDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNvbnN0IGNsaWVudElkID0gcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQ7XG4gICAgICBpZiAoIXRoaXMuY2xpZW50cy5oYXMoY2xpZW50SWQpKSB7XG4gICAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdF9lcnJvcicsXG4gICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgZXJyb3I6IGBVbmFibGUgdG8gZmluZCBjbGllbnQgJHtjbGllbnRJZH1gLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBDYW4gbm90IGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9IG9uIGRpc2Nvbm5lY3RgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWxldGUgY2xpZW50XG4gICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgIHRoaXMuY2xpZW50cy5kZWxldGUoY2xpZW50SWQpO1xuXG4gICAgICAvLyBEZWxldGUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgZm9yIChjb25zdCBbcmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvXSBvZiBfLmVudHJpZXMoY2xpZW50LnN1YnNjcmlwdGlvbkluZm9zKSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICAgICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihjbGllbnRJZCwgcmVxdWVzdElkKTtcblxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudHMgJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBzdWJzY3JpcHRpb25zICVkJywgdGhpcy5zdWJzY3JpcHRpb25zLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KHBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgYXN5bmMgX2NsZWFyQ2FjaGVkUm9sZXModXNlcklkOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFsaWRUb2tlbnMgPSBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmVxdWFsVG8oJ3VzZXInLCBQYXJzZS5Vc2VyLmNyZWF0ZVdpdGhvdXREYXRhKHVzZXJJZCkpXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIHZhbGlkVG9rZW5zLm1hcChhc3luYyB0b2tlbiA9PiB7XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvblRva2VuID0gdG9rZW4uZ2V0KCdzZXNzaW9uVG9rZW4nKTtcbiAgICAgICAgICBjb25zdCBhdXRoUHJvbWlzZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIGlmICghYXV0aFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgW2F1dGgxLCBhdXRoMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBhdXRoUHJvbWlzZSxcbiAgICAgICAgICAgIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oeyBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLCBzZXNzaW9uVG9rZW4gfSksXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgYXV0aDEuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBhdXRoMi5hdXRoPy5jbGVhclJvbGVDYWNoZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgQ291bGQgbm90IGNsZWFyIHJvbGUgY2FjaGUuICR7ZX1gKTtcbiAgICB9XG4gIH1cblxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbjogP3N0cmluZyk6IFByb21pc2U8eyBhdXRoOiA/QXV0aCwgdXNlcklkOiA/c3RyaW5nIH0+IHtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfVxuICAgIGNvbnN0IGZyb21DYWNoZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmIChmcm9tQ2FjaGUpIHtcbiAgICAgIHJldHVybiBmcm9tQ2FjaGU7XG4gICAgfVxuICAgIGNvbnN0IGF1dGhQcm9taXNlID0gZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLFxuICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgfSlcbiAgICAgIC50aGVuKGF1dGggPT4ge1xuICAgICAgICByZXR1cm4geyBhdXRoLCB1c2VySWQ6IGF1dGggJiYgYXV0aC51c2VyICYmIGF1dGgudXNlci5pZCB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlcnJvciB3aXRoIHRoZSBzZXNzaW9uIHRva2VuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksIHRoaXMuY29uZmlnLmNhY2hlVGltZW91dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsZXRlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6ID9hbnksXG4gICAgb2JqZWN0OiBhbnksXG4gICAgY2xpZW50OiBhbnksXG4gICAgcmVxdWVzdElkOiBudW1iZXIsXG4gICAgb3A6IHN0cmluZ1xuICApOiBhbnkge1xuICAgIC8vIHRyeSB0byBtYXRjaCBvbiB1c2VyIGZpcnN0LCBsZXNzIGV4cGVuc2l2ZSB0aGFuIHdpdGggcm9sZXNcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgeyB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbik7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIG9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBvcFxuICAgICAgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBGYWlsZWQgbWF0Y2hpbmcgQ0xQIGZvciAke29iamVjdC5pZH0gJHt1c2VySWR9ICR7ZX1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gVE9ETzogaGFuZGxlIHJvbGVzIHBlcm1pc3Npb25zXG4gICAgLy8gT2JqZWN0LmtleXMoY2xhc3NMZXZlbFBlcm1pc3Npb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgIGNvbnN0IHBlcm0gPSBjbGFzc0xldmVsUGVybWlzc2lvbnNba2V5XTtcbiAgICAvLyAgIE9iamVjdC5rZXlzKHBlcm0pLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgICBpZiAoa2V5LmluZGV4T2YoJ3JvbGUnKSlcbiAgICAvLyAgIH0pO1xuICAgIC8vIH0pXG4gICAgLy8gLy8gaXQncyByZWplY3RlZCBoZXJlLCBjaGVjayB0aGUgcm9sZXNcbiAgICAvLyB2YXIgcm9sZXNRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKTtcbiAgICAvLyByb2xlc1F1ZXJ5LmVxdWFsVG8oXCJ1c2Vyc1wiLCB1c2VyKTtcbiAgICAvLyByZXR1cm4gcm9sZXNRdWVyeS5maW5kKHt1c2VNYXN0ZXJLZXk6dHJ1ZX0pO1xuICB9XG5cbiAgX2dldENMUE9wZXJhdGlvbihxdWVyeTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBxdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT0gMSAmJlxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgPyAnZ2V0J1xuICAgICAgOiAnZmluZCc7XG4gIH1cblxuICBhc3luYyBfdmVyaWZ5QUNMKGFjbDogYW55LCB0b2tlbjogc3RyaW5nKSB7XG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHsgYXV0aCwgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4odG9rZW4pO1xuXG4gICAgLy8gR2V0dGluZyB0aGUgc2Vzc2lvbiB0b2tlbiBmYWlsZWRcbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgbm8gYWRkaXRpb25hbCBhdXRoIGlzIGF2YWlsYWJsZVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIGp1c3QgYmFpbCBvdXQgYXMgbm8gYWRkaXRpb25hbCB2aXNpYmlsaXR5IGNhbiBiZSBpbmZlcnJlZC5cbiAgICBpZiAoIWF1dGggfHwgIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQgPSBhY2wuZ2V0UmVhZEFjY2Vzcyh1c2VySWQpO1xuICAgIGlmIChpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSB1c2VyIGhhcyBhbnkgcm9sZXMgdGhhdCBtYXRjaCB0aGUgQUNMXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIFJlc29sdmUgZmFsc2UgcmlnaHQgYXdheSBpZiB0aGUgYWNsIGRvZXNuJ3QgaGF2ZSBhbnkgcm9sZXNcbiAgICAgICAgY29uc3QgYWNsX2hhc19yb2xlcyA9IE9iamVjdC5rZXlzKGFjbC5wZXJtaXNzaW9uc0J5SWQpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKCdyb2xlOicpKTtcbiAgICAgICAgaWYgKCFhY2xfaGFzX3JvbGVzKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyLCBzZXNzaW9uVG9rZW46IHN0cmluZykge1xuICAgIGNvbnN0IGdldFNlc3Npb25Gcm9tQ2xpZW50ID0gKCkgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuIHx8IGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgfTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgc2Vzc2lvblRva2VuID0gZ2V0U2Vzc2lvbkZyb21DbGllbnQoKTtcbiAgICB9XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgICByZXR1cm4gYXV0aDtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQUNMKGFjbDogYW55LCBjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyBSZXR1cm4gdHJ1ZSBkaXJlY3RseSBpZiBBQ0wgaXNuJ3QgcHJlc2VudCwgQUNMIGlzIHB1YmxpYyByZWFkLCBvciBjbGllbnQgaGFzIG1hc3RlciBrZXlcbiAgICBpZiAoIWFjbCB8fCBhY2wuZ2V0UHVibGljUmVhZEFjY2VzcygpIHx8IGNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBzdWJzY3JpcHRpb24gc2Vzc2lvblRva2VuIG1hdGNoZXMgQUNMIGZpcnN0XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvblRva2VuID0gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW47XG4gICAgY29uc3QgY2xpZW50U2Vzc2lvblRva2VuID0gY2xpZW50LnNlc3Npb25Ub2tlbjtcblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBzdWJzY3JpcHRpb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBjbGllbnRTZXNzaW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIGlmICghdGhpcy5fdmFsaWRhdGVLZXlzKHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCA0LCAnS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBoYXNNYXN0ZXJLZXkgPSB0aGlzLl9oYXNNYXN0ZXJLZXkocmVxdWVzdCwgdGhpcy5rZXlQYWlycyk7XG4gICAgY29uc3QgY2xpZW50SWQgPSB1dWlkdjQoKTtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KFxuICAgICAgY2xpZW50SWQsXG4gICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgIGhhc01hc3RlcktleSxcbiAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgcmVxdWVzdC5pbnN0YWxsYXRpb25JZFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcSA9IHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcXVlc3QuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9O1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoJ0BDb25uZWN0JywgJ2JlZm9yZUNvbm5lY3QnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcS5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXEudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVDb25uZWN0LkBDb25uZWN0YCwgcmVxLCBhdXRoKTtcbiAgICAgIH1cbiAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkID0gY2xpZW50SWQ7XG4gICAgICB0aGlzLmNsaWVudHMuc2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCBjbGllbnQpO1xuICAgICAgbG9nZ2VyLmluZm8oYENyZWF0ZSBuZXcgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY2xpZW50LnB1c2hDb25uZWN0KCk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHJlcSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVDb25uZWN0IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhc01hc3RlcktleShyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCB8fCAhdmFsaWRLZXlQYWlycy5oYXMoJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICghcmVxdWVzdCB8fCAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlcXVlc3QsICdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gcmVxdWVzdC5tYXN0ZXJLZXkgPT09IHZhbGlkS2V5UGFpcnMuZ2V0KCdtYXN0ZXJLZXknKTtcbiAgfVxuXG4gIF92YWxpZGF0ZUtleXMocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBsZXQgaXNWYWxpZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgW2tleSwgc2VjcmV0XSBvZiB2YWxpZEtleVBhaXJzKSB7XG4gICAgICBpZiAoIXJlcXVlc3Rba2V5XSB8fCByZXF1ZXN0W2tleV0gIT09IHNlY3JldCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBpc1ZhbGlkO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSByZXF1ZXN0LnF1ZXJ5LmNsYXNzTmFtZTtcbiAgICBsZXQgYXV0aENhbGxlZCA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdiZWZvcmVTdWJzY3JpYmUnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcXVlc3Quc2Vzc2lvblRva2VuKTtcbiAgICAgICAgYXV0aENhbGxlZCA9IHRydWU7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgICAgICAgcGFyc2VRdWVyeS53aXRoSlNPTihyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZVN1YnNjcmliZS4ke2NsYXNzTmFtZX1gLCByZXF1ZXN0LCBhdXRoKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHJlcXVlc3QucXVlcnkudG9KU09OKCk7XG4gICAgICAgIGlmIChxdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcXVlcnkuZmllbGRzID0gcXVlcnkua2V5cy5zcGxpdCgnLCcpO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICAgIH1cblxuICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykge1xuICAgICAgICBpZiAoIWF1dGhDYWxsZWQpIHtcbiAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChcbiAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkLFxuICAgICAgICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW5cbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC5xdWVyeS53aGVyZS51c2VyID0gcmVxdWVzdC51c2VyLnRvUG9pbnRlcigpO1xuICAgICAgICB9IGVsc2UgaWYgKCFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgICAgICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBHZXQgc3Vic2NyaXB0aW9uIGZyb20gc3Vic2NyaXB0aW9ucywgY3JlYXRlIG9uZSBpZiBuZWNlc3NhcnlcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkhhc2ggPSBxdWVyeUhhc2gocmVxdWVzdC5xdWVyeSk7XG4gICAgICAvLyBBZGQgY2xhc3NOYW1lIHRvIHN1YnNjcmlwdGlvbnMgaWYgbmVjZXNzYXJ5XG5cbiAgICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25zLmhhcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NOYW1lLCBuZXcgTWFwKCkpO1xuICAgICAgfVxuICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgICAgbGV0IHN1YnNjcmlwdGlvbjtcbiAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuaGFzKHN1YnNjcmlwdGlvbkhhc2gpKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IGNsYXNzU3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBuZXcgU3Vic2NyaXB0aW9uKGNsYXNzTmFtZSwgcmVxdWVzdC5xdWVyeS53aGVyZSwgc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5zZXQoc3Vic2NyaXB0aW9uSGFzaCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIHN1YnNjcmlwdGlvbkluZm8gdG8gY2xpZW50XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0ge1xuICAgICAgICBzdWJzY3JpcHRpb246IHN1YnNjcmlwdGlvbixcbiAgICAgIH07XG4gICAgICAvLyBBZGQgc2VsZWN0ZWQgZmllbGRzLCBzZXNzaW9uVG9rZW4gYW5kIGluc3RhbGxhdGlvbklkIGZvciB0aGlzIHN1YnNjcmlwdGlvbiBpZiBuZWNlc3NhcnlcbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LmZpZWxkcykge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLmZpZWxkcyA9IHJlcXVlc3QucXVlcnkuZmllbGRzO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3Quc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBjbGllbnQuYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0LnJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG5cbiAgICAgIC8vIEFkZCBjbGllbnRJZCB0byBzdWJzY3JpcHRpb25cbiAgICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgY2xpZW50LnB1c2hTdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgICApO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlcjogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ3N1YnNjcmliZScsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlU3Vic2NyaWJlIG9uICR7Y2xhc3NOYW1lfSBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCwgZmFsc2UpO1xuICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gIH1cblxuICBfaGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55LCBub3RpZnlDbGllbnQ6IGJvb2xlYW4gPSB0cnVlKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIW5vdGlmeUNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNsaWVudC5wdXNoVW5zdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICBgRGVsZXRlIGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gfCBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfTtcbiJdfQ==
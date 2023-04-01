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
var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));
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
    config.masterKey = config.masterKey || _node.default.masterKey;

    // Store keys, convert obj to map
    const keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();
    for (const key of Object.keys(keyPairs)) {
      this.keyPairs.set(key, keyPairs[key]);
    }
    _logger.default.verbose('Support key pairs', this.keyPairs);

    // Initialize Parse
    _node.default.Object.disableSingleInstance();
    const serverURL = config.serverURL || _node.default.serverURL;
    _node.default.serverURL = serverURL;
    _node.default.initialize(config.appId, _node.default.javaScriptKey, config.masterKey);

    // The cache controller is a proper cache controller
    // with access to User and Roles
    this.cacheController = (0, _Controllers.getCacheController)(parseServerConfig);
    config.cacheTimeout = config.cacheTimeout || 5 * 1000; // 5s

    // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.
    this.authCache = new _lruCache.default({
      max: 500,
      // 500 concurrent
      ttl: config.cacheTimeout
    });
    // Initialize websocket server
    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config);

    // Initialize subscriber
    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(_node.default.applicationId + 'afterSave');
    this.subscriber.subscribe(_node.default.applicationId + 'afterDelete');
    this.subscriber.subscribe(_node.default.applicationId + 'clearCache');
    // Register message handler for subscriber. When publisher get messages, it will publish message
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
  }

  // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.
  _inflateParseObject(message) {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;
    _UsersRouter.default.removeHiddenProperties(currentParseObject);
    let className = currentParseObject.className;
    let parseObject = new _node.default.Object(className);
    parseObject._finishFetch(currentParseObject);
    message.currentParseObject = parseObject;
    // Inflate original object
    const originalParseObject = message.originalParseObject;
    if (originalParseObject) {
      _UsersRouter.default.removeHiddenProperties(originalParseObject);
      className = originalParseObject.className;
      parseObject = new _node.default.Object(className);
      parseObject._finishFetch(originalParseObject);
      message.originalParseObject = parseObject;
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
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
          const acl = message.currentParseObject.getACL();
          // Check CLP
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
            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            client.pushDelete(requestId, deletedParseObject);
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);
            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);
            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
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
          }
          // Set current ParseObject ACL checking promise, if the object does not match
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
            _logger.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', originalParseObject, currentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash);
            // Decide event type
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
            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
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
      _logger.default.verbose('Request: %j', request);

      // Check whether this request is a valid request, return error directly if not
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
      }

      // Delete client
      const client = this.clients.get(clientId);
      this.clients.delete(clientId);

      // Delete client from subscriptions
      for (const [requestId, subscriptionInfo] of _lodash.default.entries(client.subscriptionInfos)) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId);

        // If there is no client which is subscribing this subscription, remove it from subscriptions
        const classSubscriptions = this.subscriptions.get(subscription.className);
        if (!subscription.hasSubscribingClient()) {
          classSubscriptions.delete(subscription.hash);
        }
        // If there is no subscriptions under this class, remove it from subscriptions
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
    }
    // TODO: handle roles permissions
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

  async _filterSensitiveData(classLevelPermissions, res, client, requestId, op, query) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let clientAuth;
    if (typeof subscriptionInfo !== 'undefined') {
      const {
        userId,
        auth
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);
      if (userId) {
        aclGroup.push(userId);
      }
      clientAuth = auth;
    }
    const filter = obj => {
      if (!obj) {
        return;
      }
      let protectedFields = (classLevelPermissions === null || classLevelPermissions === void 0 ? void 0 : classLevelPermissions.protectedFields) || [];
      if (!client.hasMasterKey && !Array.isArray(protectedFields)) {
        protectedFields = (0, _Controllers.getDatabaseController)(this.config).addProtectedFields(classLevelPermissions, res.object.className, query, aclGroup, clientAuth);
      }
      return _DatabaseController.default.filterSensitiveData(client.hasMasterKey, aclGroup, clientAuth, op, classLevelPermissions, res.object.className, protectedFields, obj, query);
    };
    res.object = filter(res.object);
    res.original = filter(res.original);
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
    } = await this.getAuthForSessionToken(token);

    // Getting the session token failed
    // This means that no additional auth is available
    // At this point, just bail out as no additional visibility can be inferred.
    if (!auth || !userId) {
      return false;
    }
    const isSubscriptionSessionTokenMatched = acl.getReadAccess(userId);
    if (isSubscriptionSessionTokenMatched) {
      return true;
    }

    // Check if the user has any roles that match the ACL
    return Promise.resolve().then(async () => {
      // Resolve false right away if the acl doesn't have any roles
      const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));
      if (!acl_has_roles) {
        return false;
      }
      const roleNames = await auth.getUserRoles();
      // Finally, see if any of the user's roles allow them read access
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
    }
    // Check subscription sessionToken matches ACL first
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
      }
      // Get subscription from subscriptions, create one if necessary
      const subscriptionHash = (0, _QueryTools.queryHash)(request.query);
      // Add className to subscriptions if necessary

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
      }

      // Add subscriptionInfo to client
      const subscriptionInfo = {
        subscription: subscription
      };
      // Add selected fields, sessionToken and installationId for this subscription if necessary
      if (request.query.fields) {
        subscriptionInfo.fields = request.query.fields;
      }
      if (request.sessionToken) {
        subscriptionInfo.sessionToken = request.sessionToken;
      }
      client.addSubscriptionInfo(request.requestId, subscriptionInfo);

      // Add clientId to subscription
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
    }

    // Remove subscription from client
    client.deleteSubscriptionInfo(requestId);
    // Remove client from subscription
    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    subscription.deleteClientSubscription(parseWebsocket.clientId, requestId);
    // If there is no client which is subscribing this subscription, remove it from subscriptions
    const classSubscriptions = this.subscriptions.get(className);
    if (!subscription.hasSubscribingClient()) {
      classSubscriptions.delete(subscription.hash);
    }
    // If there is no subscriptions under this class, remove it from subscriptions
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwidHRsIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJzdWJzY3JpYmUiLCJvbiIsImNoYW5uZWwiLCJtZXNzYWdlU3RyIiwibWVzc2FnZSIsIkpTT04iLCJwYXJzZSIsImUiLCJlcnJvciIsIl9jbGVhckNhY2hlZFJvbGVzIiwidXNlcklkIiwiX2luZmxhdGVQYXJzZU9iamVjdCIsIl9vbkFmdGVyU2F2ZSIsIl9vbkFmdGVyRGVsZXRlIiwiY3VycmVudFBhcnNlT2JqZWN0IiwiVXNlclJvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJjbGFzc05hbWUiLCJwYXJzZU9iamVjdCIsIl9maW5pc2hGZXRjaCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJkZWxldGVkUGFyc2VPYmplY3QiLCJ0b0pTT04iLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpZCIsInNpemUiLCJjbGFzc1N1YnNjcmlwdGlvbnMiLCJnZXQiLCJkZWJ1ZyIsInN1YnNjcmlwdGlvbiIsInZhbHVlcyIsImlzU3Vic2NyaXB0aW9uTWF0Y2hlZCIsIl9tYXRjaGVzU3Vic2NyaXB0aW9uIiwiY2xpZW50SWQiLCJyZXF1ZXN0SWRzIiwiXyIsImVudHJpZXMiLCJjbGllbnRSZXF1ZXN0SWRzIiwiY2xpZW50IiwiZm9yRWFjaCIsInJlcXVlc3RJZCIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwiX21hdGNoZXNDTFAiLCJpc01hdGNoZWQiLCJfbWF0Y2hlc0FDTCIsImV2ZW50Iiwic2Vzc2lvblRva2VuIiwib2JqZWN0IiwidXNlTWFzdGVyS2V5IiwiaGFzTWFzdGVyS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJzZW5kRXZlbnQiLCJ0cmlnZ2VyIiwiZ2V0VHJpZ2dlciIsImF1dGgiLCJnZXRBdXRoRnJvbUNsaWVudCIsInVzZXIiLCJmcm9tSlNPTiIsInJ1blRyaWdnZXIiLCJ0b0pTT053aXRoT2JqZWN0cyIsIl9maWx0ZXJTZW5zaXRpdmVEYXRhIiwicHVzaERlbGV0ZSIsInJlc29sdmVFcnJvciIsIkNsaWVudCIsInB1c2hFcnJvciIsInBhcnNlV2ViU29ja2V0IiwiY29kZSIsInN0cmluZ2lmeSIsImlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkIiwiaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCIsIm9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiYWxsIiwiaGFzaCIsInR5cGUiLCJvcmlnaW5hbCIsImZ1bmN0aW9uTmFtZSIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic2xpY2UiLCJyZXF1ZXN0IiwidHY0IiwidmFsaWRhdGUiLCJSZXF1ZXN0U2NoZW1hIiwiX2hhbmRsZUNvbm5lY3QiLCJfaGFuZGxlU3Vic2NyaWJlIiwiX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbiIsIl9oYW5kbGVVbnN1YnNjcmliZSIsImluZm8iLCJoYXMiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZGVsZXRlIiwic3Vic2NyaXB0aW9uSW5mbyIsInN1YnNjcmlwdGlvbkluZm9zIiwiZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uIiwiaGFzU3Vic2NyaWJpbmdDbGllbnQiLCJtYXRjaGVzUXVlcnkiLCJ2YWxpZFRva2VucyIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJVc2VyIiwiY3JlYXRlV2l0aG91dERhdGEiLCJmaW5kIiwibWFwIiwidG9rZW4iLCJhdXRoUHJvbWlzZSIsImF1dGgxIiwiYXV0aDIiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiY2xlYXJSb2xlQ2FjaGUiLCJmcm9tQ2FjaGUiLCJ0aGVuIiwiY2F0Y2giLCJyZXN1bHQiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsImdldFN1YnNjcmlwdGlvbkluZm8iLCJhY2xHcm91cCIsInB1c2giLCJTY2hlbWFDb250cm9sbGVyIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY2xpZW50QXV0aCIsImZpbHRlciIsIm9iaiIsInByb3RlY3RlZEZpZWxkcyIsIkFycmF5IiwiaXNBcnJheSIsImdldERhdGFiYXNlQ29udHJvbGxlciIsImFkZFByb3RlY3RlZEZpZWxkcyIsIkRhdGFiYXNlQ29udHJvbGxlciIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJsZW5ndGgiLCJvYmplY3RJZCIsIl92ZXJpZnlBQ0wiLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInNvbWUiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFNlc3Npb25Gcm9tQ2xpZW50IiwiZ2V0UHVibGljUmVhZEFjY2VzcyIsInN1YnNjcmlwdGlvblRva2VuIiwiY2xpZW50U2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlS2V5cyIsIl9oYXNNYXN0ZXJLZXkiLCJ1dWlkdjQiLCJyZXEiLCJwdXNoQ29ubmVjdCIsInZhbGlkS2V5UGFpcnMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpc1ZhbGlkIiwic2VjcmV0IiwiYXV0aENhbGxlZCIsInBhcnNlUXVlcnkiLCJ3aXRoSlNPTiIsImZpZWxkcyIsInNwbGl0Iiwid2hlcmUiLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJzdWJzY3JpcHRpb25IYXNoIiwicXVlcnlIYXNoIiwiU3Vic2NyaXB0aW9uIiwiYWRkU3Vic2NyaXB0aW9uSW5mbyIsImFkZENsaWVudFN1YnNjcmlwdGlvbiIsInB1c2hTdWJzY3JpYmUiLCJub3RpZnlDbGllbnQiLCJkZWxldGVTdWJzY3JpcHRpb25JbmZvIiwicHVzaFVuc3Vic2NyaWJlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHY0IGZyb20gJ3R2NCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICcuL1N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBDbGllbnQgfSBmcm9tICcuL0NsaWVudCc7XG5pbXBvcnQgeyBQYXJzZVdlYlNvY2tldFNlcnZlciB9IGZyb20gJy4vUGFyc2VXZWJTb2NrZXRTZXJ2ZXInO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFJlcXVlc3RTY2hlbWEgZnJvbSAnLi9SZXF1ZXN0U2NoZW1hJztcbmltcG9ydCB7IG1hdGNoZXNRdWVyeSwgcXVlcnlIYXNoIH0gZnJvbSAnLi9RdWVyeVRvb2xzJztcbmltcG9ydCB7IFBhcnNlUHViU3ViIH0gZnJvbSAnLi9QYXJzZVB1YlN1Yic7XG5pbXBvcnQgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCB7XG4gIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMsXG4gIGdldFRyaWdnZXIsXG4gIHJ1blRyaWdnZXIsXG4gIHJlc29sdmVFcnJvcixcbiAgdG9KU09Od2l0aE9iamVjdHMsXG59IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sIEF1dGggfSBmcm9tICcuLi9BdXRoJztcbmltcG9ydCB7IGdldENhY2hlQ29udHJvbGxlciwgZ2V0RGF0YWJhc2VDb250cm9sbGVyIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IExSVSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IFVzZXJSb3V0ZXIgZnJvbSAnLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5cbmNsYXNzIFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIHtcbiAgY2xpZW50czogTWFwO1xuICAvLyBjbGFzc05hbWUgLT4gKHF1ZXJ5SGFzaCAtPiBzdWJzY3JpcHRpb24pXG4gIHN1YnNjcmlwdGlvbnM6IE9iamVjdDtcbiAgcGFyc2VXZWJTb2NrZXRTZXJ2ZXI6IE9iamVjdDtcbiAga2V5UGFpcnM6IGFueTtcbiAgLy8gVGhlIHN1YnNjcmliZXIgd2UgdXNlIHRvIGdldCBvYmplY3QgdXBkYXRlIGZyb20gcHVibGlzaGVyXG4gIHN1YnNjcmliZXI6IE9iamVjdDtcblxuICBjb25zdHJ1Y3RvcihzZXJ2ZXI6IGFueSwgY29uZmlnOiBhbnkgPSB7fSwgcGFyc2VTZXJ2ZXJDb25maWc6IGFueSA9IHt9KSB7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgdGhpcy5jbGllbnRzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIGNvbmZpZy5hcHBJZCA9IGNvbmZpZy5hcHBJZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgIGNvbmZpZy5tYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5IHx8IFBhcnNlLm1hc3RlcktleTtcblxuICAgIC8vIFN0b3JlIGtleXMsIGNvbnZlcnQgb2JqIHRvIG1hcFxuICAgIGNvbnN0IGtleVBhaXJzID0gY29uZmlnLmtleVBhaXJzIHx8IHt9O1xuICAgIHRoaXMua2V5UGFpcnMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoa2V5UGFpcnMpKSB7XG4gICAgICB0aGlzLmtleVBhaXJzLnNldChrZXksIGtleVBhaXJzW2tleV0pO1xuICAgIH1cbiAgICBsb2dnZXIudmVyYm9zZSgnU3VwcG9ydCBrZXkgcGFpcnMnLCB0aGlzLmtleVBhaXJzKTtcblxuICAgIC8vIEluaXRpYWxpemUgUGFyc2VcbiAgICBQYXJzZS5PYmplY3QuZGlzYWJsZVNpbmdsZUluc3RhbmNlKCk7XG4gICAgY29uc3Qgc2VydmVyVVJMID0gY29uZmlnLnNlcnZlclVSTCB8fCBQYXJzZS5zZXJ2ZXJVUkw7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuICAgIFBhcnNlLmluaXRpYWxpemUoY29uZmlnLmFwcElkLCBQYXJzZS5qYXZhU2NyaXB0S2V5LCBjb25maWcubWFzdGVyS2V5KTtcblxuICAgIC8vIFRoZSBjYWNoZSBjb250cm9sbGVyIGlzIGEgcHJvcGVyIGNhY2hlIGNvbnRyb2xsZXJcbiAgICAvLyB3aXRoIGFjY2VzcyB0byBVc2VyIGFuZCBSb2xlc1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gZ2V0Q2FjaGVDb250cm9sbGVyKHBhcnNlU2VydmVyQ29uZmlnKTtcblxuICAgIGNvbmZpZy5jYWNoZVRpbWVvdXQgPSBjb25maWcuY2FjaGVUaW1lb3V0IHx8IDUgKiAxMDAwOyAvLyA1c1xuXG4gICAgLy8gVGhpcyBhdXRoIGNhY2hlIHN0b3JlcyB0aGUgcHJvbWlzZXMgZm9yIGVhY2ggYXV0aCByZXNvbHV0aW9uLlxuICAgIC8vIFRoZSBtYWluIGJlbmVmaXQgaXMgdG8gYmUgYWJsZSB0byByZXVzZSB0aGUgc2FtZSB1c2VyIC8gc2Vzc2lvbiB0b2tlbiByZXNvbHV0aW9uLlxuICAgIHRoaXMuYXV0aENhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IDUwMCwgLy8gNTAwIGNvbmN1cnJlbnRcbiAgICAgIHR0bDogY29uZmlnLmNhY2hlVGltZW91dCxcbiAgICB9KTtcbiAgICAvLyBJbml0aWFsaXplIHdlYnNvY2tldCBzZXJ2ZXJcbiAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyID0gbmV3IFBhcnNlV2ViU29ja2V0U2VydmVyKFxuICAgICAgc2VydmVyLFxuICAgICAgcGFyc2VXZWJzb2NrZXQgPT4gdGhpcy5fb25Db25uZWN0KHBhcnNlV2Vic29ja2V0KSxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBJbml0aWFsaXplIHN1YnNjcmliZXJcbiAgICB0aGlzLnN1YnNjcmliZXIgPSBQYXJzZVB1YlN1Yi5jcmVhdGVTdWJzY3JpYmVyKGNvbmZpZyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpO1xuICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpO1xuICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoUGFyc2UuYXBwbGljYXRpb25JZCArICdjbGVhckNhY2hlJyk7XG4gICAgLy8gUmVnaXN0ZXIgbWVzc2FnZSBoYW5kbGVyIGZvciBzdWJzY3JpYmVyLiBXaGVuIHB1Ymxpc2hlciBnZXQgbWVzc2FnZXMsIGl0IHdpbGwgcHVibGlzaCBtZXNzYWdlXG4gICAgLy8gdG8gdGhlIHN1YnNjcmliZXJzIGFuZCB0aGUgaGFuZGxlciB3aWxsIGJlIGNhbGxlZC5cbiAgICB0aGlzLnN1YnNjcmliZXIub24oJ21lc3NhZ2UnLCAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2NsZWFyQ2FjaGUnKSB7XG4gICAgICAgIHRoaXMuX2NsZWFyQ2FjaGVkUm9sZXMobWVzc2FnZS51c2VySWQpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLl9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZSk7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJTYXZlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyRGVsZXRlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgbWVzc2FnZSAlcyBmcm9tIHVua25vd24gY2hhbm5lbCAlaicsIG1lc3NhZ2UsIGNoYW5uZWwpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBKU09OIGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QgSlNPTi5cbiAgX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICAvLyBJbmZsYXRlIG1lcmdlZCBvYmplY3RcbiAgICBjb25zdCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMoY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBsZXQgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsZXQgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICAvLyBJbmZsYXRlIG9yaWdpbmFsIG9iamVjdFxuICAgIGNvbnN0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIGNsYXNzTmFtZSA9IG9yaWdpbmFsUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgICAgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2gob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyRGVsZXRlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgZGVsZXRlZFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlaiB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgZGVsZXRlZFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc1N1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKGRlbGV0ZWRQYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIGlmICghaXNTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIGNvbnN0IGFjbCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgIC8vIENoZWNrIENMUFxuICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBpc01hdGNoZWQgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgaWYgKCFpc01hdGNoZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiAnZGVsZXRlJyxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGRlbGV0ZWRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZWRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjbGllbnQucHVzaERlbGV0ZShyZXF1ZXN0SWQsIGRlbGV0ZWRQYXJzZU9iamVjdCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBsZXQgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlcyB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgY3VycmVudFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBjb25zdCBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgLy8gU2V0IG9yaWduYWwgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBpZiAoIWlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBvcmlnaW5hbEFDTDtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0wgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0wob3JpZ2luYWxBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gU2V0IGN1cnJlbnQgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICBpZiAoIWlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QUNMID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChjdXJyZW50QUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgW2lzT3JpZ2luYWxNYXRjaGVkLCBpc0N1cnJlbnRNYXRjaGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbE1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudE1hdGNoZWQsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5oYXNoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gRGVjaWRlIGV2ZW50IHR5cGVcbiAgICAgICAgICAgIGxldCB0eXBlO1xuICAgICAgICAgICAgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICd1cGRhdGUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiAhaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ2xlYXZlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2VudGVyJztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NyZWF0ZSc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogdHlwZSxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwpIHtcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9yaWdpbmFsKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwgJiYgdHlwZW9mIHJlcy5vcmlnaW5hbC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCxcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5fZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICByZXMsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLnF1ZXJ5XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZnVuY3Rpb25OYW1lID0gJ3B1c2gnICsgcmVzLmV2ZW50LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcmVzLmV2ZW50LnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGNsaWVudFtmdW5jdGlvbk5hbWVdKSB7XG4gICAgICAgICAgICAgIGNsaWVudFtmdW5jdGlvbk5hbWVdKHJlcXVlc3RJZCwgY3VycmVudFBhcnNlT2JqZWN0LCBvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSk6IHZvaWQge1xuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdtZXNzYWdlJywgcmVxdWVzdCA9PiB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UocmVxdWVzdCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSByZXF1ZXN0JywgcmVxdWVzdCwgZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsb2dnZXIudmVyYm9zZSgnUmVxdWVzdDogJWonLCByZXF1ZXN0KTtcblxuICAgICAgLy8gQ2hlY2sgd2hldGhlciB0aGlzIHJlcXVlc3QgaXMgYSB2YWxpZCByZXF1ZXN0LCByZXR1cm4gZXJyb3IgZGlyZWN0bHkgaWYgbm90XG4gICAgICBpZiAoXG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVsnZ2VuZXJhbCddKSB8fFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbcmVxdWVzdC5vcF0pXG4gICAgICApIHtcbiAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMSwgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0Nvbm5lY3QgbWVzc2FnZSBlcnJvciAlcycsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHJlcXVlc3Qub3ApIHtcbiAgICAgICAgY2FzZSAnY29ubmVjdCc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXBkYXRlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1bnN1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDMsICdHZXQgdW5rbm93biBvcGVyYXRpb24nKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCB1bmtub3duIG9wZXJhdGlvbicsIHJlcXVlc3Qub3ApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbyhgQ2xpZW50IGRpc2Nvbm5lY3Q6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjb25zdCBjbGllbnRJZCA9IHBhcnNlV2Vic29ja2V0LmNsaWVudElkO1xuICAgICAgaWYgKCF0aGlzLmNsaWVudHMuaGFzKGNsaWVudElkKSkge1xuICAgICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3RfZXJyb3InLFxuICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgIGVycm9yOiBgVW5hYmxlIHRvIGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgQ2FuIG5vdCBmaW5kIGNsaWVudCAke2NsaWVudElkfSBvbiBkaXNjb25uZWN0YCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gRGVsZXRlIGNsaWVudFxuICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICB0aGlzLmNsaWVudHMuZGVsZXRlKGNsaWVudElkKTtcblxuICAgICAgLy8gRGVsZXRlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgIGZvciAoY29uc3QgW3JlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mb10gb2YgXy5lbnRyaWVzKGNsaWVudC5zdWJzY3JpcHRpb25JbmZvcykpIHtcbiAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24oY2xpZW50SWQsIHJlcXVlc3RJZCk7XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnRzICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgc3Vic2NyaXB0aW9ucyAlZCcsIHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGV2ZW50OiAnd3NfY29ubmVjdCcsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgIH0pO1xuICB9XG5cbiAgX21hdGNoZXNTdWJzY3JpcHRpb24ocGFyc2VPYmplY3Q6IGFueSwgc3Vic2NyaXB0aW9uOiBhbnkpOiBib29sZWFuIHtcbiAgICAvLyBPYmplY3QgaXMgdW5kZWZpbmVkIG9yIG51bGwsIG5vdCBtYXRjaFxuICAgIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoZXNRdWVyeShwYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgfVxuXG4gIGFzeW5jIF9jbGVhckNhY2hlZFJvbGVzKHVzZXJJZDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHZhbGlkVG9rZW5zID0gYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5lcXVhbFRvKCd1c2VyJywgUGFyc2UuVXNlci5jcmVhdGVXaXRob3V0RGF0YSh1c2VySWQpKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICB2YWxpZFRva2Vucy5tYXAoYXN5bmMgdG9rZW4gPT4ge1xuICAgICAgICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHRva2VuLmdldCgnc2Vzc2lvblRva2VuJyk7XG4gICAgICAgICAgY29uc3QgYXV0aFByb21pc2UgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBpZiAoIWF1dGhQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IFthdXRoMSwgYXV0aDJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgYXV0aFByb21pc2UsXG4gICAgICAgICAgICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHsgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlciwgc2Vzc2lvblRva2VuIH0pLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGF1dGgxLmF1dGg/LmNsZWFyUm9sZUNhY2hlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgYXV0aDIuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5kZWxldGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoYENvdWxkIG5vdCBjbGVhciByb2xlIGNhY2hlLiAke2V9YCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW46ID9zdHJpbmcpOiBQcm9taXNlPHsgYXV0aDogP0F1dGgsIHVzZXJJZDogP3N0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIG9iamVjdDogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmdcbiAgKTogYW55IHtcbiAgICAvLyB0cnkgdG8gbWF0Y2ggb24gdXNlciBmaXJzdCwgbGVzcyBleHBlbnNpdmUgdGhhbiB3aXRoIHJvbGVzXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgdXNlcklkO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgRmFpbGVkIG1hdGNoaW5nIENMUCBmb3IgJHtvYmplY3QuaWR9ICR7dXNlcklkfSAke2V9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIFRPRE86IGhhbmRsZSByb2xlcyBwZXJtaXNzaW9uc1xuICAgIC8vIE9iamVjdC5rZXlzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICBjb25zdCBwZXJtID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zW2tleV07XG4gICAgLy8gICBPYmplY3Qua2V5cyhwZXJtKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgICAgaWYgKGtleS5pbmRleE9mKCdyb2xlJykpXG4gICAgLy8gICB9KTtcbiAgICAvLyB9KVxuICAgIC8vIC8vIGl0J3MgcmVqZWN0ZWQgaGVyZSwgY2hlY2sgdGhlIHJvbGVzXG4gICAgLy8gdmFyIHJvbGVzUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSk7XG4gICAgLy8gcm9sZXNRdWVyeS5lcXVhbFRvKFwidXNlcnNcIiwgdXNlcik7XG4gICAgLy8gcmV0dXJuIHJvbGVzUXVlcnkuZmluZCh7dXNlTWFzdGVyS2V5OnRydWV9KTtcbiAgfVxuXG4gIGFzeW5jIF9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogP2FueSxcbiAgICByZXM6IGFueSxcbiAgICBjbGllbnQ6IGFueSxcbiAgICByZXF1ZXN0SWQ6IG51bWJlcixcbiAgICBvcDogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnlcbiAgKSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgY2xpZW50QXV0aDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCwgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgfVxuICAgIGNvbnN0IGZpbHRlciA9IG9iaiA9PiB7XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgcHJvdGVjdGVkRmllbGRzID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zPy5wcm90ZWN0ZWRGaWVsZHMgfHwgW107XG4gICAgICBpZiAoIWNsaWVudC5oYXNNYXN0ZXJLZXkgJiYgIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBnZXREYXRhYmFzZUNvbnRyb2xsZXIodGhpcy5jb25maWcpLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcXVlcnksXG4gICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgY2xpZW50QXV0aFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIERhdGFiYXNlQ29udHJvbGxlci5maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgY2xpZW50QXV0aCxcbiAgICAgICAgb3AsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgb2JqLFxuICAgICAgICBxdWVyeVxuICAgICAgKTtcbiAgICB9O1xuICAgIHJlcy5vYmplY3QgPSBmaWx0ZXIocmVzLm9iamVjdCk7XG4gICAgcmVzLm9yaWdpbmFsID0gZmlsdGVyKHJlcy5vcmlnaW5hbCk7XG4gIH1cblxuICBfZ2V0Q0xQT3BlcmF0aW9uKHF1ZXJ5OiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mIHF1ZXJ5ID09PSAnb2JqZWN0JyAmJlxuICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PSAxICYmXG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICA/ICdnZXQnXG4gICAgICA6ICdmaW5kJztcbiAgfVxuXG4gIGFzeW5jIF92ZXJpZnlBQ0woYWNsOiBhbnksIHRva2VuOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgeyBhdXRoLCB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih0b2tlbik7XG5cbiAgICAvLyBHZXR0aW5nIHRoZSBzZXNzaW9uIHRva2VuIGZhaWxlZFxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBubyBhZGRpdGlvbmFsIGF1dGggaXMgYXZhaWxhYmxlXG4gICAgLy8gQXQgdGhpcyBwb2ludCwganVzdCBiYWlsIG91dCBhcyBubyBhZGRpdGlvbmFsIHZpc2liaWxpdHkgY2FuIGJlIGluZmVycmVkLlxuICAgIGlmICghYXV0aCB8fCAhdXNlcklkKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCA9IGFjbC5nZXRSZWFkQWNjZXNzKHVzZXJJZCk7XG4gICAgaWYgKGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHVzZXIgaGFzIGFueSByb2xlcyB0aGF0IG1hdGNoIHRoZSBBQ0xcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgLy8gUmVzb2x2ZSBmYWxzZSByaWdodCBhd2F5IGlmIHRoZSBhY2wgZG9lc24ndCBoYXZlIGFueSByb2xlc1xuICAgICAgICBjb25zdCBhY2xfaGFzX3JvbGVzID0gT2JqZWN0LmtleXMoYWNsLnBlcm1pc3Npb25zQnlJZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpO1xuICAgICAgICBpZiAoIWFjbF9oYXNfcm9sZXMpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgICAgICAgLy8gRmluYWxseSwgc2VlIGlmIGFueSBvZiB0aGUgdXNlcidzIHJvbGVzIGFsbG93IHRoZW0gcmVhZCBhY2Nlc3NcbiAgICAgICAgZm9yIChjb25zdCByb2xlIG9mIHJvbGVOYW1lcykge1xuICAgICAgICAgIC8vIFdlIHVzZSBnZXRSZWFkQWNjZXNzIGFzIGByb2xlYCBpcyBpbiB0aGUgZm9ybSBgcm9sZTpyb2xlTmFtZWBcbiAgICAgICAgICBpZiAoYWNsLmdldFJlYWRBY2Nlc3Mocm9sZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRBdXRoRnJvbUNsaWVudChjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIsIHNlc3Npb25Ub2tlbjogc3RyaW5nKSB7XG4gICAgY29uc3QgZ2V0U2Vzc2lvbkZyb21DbGllbnQgPSAoKSA9PiB7XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICByZXR1cm4gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gfHwgY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICB9O1xuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICBzZXNzaW9uVG9rZW4gPSBnZXRTZXNzaW9uRnJvbUNsaWVudCgpO1xuICAgIH1cbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7IGF1dGggfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW4pO1xuICAgIHJldHVybiBhdXRoO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNBQ0woYWNsOiBhbnksIGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIC8vIFJldHVybiB0cnVlIGRpcmVjdGx5IGlmIEFDTCBpc24ndCBwcmVzZW50LCBBQ0wgaXMgcHVibGljIHJlYWQsIG9yIGNsaWVudCBoYXMgbWFzdGVyIGtleVxuICAgIGlmICghYWNsIHx8IGFjbC5nZXRQdWJsaWNSZWFkQWNjZXNzKCkgfHwgY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHN1YnNjcmlwdGlvbiBzZXNzaW9uVG9rZW4gbWF0Y2hlcyBBQ0wgZmlyc3RcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uVG9rZW4gPSBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbjtcbiAgICBjb25zdCBjbGllbnRTZXNzaW9uVG9rZW4gPSBjbGllbnQuc2Vzc2lvblRva2VuO1xuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIHN1YnNjcmlwdGlvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIGNsaWVudFNlc3Npb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgaWYgKCF0aGlzLl92YWxpZGF0ZUtleXMocmVxdWVzdCwgdGhpcy5rZXlQYWlycykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDQsICdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIGxvZ2dlci5lcnJvcignS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGhhc01hc3RlcktleSA9IHRoaXMuX2hhc01hc3RlcktleShyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKTtcbiAgICBjb25zdCBjbGllbnRJZCA9IHV1aWR2NCgpO1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoXG4gICAgICBjbGllbnRJZCxcbiAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgaGFzTWFzdGVyS2V5LFxuICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICByZXF1ZXN0Lmluc3RhbGxhdGlvbklkXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxID0ge1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxdWVzdC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH07XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcignQENvbm5lY3QnLCAnYmVmb3JlQ29ubmVjdCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxLnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcS51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZUNvbm5lY3QuQENvbm5lY3RgLCByZXEsIGF1dGgpO1xuICAgICAgfVxuICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICAgIHRoaXMuY2xpZW50cy5zZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIGNsaWVudCk7XG4gICAgICBsb2dnZXIuaW5mbyhgQ3JlYXRlIG5ldyBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjbGllbnQucHVzaENvbm5lY3QoKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMocmVxKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZUNvbm5lY3QgZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFzTWFzdGVyS2V5KHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwIHx8ICF2YWxpZEtleVBhaXJzLmhhcygnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0IHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVxdWVzdCwgJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiByZXF1ZXN0Lm1hc3RlcktleSA9PT0gdmFsaWRLZXlQYWlycy5nZXQoJ21hc3RlcktleScpO1xuICB9XG5cbiAgX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGxldCBpc1ZhbGlkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBba2V5LCBzZWNyZXRdIG9mIHZhbGlkS2V5UGFpcnMpIHtcbiAgICAgIGlmICghcmVxdWVzdFtrZXldIHx8IHJlcXVlc3Rba2V5XSAhPT0gc2VjcmV0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGlzVmFsaWQ7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHJlcXVlc3QucXVlcnkuY2xhc3NOYW1lO1xuICAgIGxldCBhdXRoQ2FsbGVkID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2JlZm9yZVN1YnNjcmliZScsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxdWVzdC5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBhdXRoQ2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICAgICAgICBwYXJzZVF1ZXJ5LndpdGhKU09OKHJlcXVlc3QucXVlcnkpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlU3Vic2NyaWJlLiR7Y2xhc3NOYW1lfWAsIHJlcXVlc3QsIGF1dGgpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gcmVxdWVzdC5xdWVyeS50b0pTT04oKTtcbiAgICAgICAgaWYgKHF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICBxdWVyeS5maWVsZHMgPSBxdWVyeS5rZXlzLnNwbGl0KCcsJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgICAgfVxuXG4gICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSB7XG4gICAgICAgIGlmICghYXV0aENhbGxlZCkge1xuICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KFxuICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWQsXG4gICAgICAgICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlblxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0LnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnF1ZXJ5LndoZXJlLnVzZXIgPSByZXF1ZXN0LnVzZXIudG9Qb2ludGVyKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEdldCBzdWJzY3JpcHRpb24gZnJvbSBzdWJzY3JpcHRpb25zLCBjcmVhdGUgb25lIGlmIG5lY2Vzc2FyeVxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSGFzaCA9IHF1ZXJ5SGFzaChyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgIC8vIEFkZCBjbGFzc05hbWUgdG8gc3Vic2NyaXB0aW9ucyBpZiBuZWNlc3NhcnlcblxuICAgICAgaWYgKCF0aGlzLnN1YnNjcmlwdGlvbnMuaGFzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChjbGFzc05hbWUsIG5ldyBNYXAoKSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgICBsZXQgc3Vic2NyaXB0aW9uO1xuICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5oYXMoc3Vic2NyaXB0aW9uSGFzaCkpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gY2xhc3NTdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IG5ldyBTdWJzY3JpcHRpb24oY2xhc3NOYW1lLCByZXF1ZXN0LnF1ZXJ5LndoZXJlLCBzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLnNldChzdWJzY3JpcHRpb25IYXNoLCBzdWJzY3JpcHRpb24pO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgc3Vic2NyaXB0aW9uSW5mbyB0byBjbGllbnRcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbjogc3Vic2NyaXB0aW9uLFxuICAgICAgfTtcbiAgICAgIC8vIEFkZCBzZWxlY3RlZCBmaWVsZHMsIHNlc3Npb25Ub2tlbiBhbmQgaW5zdGFsbGF0aW9uSWQgZm9yIHRoaXMgc3Vic2NyaXB0aW9uIGlmIG5lY2Vzc2FyeVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkuZmllbGRzKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uZmllbGRzID0gcmVxdWVzdC5xdWVyeS5maWVsZHM7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5zZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gPSByZXF1ZXN0LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGNsaWVudC5hZGRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3QucmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvKTtcblxuICAgICAgLy8gQWRkIGNsaWVudElkIHRvIHN1YnNjcmlwdGlvblxuICAgICAgc3Vic2NyaXB0aW9uLmFkZENsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBjbGllbnQucHVzaFN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICBgQ3JlYXRlIGNsaWVudCAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSBuZXcgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICAgICk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnc3Vic2NyaWJlJyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVTdWJzY3JpYmUgb24gJHtjbGFzc05hbWV9IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0LCBmYWxzZSk7XG4gICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgfVxuXG4gIF9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnksIG5vdGlmeUNsaWVudDogYm9vbGVhbiA9IHRydWUpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdElkID0gcmVxdWVzdC5yZXF1ZXN0SWQ7XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIGNsaWVudCB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50ICcgKyBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3Ugc3Vic2NyaWJlIHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBzdWJzY3JpcHRpb24gZnJvbSBjbGllbnRcbiAgICBjbGllbnQuZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIC8vIFJlbW92ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25cbiAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBzdWJzY3JpcHRpb24uY2xhc3NOYW1lO1xuICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3RJZCk7XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgIH1cbiAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoY2xhc3NOYW1lKTtcbiAgICB9XG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBjbGllbnQsXG4gICAgICBldmVudDogJ3Vuc3Vic2NyaWJlJyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICBzZXNzaW9uVG9rZW46IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIGlmICghbm90aWZ5Q2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2xpZW50LnB1c2hVbnN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgIGBEZWxldGUgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSB8IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBbUU7QUFFbkUsTUFBTUEsb0JBQW9CLENBQUM7RUFFekI7O0VBSUE7O0VBR0FDLFdBQVcsQ0FBQ0MsTUFBVyxFQUFFQyxNQUFXLEdBQUcsQ0FBQyxDQUFDLEVBQUVDLGlCQUFzQixHQUFHLENBQUMsQ0FBQyxFQUFFO0lBQ3RFLElBQUksQ0FBQ0YsTUFBTSxHQUFHQSxNQUFNO0lBQ3BCLElBQUksQ0FBQ0csT0FBTyxHQUFHLElBQUlDLEdBQUcsRUFBRTtJQUN4QixJQUFJLENBQUNDLGFBQWEsR0FBRyxJQUFJRCxHQUFHLEVBQUU7SUFDOUIsSUFBSSxDQUFDSCxNQUFNLEdBQUdBLE1BQU07SUFFcEJBLE1BQU0sQ0FBQ0ssS0FBSyxHQUFHTCxNQUFNLENBQUNLLEtBQUssSUFBSUMsYUFBSyxDQUFDQyxhQUFhO0lBQ2xEUCxNQUFNLENBQUNRLFNBQVMsR0FBR1IsTUFBTSxDQUFDUSxTQUFTLElBQUlGLGFBQUssQ0FBQ0UsU0FBUzs7SUFFdEQ7SUFDQSxNQUFNQyxRQUFRLEdBQUdULE1BQU0sQ0FBQ1MsUUFBUSxJQUFJLENBQUMsQ0FBQztJQUN0QyxJQUFJLENBQUNBLFFBQVEsR0FBRyxJQUFJTixHQUFHLEVBQUU7SUFDekIsS0FBSyxNQUFNTyxHQUFHLElBQUlDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDSCxRQUFRLENBQUMsRUFBRTtNQUN2QyxJQUFJLENBQUNBLFFBQVEsQ0FBQ0ksR0FBRyxDQUFDSCxHQUFHLEVBQUVELFFBQVEsQ0FBQ0MsR0FBRyxDQUFDLENBQUM7SUFDdkM7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
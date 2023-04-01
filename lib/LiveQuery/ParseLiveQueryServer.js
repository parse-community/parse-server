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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfbHJ1Q2FjaGUiLCJfVXNlcnNSb3V0ZXIiLCJfRGF0YWJhc2VDb250cm9sbGVyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwidHRsIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJzdWJzY3JpYmUiLCJvbiIsImNoYW5uZWwiLCJtZXNzYWdlU3RyIiwibWVzc2FnZSIsIkpTT04iLCJwYXJzZSIsImUiLCJlcnJvciIsIl9jbGVhckNhY2hlZFJvbGVzIiwidXNlcklkIiwiX2luZmxhdGVQYXJzZU9iamVjdCIsIl9vbkFmdGVyU2F2ZSIsIl9vbkFmdGVyRGVsZXRlIiwiY3VycmVudFBhcnNlT2JqZWN0IiwiVXNlclJvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJjbGFzc05hbWUiLCJwYXJzZU9iamVjdCIsIl9maW5pc2hGZXRjaCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJkZWxldGVkUGFyc2VPYmplY3QiLCJ0b0pTT04iLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpZCIsInNpemUiLCJjbGFzc1N1YnNjcmlwdGlvbnMiLCJnZXQiLCJkZWJ1ZyIsInN1YnNjcmlwdGlvbiIsInZhbHVlcyIsImlzU3Vic2NyaXB0aW9uTWF0Y2hlZCIsIl9tYXRjaGVzU3Vic2NyaXB0aW9uIiwiY2xpZW50SWQiLCJyZXF1ZXN0SWRzIiwiXyIsImVudHJpZXMiLCJjbGllbnRSZXF1ZXN0SWRzIiwiY2xpZW50IiwiZm9yRWFjaCIsInJlcXVlc3RJZCIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwiX21hdGNoZXNDTFAiLCJpc01hdGNoZWQiLCJfbWF0Y2hlc0FDTCIsImV2ZW50Iiwic2Vzc2lvblRva2VuIiwib2JqZWN0IiwidXNlTWFzdGVyS2V5IiwiaGFzTWFzdGVyS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJzZW5kRXZlbnQiLCJ0cmlnZ2VyIiwiZ2V0VHJpZ2dlciIsImF1dGgiLCJnZXRBdXRoRnJvbUNsaWVudCIsInVzZXIiLCJmcm9tSlNPTiIsInJ1blRyaWdnZXIiLCJ0b0pTT053aXRoT2JqZWN0cyIsIl9maWx0ZXJTZW5zaXRpdmVEYXRhIiwicHVzaERlbGV0ZSIsInJlc29sdmVFcnJvciIsIkNsaWVudCIsInB1c2hFcnJvciIsInBhcnNlV2ViU29ja2V0IiwiY29kZSIsInN0cmluZ2lmeSIsImlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkIiwiaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCIsIm9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiYWxsIiwiaGFzaCIsInR5cGUiLCJvcmlnaW5hbCIsImZ1bmN0aW9uTmFtZSIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic2xpY2UiLCJyZXF1ZXN0IiwidHY0IiwidmFsaWRhdGUiLCJSZXF1ZXN0U2NoZW1hIiwiX2hhbmRsZUNvbm5lY3QiLCJfaGFuZGxlU3Vic2NyaWJlIiwiX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbiIsIl9oYW5kbGVVbnN1YnNjcmliZSIsImluZm8iLCJoYXMiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZGVsZXRlIiwic3Vic2NyaXB0aW9uSW5mbyIsInN1YnNjcmlwdGlvbkluZm9zIiwiZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uIiwiaGFzU3Vic2NyaWJpbmdDbGllbnQiLCJtYXRjaGVzUXVlcnkiLCJ2YWxpZFRva2VucyIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJVc2VyIiwiY3JlYXRlV2l0aG91dERhdGEiLCJmaW5kIiwibWFwIiwidG9rZW4iLCJfYXV0aDEkYXV0aCIsIl9hdXRoMiRhdXRoIiwiYXV0aFByb21pc2UiLCJhdXRoMSIsImF1dGgyIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImNsZWFyUm9sZUNhY2hlIiwiZnJvbUNhY2hlIiwidGhlbiIsImNhdGNoIiwicmVzdWx0IiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiYWNsR3JvdXAiLCJwdXNoIiwiU2NoZW1hQ29udHJvbGxlciIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNsaWVudEF1dGgiLCJmaWx0ZXIiLCJwcm90ZWN0ZWRGaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJnZXREYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJfdmVyaWZ5QUNMIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzb21lIiwic3RhcnRzV2l0aCIsInJvbGVOYW1lcyIsImdldFVzZXJSb2xlcyIsInJvbGUiLCJnZXRTZXNzaW9uRnJvbUNsaWVudCIsImdldFB1YmxpY1JlYWRBY2Nlc3MiLCJzdWJzY3JpcHRpb25Ub2tlbiIsImNsaWVudFNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZUtleXMiLCJfaGFzTWFzdGVyS2V5IiwidXVpZHY0IiwicmVxIiwicHVzaENvbm5lY3QiLCJ2YWxpZEtleVBhaXJzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaXNWYWxpZCIsInNlY3JldCIsImF1dGhDYWxsZWQiLCJwYXJzZVF1ZXJ5Iiwid2l0aEpTT04iLCJmaWVsZHMiLCJzcGxpdCIsIndoZXJlIiwidG9Qb2ludGVyIiwibWFzdGVyIiwic3Vic2NyaXB0aW9uSGFzaCIsInF1ZXJ5SGFzaCIsIlN1YnNjcmlwdGlvbiIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHtcbiAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyxcbiAgZ2V0VHJpZ2dlcixcbiAgcnVuVHJpZ2dlcixcbiAgcmVzb2x2ZUVycm9yLFxuICB0b0pTT053aXRoT2JqZWN0cyxcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiwgQXV0aCB9IGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHsgZ2V0Q2FjaGVDb250cm9sbGVyLCBnZXREYXRhYmFzZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9LCBwYXJzZVNlcnZlckNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICB0aGlzLmNsaWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgY29uZmlnLmFwcElkID0gY29uZmlnLmFwcElkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uZmlnLm1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXkgfHwgUGFyc2UubWFzdGVyS2V5O1xuXG4gICAgLy8gU3RvcmUga2V5cywgY29udmVydCBvYmogdG8gbWFwXG4gICAgY29uc3Qga2V5UGFpcnMgPSBjb25maWcua2V5UGFpcnMgfHwge307XG4gICAgdGhpcy5rZXlQYWlycyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhrZXlQYWlycykpIHtcbiAgICAgIHRoaXMua2V5UGFpcnMuc2V0KGtleSwga2V5UGFpcnNba2V5XSk7XG4gICAgfVxuICAgIGxvZ2dlci52ZXJib3NlKCdTdXBwb3J0IGtleSBwYWlycycsIHRoaXMua2V5UGFpcnMpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBQYXJzZVxuICAgIFBhcnNlLk9iamVjdC5kaXNhYmxlU2luZ2xlSW5zdGFuY2UoKTtcbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBjb25maWcuc2VydmVyVVJMIHx8IFBhcnNlLnNlcnZlclVSTDtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShjb25maWcuYXBwSWQsIFBhcnNlLmphdmFTY3JpcHRLZXksIGNvbmZpZy5tYXN0ZXJLZXkpO1xuXG4gICAgLy8gVGhlIGNhY2hlIGNvbnRyb2xsZXIgaXMgYSBwcm9wZXIgY2FjaGUgY29udHJvbGxlclxuICAgIC8vIHdpdGggYWNjZXNzIHRvIFVzZXIgYW5kIFJvbGVzXG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIocGFyc2VTZXJ2ZXJDb25maWcpO1xuXG4gICAgY29uZmlnLmNhY2hlVGltZW91dCA9IGNvbmZpZy5jYWNoZVRpbWVvdXQgfHwgNSAqIDEwMDA7IC8vIDVzXG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgdHRsOiBjb25maWcuY2FjaGVUaW1lb3V0LFxuICAgIH0pO1xuICAgIC8vIEluaXRpYWxpemUgd2Vic29ja2V0IHNlcnZlclxuICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIgPSBuZXcgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIoXG4gICAgICBzZXJ2ZXIsXG4gICAgICBwYXJzZVdlYnNvY2tldCA9PiB0aGlzLl9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQpLFxuICAgICAgY29uZmlnXG4gICAgKTtcblxuICAgIC8vIEluaXRpYWxpemUgc3Vic2NyaWJlclxuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2NsZWFyQ2FjaGUnKTtcbiAgICAvLyBSZWdpc3RlciBtZXNzYWdlIGhhbmRsZXIgZm9yIHN1YnNjcmliZXIuIFdoZW4gcHVibGlzaGVyIGdldCBtZXNzYWdlcywgaXQgd2lsbCBwdWJsaXNoIG1lc3NhZ2VcbiAgICAvLyB0byB0aGUgc3Vic2NyaWJlcnMgYW5kIHRoZSBoYW5kbGVyIHdpbGwgYmUgY2FsbGVkLlxuICAgIHRoaXMuc3Vic2NyaWJlci5vbignbWVzc2FnZScsIChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiB7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnU3Vic2NyaWJlIG1lc3NhZ2UgJWonLCBtZXNzYWdlU3RyKTtcbiAgICAgIGxldCBtZXNzYWdlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgbWVzc2FnZSA9IEpTT04ucGFyc2UobWVzc2FnZVN0cik7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIG1lc3NhZ2UnLCBtZXNzYWdlU3RyLCBlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnY2xlYXJDYWNoZScpIHtcbiAgICAgICAgdGhpcy5fY2xlYXJDYWNoZWRSb2xlcyhtZXNzYWdlLnVzZXJJZCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlKTtcbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlclNhdmUobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJEZWxldGUobWVzc2FnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCBtZXNzYWdlICVzIGZyb20gdW5rbm93biBjaGFubmVsICVqJywgbWVzc2FnZSwgY2hhbm5lbCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oZGVsZXRlZFBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24pO1xuICAgICAgaWYgKCFpc1N1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgY29uc3QgYWNsID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgLy8gQ2hlY2sgQ0xQXG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2hlZCA9IGF3YWl0IHRoaXMuX21hdGNoZXNBQ0woYWNsLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBpZiAoIWlzTWF0Y2hlZCkge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6ICdkZWxldGUnLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogZGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5xdWVyeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNsaWVudC5wdXNoRGVsZXRlKHJlcXVlc3RJZCwgZGVsZXRlZFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJTYXZlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBudWxsO1xuICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGxldCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVzIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBjdXJyZW50UGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGNvbnN0IGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0SWRzLmZvckVhY2goYXN5bmMgcmVxdWVzdElkID0+IHtcbiAgICAgICAgICAvLyBTZXQgb3JpZ25hbCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGlmICghaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG9yaWdpbmFsQUNMO1xuICAgICAgICAgICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChvcmlnaW5hbEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBTZXQgY3VycmVudCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIGlmICghaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRBQ0wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKGN1cnJlbnRBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBbaXNPcmlnaW5hbE1hdGNoZWQsIGlzQ3VycmVudE1hdGNoZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgICAgICAgICdPcmlnaW5hbCAlaiB8IEN1cnJlbnQgJWogfCBNYXRjaDogJXMsICVzLCAlcywgJXMgfCBRdWVyeTogJXMnLFxuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc09yaWdpbmFsTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50TWF0Y2hlZCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmhhc2hcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvLyBEZWNpZGUgZXZlbnQgdHlwZVxuICAgICAgICAgICAgbGV0IHR5cGU7XG4gICAgICAgICAgICBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ3VwZGF0ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmICFpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAnbGVhdmUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnZW50ZXInO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnY3JlYXRlJztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiB0eXBlLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJlcy5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9iamVjdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCkge1xuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub3JpZ2luYWwpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYWZ0ZXJFdmVudC4ke2NsYXNzTmFtZX1gLCByZXMsIGF1dGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCAmJiB0eXBlb2YgcmVzLm9yaWdpbmFsLnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMoXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCBjdXJyZW50UGFyc2VPYmplY3QsIG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55KTogdm9pZCB7XG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ21lc3NhZ2UnLCByZXF1ZXN0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShyZXF1ZXN0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIHJlcXVlc3QnLCByZXF1ZXN0LCBlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdSZXF1ZXN0OiAlaicsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBhIHZhbGlkIHJlcXVlc3QsIHJldHVybiBlcnJvciBkaXJlY3RseSBpZiBub3RcbiAgICAgIGlmIChcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hWydnZW5lcmFsJ10pIHx8XG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVtyZXF1ZXN0Lm9wXSlcbiAgICAgICkge1xuICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAxLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ29ubmVjdCBtZXNzYWdlIGVycm9yICVzJywgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocmVxdWVzdC5vcCkge1xuICAgICAgICBjYXNlICdjb25uZWN0JzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Vuc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMywgJ0dldCB1bmtub3duIG9wZXJhdGlvbicpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignR2V0IHVua25vd24gb3BlcmF0aW9uJywgcmVxdWVzdC5vcCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBwYXJzZVdlYnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5pbmZvKGBDbGllbnQgZGlzY29ubmVjdDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNvbnN0IGNsaWVudElkID0gcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQ7XG4gICAgICBpZiAoIXRoaXMuY2xpZW50cy5oYXMoY2xpZW50SWQpKSB7XG4gICAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdF9lcnJvcicsXG4gICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgZXJyb3I6IGBVbmFibGUgdG8gZmluZCBjbGllbnQgJHtjbGllbnRJZH1gLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBDYW4gbm90IGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9IG9uIGRpc2Nvbm5lY3RgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWxldGUgY2xpZW50XG4gICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgIHRoaXMuY2xpZW50cy5kZWxldGUoY2xpZW50SWQpO1xuXG4gICAgICAvLyBEZWxldGUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgZm9yIChjb25zdCBbcmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvXSBvZiBfLmVudHJpZXMoY2xpZW50LnN1YnNjcmlwdGlvbkluZm9zKSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICAgICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihjbGllbnRJZCwgcmVxdWVzdElkKTtcblxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudHMgJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBzdWJzY3JpcHRpb25zICVkJywgdGhpcy5zdWJzY3JpcHRpb25zLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KHBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgYXN5bmMgX2NsZWFyQ2FjaGVkUm9sZXModXNlcklkOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFsaWRUb2tlbnMgPSBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmVxdWFsVG8oJ3VzZXInLCBQYXJzZS5Vc2VyLmNyZWF0ZVdpdGhvdXREYXRhKHVzZXJJZCkpXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIHZhbGlkVG9rZW5zLm1hcChhc3luYyB0b2tlbiA9PiB7XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvblRva2VuID0gdG9rZW4uZ2V0KCdzZXNzaW9uVG9rZW4nKTtcbiAgICAgICAgICBjb25zdCBhdXRoUHJvbWlzZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIGlmICghYXV0aFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgW2F1dGgxLCBhdXRoMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBhdXRoUHJvbWlzZSxcbiAgICAgICAgICAgIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oeyBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLCBzZXNzaW9uVG9rZW4gfSksXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgYXV0aDEuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBhdXRoMi5hdXRoPy5jbGVhclJvbGVDYWNoZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgQ291bGQgbm90IGNsZWFyIHJvbGUgY2FjaGUuICR7ZX1gKTtcbiAgICB9XG4gIH1cblxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbjogP3N0cmluZyk6IFByb21pc2U8eyBhdXRoOiA/QXV0aCwgdXNlcklkOiA/c3RyaW5nIH0+IHtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfVxuICAgIGNvbnN0IGZyb21DYWNoZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmIChmcm9tQ2FjaGUpIHtcbiAgICAgIHJldHVybiBmcm9tQ2FjaGU7XG4gICAgfVxuICAgIGNvbnN0IGF1dGhQcm9taXNlID0gZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLFxuICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgfSlcbiAgICAgIC50aGVuKGF1dGggPT4ge1xuICAgICAgICByZXR1cm4geyBhdXRoLCB1c2VySWQ6IGF1dGggJiYgYXV0aC51c2VyICYmIGF1dGgudXNlci5pZCB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlcnJvciB3aXRoIHRoZSBzZXNzaW9uIHRva2VuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksIHRoaXMuY29uZmlnLmNhY2hlVGltZW91dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsZXRlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6ID9hbnksXG4gICAgb2JqZWN0OiBhbnksXG4gICAgY2xpZW50OiBhbnksXG4gICAgcmVxdWVzdElkOiBudW1iZXIsXG4gICAgb3A6IHN0cmluZ1xuICApOiBhbnkge1xuICAgIC8vIHRyeSB0byBtYXRjaCBvbiB1c2VyIGZpcnN0LCBsZXNzIGV4cGVuc2l2ZSB0aGFuIHdpdGggcm9sZXNcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgeyB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbik7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIG9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBvcFxuICAgICAgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBGYWlsZWQgbWF0Y2hpbmcgQ0xQIGZvciAke29iamVjdC5pZH0gJHt1c2VySWR9ICR7ZX1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gVE9ETzogaGFuZGxlIHJvbGVzIHBlcm1pc3Npb25zXG4gICAgLy8gT2JqZWN0LmtleXMoY2xhc3NMZXZlbFBlcm1pc3Npb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgIGNvbnN0IHBlcm0gPSBjbGFzc0xldmVsUGVybWlzc2lvbnNba2V5XTtcbiAgICAvLyAgIE9iamVjdC5rZXlzKHBlcm0pLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgICBpZiAoa2V5LmluZGV4T2YoJ3JvbGUnKSlcbiAgICAvLyAgIH0pO1xuICAgIC8vIH0pXG4gICAgLy8gLy8gaXQncyByZWplY3RlZCBoZXJlLCBjaGVjayB0aGUgcm9sZXNcbiAgICAvLyB2YXIgcm9sZXNRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKTtcbiAgICAvLyByb2xlc1F1ZXJ5LmVxdWFsVG8oXCJ1c2Vyc1wiLCB1c2VyKTtcbiAgICAvLyByZXR1cm4gcm9sZXNRdWVyeS5maW5kKHt1c2VNYXN0ZXJLZXk6dHJ1ZX0pO1xuICB9XG5cbiAgYXN5bmMgX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIHJlczogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueVxuICApIHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCBjbGllbnRBdXRoO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkLCBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBjbGllbnRBdXRoID0gYXV0aDtcbiAgICB9XG4gICAgY29uc3QgZmlsdGVyID0gb2JqID0+IHtcbiAgICAgIGlmICghb2JqKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM/LnByb3RlY3RlZEZpZWxkcyB8fCBbXTtcbiAgICAgIGlmICghY2xpZW50Lmhhc01hc3RlcktleSAmJiAhQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGdldERhdGFiYXNlQ29udHJvbGxlcih0aGlzLmNvbmZpZykuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICByZXMub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICBjbGllbnRBdXRoXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gRGF0YWJhc2VDb250cm9sbGVyLmZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgIGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBjbGllbnRBdXRoLFxuICAgICAgICBvcCxcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICByZXMub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgcHJvdGVjdGVkRmllbGRzLFxuICAgICAgICBvYmosXG4gICAgICAgIHF1ZXJ5XG4gICAgICApO1xuICAgIH07XG4gICAgcmVzLm9iamVjdCA9IGZpbHRlcihyZXMub2JqZWN0KTtcbiAgICByZXMub3JpZ2luYWwgPSBmaWx0ZXIocmVzLm9yaWdpbmFsKTtcbiAgfVxuXG4gIF9nZXRDTFBPcGVyYXRpb24ocXVlcnk6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YgcXVlcnkgPT09ICdvYmplY3QnICYmXG4gICAgICBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09IDEgJiZcbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZydcbiAgICAgID8gJ2dldCdcbiAgICAgIDogJ2ZpbmQnO1xuICB9XG5cbiAgYXN5bmMgX3ZlcmlmeUFDTChhY2w6IGFueSwgdG9rZW46IHN0cmluZykge1xuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGF1dGgsIHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHRva2VuKTtcblxuICAgIC8vIEdldHRpbmcgdGhlIHNlc3Npb24gdG9rZW4gZmFpbGVkXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IG5vIGFkZGl0aW9uYWwgYXV0aCBpcyBhdmFpbGFibGVcbiAgICAvLyBBdCB0aGlzIHBvaW50LCBqdXN0IGJhaWwgb3V0IGFzIG5vIGFkZGl0aW9uYWwgdmlzaWJpbGl0eSBjYW4gYmUgaW5mZXJyZWQuXG4gICAgaWYgKCFhdXRoIHx8ICF1c2VySWQpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkID0gYWNsLmdldFJlYWRBY2Nlc3ModXNlcklkKTtcbiAgICBpZiAoaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGUgdXNlciBoYXMgYW55IHJvbGVzIHRoYXQgbWF0Y2ggdGhlIEFDTFxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBSZXNvbHZlIGZhbHNlIHJpZ2h0IGF3YXkgaWYgdGhlIGFjbCBkb2Vzbid0IGhhdmUgYW55IHJvbGVzXG4gICAgICAgIGNvbnN0IGFjbF9oYXNfcm9sZXMgPSBPYmplY3Qua2V5cyhhY2wucGVybWlzc2lvbnNCeUlkKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSk7XG4gICAgICAgIGlmICghYWNsX2hhc19yb2xlcykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCBhdXRoLmdldFVzZXJSb2xlcygpO1xuICAgICAgICAvLyBGaW5hbGx5LCBzZWUgaWYgYW55IG9mIHRoZSB1c2VyJ3Mgcm9sZXMgYWxsb3cgdGhlbSByZWFkIGFjY2Vzc1xuICAgICAgICBmb3IgKGNvbnN0IHJvbGUgb2Ygcm9sZU5hbWVzKSB7XG4gICAgICAgICAgLy8gV2UgdXNlIGdldFJlYWRBY2Nlc3MgYXMgYHJvbGVgIGlzIGluIHRoZSBmb3JtIGByb2xlOnJvbGVOYW1lYFxuICAgICAgICAgIGlmIChhY2wuZ2V0UmVhZEFjY2Vzcyhyb2xlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGdldEF1dGhGcm9tQ2xpZW50KGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlciwgc2Vzc2lvblRva2VuOiBzdHJpbmcpIHtcbiAgICBjb25zdCBnZXRTZXNzaW9uRnJvbUNsaWVudCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiB8fCBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgIH07XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHNlc3Npb25Ub2tlbiA9IGdldFNlc3Npb25Gcm9tQ2xpZW50KCk7XG4gICAgfVxuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbik7XG4gICAgcmV0dXJuIGF1dGg7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0FDTChhY2w6IGFueSwgY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgLy8gUmV0dXJuIHRydWUgZGlyZWN0bHkgaWYgQUNMIGlzbid0IHByZXNlbnQsIEFDTCBpcyBwdWJsaWMgcmVhZCwgb3IgY2xpZW50IGhhcyBtYXN0ZXIga2V5XG4gICAgaWYgKCFhY2wgfHwgYWNsLmdldFB1YmxpY1JlYWRBY2Nlc3MoKSB8fCBjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgc3Vic2NyaXB0aW9uIHNlc3Npb25Ub2tlbiBtYXRjaGVzIEFDTCBmaXJzdFxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25Ub2tlbiA9IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuO1xuICAgIGNvbnN0IGNsaWVudFNlc3Npb25Ub2tlbiA9IGNsaWVudC5zZXNzaW9uVG9rZW47XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgc3Vic2NyaXB0aW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgY2xpZW50U2Vzc2lvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICBpZiAoIXRoaXMuX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgNCwgJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgbG9nZ2VyLmVycm9yKCdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaGFzTWFzdGVyS2V5ID0gdGhpcy5faGFzTWFzdGVyS2V5KHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpO1xuICAgIGNvbnN0IGNsaWVudElkID0gdXVpZHY0KCk7XG4gICAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudChcbiAgICAgIGNsaWVudElkLFxuICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICBoYXNNYXN0ZXJLZXksXG4gICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgIHJlcXVlc3QuaW5zdGFsbGF0aW9uSWRcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXEgPSB7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiByZXF1ZXN0Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKCdAQ29ubmVjdCcsICdiZWZvcmVDb25uZWN0JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXEuc2Vzc2lvblRva2VuKTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlQ29ubmVjdC5AQ29ubmVjdGAsIHJlcSwgYXV0aCk7XG4gICAgICB9XG4gICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCA9IGNsaWVudElkO1xuICAgICAgdGhpcy5jbGllbnRzLnNldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgY2xpZW50KTtcbiAgICAgIGxvZ2dlci5pbmZvKGBDcmVhdGUgbmV3IGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNsaWVudC5wdXNoQ29ubmVjdCgpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhyZXEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlQ29ubmVjdCBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYXNNYXN0ZXJLZXkocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDAgfHwgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXJlcXVlc3QgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC5xdWVyeS5jbGFzc05hbWU7XG4gICAgbGV0IGF1dGhDYWxsZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYmVmb3JlU3Vic2NyaWJlJywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gICAgICAgIHBhcnNlUXVlcnkud2l0aEpTT04ocmVxdWVzdC5xdWVyeSk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVTdWJzY3JpYmUuJHtjbGFzc05hbWV9YCwgcmVxdWVzdCwgYXV0aCk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXF1ZXN0LnF1ZXJ5LnRvSlNPTigpO1xuICAgICAgICBpZiAocXVlcnkua2V5cykge1xuICAgICAgICAgIHF1ZXJ5LmZpZWxkcyA9IHF1ZXJ5LmtleXMuc3BsaXQoJywnKTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgaWYgKCFhdXRoQ2FsbGVkKSB7XG4gICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoXG4gICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZCxcbiAgICAgICAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3QudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUudXNlciA9IHJlcXVlc3QudXNlci50b1BvaW50ZXIoKTtcbiAgICAgICAgfSBlbHNlIGlmICghcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWRcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gR2V0IHN1YnNjcmlwdGlvbiBmcm9tIHN1YnNjcmlwdGlvbnMsIGNyZWF0ZSBvbmUgaWYgbmVjZXNzYXJ5XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25IYXNoID0gcXVlcnlIYXNoKHJlcXVlc3QucXVlcnkpO1xuICAgICAgLy8gQWRkIGNsYXNzTmFtZSB0byBzdWJzY3JpcHRpb25zIGlmIG5lY2Vzc2FyeVxuXG4gICAgICBpZiAoIXRoaXMuc3Vic2NyaXB0aW9ucy5oYXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzTmFtZSwgbmV3IE1hcCgpKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICAgIGxldCBzdWJzY3JpcHRpb247XG4gICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLmhhcyhzdWJzY3JpcHRpb25IYXNoKSkge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBjbGFzc1N1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gbmV3IFN1YnNjcmlwdGlvbihjbGFzc05hbWUsIHJlcXVlc3QucXVlcnkud2hlcmUsIHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuc2V0KHN1YnNjcmlwdGlvbkhhc2gsIHN1YnNjcmlwdGlvbik7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBzdWJzY3JpcHRpb25JbmZvIHRvIGNsaWVudFxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb24sXG4gICAgICB9O1xuICAgICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5maWVsZHMpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5maWVsZHMgPSByZXF1ZXN0LnF1ZXJ5LmZpZWxkcztcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnNlc3Npb25Ub2tlbikge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiA9IHJlcXVlc3Quc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgY2xpZW50LmFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdC5yZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuXG4gICAgICAvLyBBZGQgY2xpZW50SWQgdG8gc3Vic2NyaXB0aW9uXG4gICAgICBzdWJzY3JpcHRpb24uYWRkQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGNsaWVudC5wdXNoU3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgIGBDcmVhdGUgY2xpZW50ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IG5ldyBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXI6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdzdWJzY3JpYmUnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3QucmVxdWVzdElkKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZVN1YnNjcmliZSBvbiAke2NsYXNzTmFtZX0gZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSwgbm90aWZ5Q2xpZW50OiBib29sZWFuID0gdHJ1ZSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgY2xpZW50IHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQgJyArIHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBzdWJzY3JpYmUgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHN1YnNjcmlwdGlvbiBmcm9tIGNsaWVudFxuICAgIGNsaWVudC5kZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHN1YnNjcmlwdGlvbi5jbGFzc05hbWU7XG4gICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdElkKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgfVxuICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShjbGFzc05hbWUpO1xuICAgIH1cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAndW5zdWJzY3JpYmUnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgIHNlc3Npb25Ub2tlbjogc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEdBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLGFBQUEsR0FBQUYsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLHFCQUFBLEdBQUFKLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxjQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxXQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxZQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxpQkFBQSxHQUFBVixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVUsT0FBQSxHQUFBWCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVcsS0FBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksU0FB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
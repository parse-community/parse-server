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
var _lruCache = require("lru-cache");
var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));
var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));
var _util = require("util");
var _Deprecator = _interopRequireDefault(require("../Deprecator/Deprecator"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
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
    this.authCache = new _lruCache.LRUCache({
      max: 500,
      // 500 concurrent
      ttl: config.cacheTimeout
    });
    // Initialize websocket server
    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config);
    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    if (!this.subscriber.connect) {
      this.connect();
    }
  }
  async connect() {
    if (this.subscriber.isOpen) {
      return;
    }
    if (typeof this.subscriber.connect === 'function') {
      await Promise.resolve(this.subscriber.connect());
    } else {
      this.subscriber.isOpen = true;
    }
    this._createSubscribers();
  }
  async shutdown() {
    if (this.subscriber.isOpen) {
      var _this$subscriber$clos, _this$subscriber;
      await Promise.all([...[...this.clients.values()].map(client => client.parseWebSocket.ws.close()), this.parseWebSocketServer.close(), ...Array.from(this.subscriber.subscriptions.keys()).map(key => this.subscriber.unsubscribe(key)), (_this$subscriber$clos = (_this$subscriber = this.subscriber).close) === null || _this$subscriber$clos === void 0 ? void 0 : _this$subscriber$clos.call(_this$subscriber)]);
    }
    this.subscriber.isOpen = false;
  }
  _createSubscribers() {
    const messageRecieved = (channel, messageStr) => {
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
    };
    this.subscriber.on('message', (channel, messageStr) => messageRecieved(channel, messageStr));
    for (const field of ['afterSave', 'afterDelete', 'clearCache']) {
      const channel = `${_node.default.applicationId}${field}`;
      this.subscriber.subscribe(channel, messageStr => messageRecieved(channel, messageStr));
    }
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
            const watchFieldsChanged = this._checkWatchFields(client, requestId, message);
            if (!watchFieldsChanged && (type === 'update' || type === 'create')) {
              return;
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
    return (0, _QueryTools.matchesQuery)((0, _deepcopy.default)(parseObject), subscription.query);
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
      return _DatabaseController.default.filterSensitiveData(client.hasMasterKey, false, aclGroup, clientAuth, op, classLevelPermissions, res.object.className, protectedFields, obj, query);
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
  _checkWatchFields(client, requestId, message) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const watch = subscriptionInfo === null || subscriptionInfo === void 0 ? void 0 : subscriptionInfo.watch;
    if (!watch) {
      return true;
    }
    const object = message.currentParseObject;
    const original = message.originalParseObject;
    return watch.some(field => !(0, _util.isDeepStrictEqual)(object.get(field), original === null || original === void 0 ? void 0 : original.get(field)));
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
      if (request.query.keys) {
        subscriptionInfo.keys = Array.isArray(request.query.keys) ? request.query.keys : request.query.keys.split(',');
      }
      if (request.query.fields) {
        subscriptionInfo.keys = request.query.fields;
        _Deprecator.default.logRuntimeDeprecation({
          usage: `Subscribing using fields parameter`,
          solution: `Subscribe using "keys" instead.`
        });
      }
      if (request.query.watch) {
        subscriptionInfo.watch = request.query.watch;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfbHJ1Q2FjaGUiLCJfVXNlcnNSb3V0ZXIiLCJfRGF0YWJhc2VDb250cm9sbGVyIiwiX3V0aWwiLCJfRGVwcmVjYXRvciIsIl9kZWVwY29weSIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImdldENhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsInR0bCIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwiY29ubmVjdCIsImlzT3BlbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2NyZWF0ZVN1YnNjcmliZXJzIiwic2h1dGRvd24iLCJfdGhpcyRzdWJzY3JpYmVyJGNsb3MiLCJfdGhpcyRzdWJzY3JpYmVyIiwiYWxsIiwidmFsdWVzIiwibWFwIiwiY2xpZW50IiwicGFyc2VXZWJTb2NrZXQiLCJ3cyIsImNsb3NlIiwiQXJyYXkiLCJmcm9tIiwidW5zdWJzY3JpYmUiLCJjYWxsIiwibWVzc2FnZVJlY2lldmVkIiwiY2hhbm5lbCIsIm1lc3NhZ2VTdHIiLCJtZXNzYWdlIiwiSlNPTiIsInBhcnNlIiwiZSIsImVycm9yIiwiX2NsZWFyQ2FjaGVkUm9sZXMiLCJ1c2VySWQiLCJfaW5mbGF0ZVBhcnNlT2JqZWN0IiwiX29uQWZ0ZXJTYXZlIiwiX29uQWZ0ZXJEZWxldGUiLCJvbiIsImZpZWxkIiwic3Vic2NyaWJlIiwiY3VycmVudFBhcnNlT2JqZWN0IiwiVXNlclJvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJjbGFzc05hbWUiLCJwYXJzZU9iamVjdCIsIl9maW5pc2hGZXRjaCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJkZWxldGVkUGFyc2VPYmplY3QiLCJ0b0pTT04iLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpZCIsInNpemUiLCJjbGFzc1N1YnNjcmlwdGlvbnMiLCJnZXQiLCJkZWJ1ZyIsInN1YnNjcmlwdGlvbiIsImlzU3Vic2NyaXB0aW9uTWF0Y2hlZCIsIl9tYXRjaGVzU3Vic2NyaXB0aW9uIiwiY2xpZW50SWQiLCJyZXF1ZXN0SWRzIiwiXyIsImVudHJpZXMiLCJjbGllbnRSZXF1ZXN0SWRzIiwiZm9yRWFjaCIsInJlcXVlc3RJZCIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwiX21hdGNoZXNDTFAiLCJpc01hdGNoZWQiLCJfbWF0Y2hlc0FDTCIsImV2ZW50Iiwic2Vzc2lvblRva2VuIiwib2JqZWN0IiwidXNlTWFzdGVyS2V5IiwiaGFzTWFzdGVyS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJzZW5kRXZlbnQiLCJ0cmlnZ2VyIiwiZ2V0VHJpZ2dlciIsImF1dGgiLCJnZXRBdXRoRnJvbUNsaWVudCIsInVzZXIiLCJmcm9tSlNPTiIsInJ1blRyaWdnZXIiLCJ0b0pTT053aXRoT2JqZWN0cyIsIl9maWx0ZXJTZW5zaXRpdmVEYXRhIiwicHVzaERlbGV0ZSIsInJlc29sdmVFcnJvciIsIkNsaWVudCIsInB1c2hFcnJvciIsImNvZGUiLCJzdHJpbmdpZnkiLCJpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCIsImlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIm9yaWdpbmFsQUNMIiwiY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSIsImN1cnJlbnRBQ0wiLCJpc09yaWdpbmFsTWF0Y2hlZCIsImlzQ3VycmVudE1hdGNoZWQiLCJoYXNoIiwidHlwZSIsIndhdGNoRmllbGRzQ2hhbmdlZCIsIl9jaGVja1dhdGNoRmllbGRzIiwib3JpZ2luYWwiLCJmdW5jdGlvbk5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwicmVxdWVzdCIsInR2NCIsInZhbGlkYXRlIiwiUmVxdWVzdFNjaGVtYSIsIl9oYW5kbGVDb25uZWN0IiwiX2hhbmRsZVN1YnNjcmliZSIsIl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24iLCJfaGFuZGxlVW5zdWJzY3JpYmUiLCJpbmZvIiwiaGFzIiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImRlbGV0ZSIsInN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvcyIsImRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbiIsImhhc1N1YnNjcmliaW5nQ2xpZW50IiwibWF0Y2hlc1F1ZXJ5IiwiZGVlcGNvcHkiLCJ2YWxpZFRva2VucyIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJVc2VyIiwiY3JlYXRlV2l0aG91dERhdGEiLCJmaW5kIiwidG9rZW4iLCJfYXV0aDEkYXV0aCIsIl9hdXRoMiRhdXRoIiwiYXV0aFByb21pc2UiLCJhdXRoMSIsImF1dGgyIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImNsZWFyUm9sZUNhY2hlIiwiZnJvbUNhY2hlIiwidGhlbiIsImNhdGNoIiwicmVzdWx0IiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiYWNsR3JvdXAiLCJwdXNoIiwiU2NoZW1hQ29udHJvbGxlciIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNsaWVudEF1dGgiLCJmaWx0ZXIiLCJwcm90ZWN0ZWRGaWVsZHMiLCJpc0FycmF5IiwiZ2V0RGF0YWJhc2VDb250cm9sbGVyIiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImxlbmd0aCIsIm9iamVjdElkIiwiX3ZlcmlmeUFDTCIsImlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCIsImdldFJlYWRBY2Nlc3MiLCJhY2xfaGFzX3JvbGVzIiwicGVybWlzc2lvbnNCeUlkIiwic29tZSIsInN0YXJ0c1dpdGgiLCJyb2xlTmFtZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlIiwiZ2V0U2Vzc2lvbkZyb21DbGllbnQiLCJ3YXRjaCIsImlzRGVlcFN0cmljdEVxdWFsIiwiZ2V0UHVibGljUmVhZEFjY2VzcyIsInN1YnNjcmlwdGlvblRva2VuIiwiY2xpZW50U2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlS2V5cyIsIl9oYXNNYXN0ZXJLZXkiLCJ1dWlkdjQiLCJyZXEiLCJwdXNoQ29ubmVjdCIsInZhbGlkS2V5UGFpcnMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImlzVmFsaWQiLCJzZWNyZXQiLCJhdXRoQ2FsbGVkIiwicGFyc2VRdWVyeSIsIndpdGhKU09OIiwid2hlcmUiLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJzdWJzY3JpcHRpb25IYXNoIiwicXVlcnlIYXNoIiwiU3Vic2NyaXB0aW9uIiwic3BsaXQiLCJmaWVsZHMiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHtcbiAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyxcbiAgZ2V0VHJpZ2dlcixcbiAgcnVuVHJpZ2dlcixcbiAgcmVzb2x2ZUVycm9yLFxuICB0b0pTT053aXRoT2JqZWN0cyxcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiwgQXV0aCB9IGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHsgZ2V0Q2FjaGVDb250cm9sbGVyLCBnZXREYXRhYmFzZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgeyBMUlVDYWNoZSBhcyBMUlUgfSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IFVzZXJSb3V0ZXIgZnJvbSAnLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5cbmNsYXNzIFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIHtcbiAgY2xpZW50czogTWFwO1xuICAvLyBjbGFzc05hbWUgLT4gKHF1ZXJ5SGFzaCAtPiBzdWJzY3JpcHRpb24pXG4gIHN1YnNjcmlwdGlvbnM6IE9iamVjdDtcbiAgcGFyc2VXZWJTb2NrZXRTZXJ2ZXI6IE9iamVjdDtcbiAga2V5UGFpcnM6IGFueTtcbiAgLy8gVGhlIHN1YnNjcmliZXIgd2UgdXNlIHRvIGdldCBvYmplY3QgdXBkYXRlIGZyb20gcHVibGlzaGVyXG4gIHN1YnNjcmliZXI6IE9iamVjdDtcblxuICBjb25zdHJ1Y3RvcihzZXJ2ZXI6IGFueSwgY29uZmlnOiBhbnkgPSB7fSwgcGFyc2VTZXJ2ZXJDb25maWc6IGFueSA9IHt9KSB7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgdGhpcy5jbGllbnRzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIGNvbmZpZy5hcHBJZCA9IGNvbmZpZy5hcHBJZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgIGNvbmZpZy5tYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5IHx8IFBhcnNlLm1hc3RlcktleTtcblxuICAgIC8vIFN0b3JlIGtleXMsIGNvbnZlcnQgb2JqIHRvIG1hcFxuICAgIGNvbnN0IGtleVBhaXJzID0gY29uZmlnLmtleVBhaXJzIHx8IHt9O1xuICAgIHRoaXMua2V5UGFpcnMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoa2V5UGFpcnMpKSB7XG4gICAgICB0aGlzLmtleVBhaXJzLnNldChrZXksIGtleVBhaXJzW2tleV0pO1xuICAgIH1cbiAgICBsb2dnZXIudmVyYm9zZSgnU3VwcG9ydCBrZXkgcGFpcnMnLCB0aGlzLmtleVBhaXJzKTtcblxuICAgIC8vIEluaXRpYWxpemUgUGFyc2VcbiAgICBQYXJzZS5PYmplY3QuZGlzYWJsZVNpbmdsZUluc3RhbmNlKCk7XG4gICAgY29uc3Qgc2VydmVyVVJMID0gY29uZmlnLnNlcnZlclVSTCB8fCBQYXJzZS5zZXJ2ZXJVUkw7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuICAgIFBhcnNlLmluaXRpYWxpemUoY29uZmlnLmFwcElkLCBQYXJzZS5qYXZhU2NyaXB0S2V5LCBjb25maWcubWFzdGVyS2V5KTtcblxuICAgIC8vIFRoZSBjYWNoZSBjb250cm9sbGVyIGlzIGEgcHJvcGVyIGNhY2hlIGNvbnRyb2xsZXJcbiAgICAvLyB3aXRoIGFjY2VzcyB0byBVc2VyIGFuZCBSb2xlc1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gZ2V0Q2FjaGVDb250cm9sbGVyKHBhcnNlU2VydmVyQ29uZmlnKTtcblxuICAgIGNvbmZpZy5jYWNoZVRpbWVvdXQgPSBjb25maWcuY2FjaGVUaW1lb3V0IHx8IDUgKiAxMDAwOyAvLyA1c1xuXG4gICAgLy8gVGhpcyBhdXRoIGNhY2hlIHN0b3JlcyB0aGUgcHJvbWlzZXMgZm9yIGVhY2ggYXV0aCByZXNvbHV0aW9uLlxuICAgIC8vIFRoZSBtYWluIGJlbmVmaXQgaXMgdG8gYmUgYWJsZSB0byByZXVzZSB0aGUgc2FtZSB1c2VyIC8gc2Vzc2lvbiB0b2tlbiByZXNvbHV0aW9uLlxuICAgIHRoaXMuYXV0aENhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IDUwMCwgLy8gNTAwIGNvbmN1cnJlbnRcbiAgICAgIHR0bDogY29uZmlnLmNhY2hlVGltZW91dCxcbiAgICB9KTtcbiAgICAvLyBJbml0aWFsaXplIHdlYnNvY2tldCBzZXJ2ZXJcbiAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyID0gbmV3IFBhcnNlV2ViU29ja2V0U2VydmVyKFxuICAgICAgc2VydmVyLFxuICAgICAgcGFyc2VXZWJzb2NrZXQgPT4gdGhpcy5fb25Db25uZWN0KHBhcnNlV2Vic29ja2V0KSxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgdGhpcy5zdWJzY3JpYmVyID0gUGFyc2VQdWJTdWIuY3JlYXRlU3Vic2NyaWJlcihjb25maWcpO1xuICAgIGlmICghdGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QpIHtcbiAgICAgIHRoaXMuY29ubmVjdCgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuc3Vic2NyaWJlci5pc09wZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLnN1YnNjcmliZXIuY29ubmVjdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc3Vic2NyaWJlci5jb25uZWN0KCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnN1YnNjcmliZXIuaXNPcGVuID0gdHJ1ZTtcbiAgICB9XG4gICAgdGhpcy5fY3JlYXRlU3Vic2NyaWJlcnMoKTtcbiAgfVxuXG4gIGFzeW5jIHNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLnN1YnNjcmliZXIuaXNPcGVuKSB7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgIC4uLlsuLi50aGlzLmNsaWVudHMudmFsdWVzKCldLm1hcChjbGllbnQgPT4gY2xpZW50LnBhcnNlV2ViU29ja2V0LndzLmNsb3NlKCkpLFxuICAgICAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyLmNsb3NlKCksXG4gICAgICAgIC4uLkFycmF5LmZyb20odGhpcy5zdWJzY3JpYmVyLnN1YnNjcmlwdGlvbnMua2V5cygpKS5tYXAoa2V5ID0+XG4gICAgICAgICAgdGhpcy5zdWJzY3JpYmVyLnVuc3Vic2NyaWJlKGtleSlcbiAgICAgICAgKSxcbiAgICAgICAgdGhpcy5zdWJzY3JpYmVyLmNsb3NlPy4oKSxcbiAgICAgIF0pO1xuICAgIH1cbiAgICB0aGlzLnN1YnNjcmliZXIuaXNPcGVuID0gZmFsc2U7XG4gIH1cblxuICBfY3JlYXRlU3Vic2NyaWJlcnMoKSB7XG4gICAgY29uc3QgbWVzc2FnZVJlY2lldmVkID0gKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdTdWJzY3JpYmUgbWVzc2FnZSAlaicsIG1lc3NhZ2VTdHIpO1xuICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICB0cnkge1xuICAgICAgICBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlU3RyKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgbWVzc2FnZScsIG1lc3NhZ2VTdHIsIGUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdjbGVhckNhY2hlJykge1xuICAgICAgICB0aGlzLl9jbGVhckNhY2hlZFJvbGVzKG1lc3NhZ2UudXNlcklkKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhpcy5faW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2UpO1xuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyU2F2ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlckRlbGV0ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignR2V0IG1lc3NhZ2UgJXMgZnJvbSB1bmtub3duIGNoYW5uZWwgJWonLCBtZXNzYWdlLCBjaGFubmVsKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHRoaXMuc3Vic2NyaWJlci5vbignbWVzc2FnZScsIChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiBtZXNzYWdlUmVjaWV2ZWQoY2hhbm5lbCwgbWVzc2FnZVN0cikpO1xuICAgIGZvciAoY29uc3QgZmllbGQgb2YgWydhZnRlclNhdmUnLCAnYWZ0ZXJEZWxldGUnLCAnY2xlYXJDYWNoZSddKSB7XG4gICAgICBjb25zdCBjaGFubmVsID0gYCR7UGFyc2UuYXBwbGljYXRpb25JZH0ke2ZpZWxkfWA7XG4gICAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKGNoYW5uZWwsIG1lc3NhZ2VTdHIgPT4gbWVzc2FnZVJlY2lldmVkKGNoYW5uZWwsIG1lc3NhZ2VTdHIpKTtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oZGVsZXRlZFBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24pO1xuICAgICAgaWYgKCFpc1N1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgY29uc3QgYWNsID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgLy8gQ2hlY2sgQ0xQXG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2hlZCA9IGF3YWl0IHRoaXMuX21hdGNoZXNBQ0woYWNsLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBpZiAoIWlzTWF0Y2hlZCkge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6ICdkZWxldGUnLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogZGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5xdWVyeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNsaWVudC5wdXNoRGVsZXRlKHJlcXVlc3RJZCwgZGVsZXRlZFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJTYXZlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBudWxsO1xuICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGxldCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVzIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBjdXJyZW50UGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGNvbnN0IGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0SWRzLmZvckVhY2goYXN5bmMgcmVxdWVzdElkID0+IHtcbiAgICAgICAgICAvLyBTZXQgb3JpZ25hbCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGlmICghaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG9yaWdpbmFsQUNMO1xuICAgICAgICAgICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChvcmlnaW5hbEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBTZXQgY3VycmVudCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIGlmICghaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRBQ0wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKGN1cnJlbnRBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBbaXNPcmlnaW5hbE1hdGNoZWQsIGlzQ3VycmVudE1hdGNoZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgICAgICAgICdPcmlnaW5hbCAlaiB8IEN1cnJlbnQgJWogfCBNYXRjaDogJXMsICVzLCAlcywgJXMgfCBRdWVyeTogJXMnLFxuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc09yaWdpbmFsTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50TWF0Y2hlZCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmhhc2hcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvLyBEZWNpZGUgZXZlbnQgdHlwZVxuICAgICAgICAgICAgbGV0IHR5cGU7XG4gICAgICAgICAgICBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ3VwZGF0ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmICFpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAnbGVhdmUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnZW50ZXInO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnY3JlYXRlJztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3YXRjaEZpZWxkc0NoYW5nZWQgPSB0aGlzLl9jaGVja1dhdGNoRmllbGRzKGNsaWVudCwgcmVxdWVzdElkLCBtZXNzYWdlKTtcbiAgICAgICAgICAgIGlmICghd2F0Y2hGaWVsZHNDaGFuZ2VkICYmICh0eXBlID09PSAndXBkYXRlJyB8fCB0eXBlID09PSAnY3JlYXRlJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogdHlwZSxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwpIHtcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9yaWdpbmFsKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwgJiYgdHlwZW9mIHJlcy5vcmlnaW5hbC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCxcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5fZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICByZXMsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLnF1ZXJ5XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZnVuY3Rpb25OYW1lID0gJ3B1c2gnICsgcmVzLmV2ZW50LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcmVzLmV2ZW50LnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGNsaWVudFtmdW5jdGlvbk5hbWVdKSB7XG4gICAgICAgICAgICAgIGNsaWVudFtmdW5jdGlvbk5hbWVdKHJlcXVlc3RJZCwgY3VycmVudFBhcnNlT2JqZWN0LCBvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSk6IHZvaWQge1xuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdtZXNzYWdlJywgcmVxdWVzdCA9PiB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UocmVxdWVzdCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSByZXF1ZXN0JywgcmVxdWVzdCwgZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsb2dnZXIudmVyYm9zZSgnUmVxdWVzdDogJWonLCByZXF1ZXN0KTtcblxuICAgICAgLy8gQ2hlY2sgd2hldGhlciB0aGlzIHJlcXVlc3QgaXMgYSB2YWxpZCByZXF1ZXN0LCByZXR1cm4gZXJyb3IgZGlyZWN0bHkgaWYgbm90XG4gICAgICBpZiAoXG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVsnZ2VuZXJhbCddKSB8fFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbcmVxdWVzdC5vcF0pXG4gICAgICApIHtcbiAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMSwgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0Nvbm5lY3QgbWVzc2FnZSBlcnJvciAlcycsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHJlcXVlc3Qub3ApIHtcbiAgICAgICAgY2FzZSAnY29ubmVjdCc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXBkYXRlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1bnN1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDMsICdHZXQgdW5rbm93biBvcGVyYXRpb24nKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCB1bmtub3duIG9wZXJhdGlvbicsIHJlcXVlc3Qub3ApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbyhgQ2xpZW50IGRpc2Nvbm5lY3Q6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjb25zdCBjbGllbnRJZCA9IHBhcnNlV2Vic29ja2V0LmNsaWVudElkO1xuICAgICAgaWYgKCF0aGlzLmNsaWVudHMuaGFzKGNsaWVudElkKSkge1xuICAgICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3RfZXJyb3InLFxuICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgIGVycm9yOiBgVW5hYmxlIHRvIGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgQ2FuIG5vdCBmaW5kIGNsaWVudCAke2NsaWVudElkfSBvbiBkaXNjb25uZWN0YCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gRGVsZXRlIGNsaWVudFxuICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICB0aGlzLmNsaWVudHMuZGVsZXRlKGNsaWVudElkKTtcblxuICAgICAgLy8gRGVsZXRlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgIGZvciAoY29uc3QgW3JlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mb10gb2YgXy5lbnRyaWVzKGNsaWVudC5zdWJzY3JpcHRpb25JbmZvcykpIHtcbiAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24oY2xpZW50SWQsIHJlcXVlc3RJZCk7XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnRzICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgc3Vic2NyaXB0aW9ucyAlZCcsIHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGV2ZW50OiAnd3NfY29ubmVjdCcsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgIH0pO1xuICB9XG5cbiAgX21hdGNoZXNTdWJzY3JpcHRpb24ocGFyc2VPYmplY3Q6IGFueSwgc3Vic2NyaXB0aW9uOiBhbnkpOiBib29sZWFuIHtcbiAgICAvLyBPYmplY3QgaXMgdW5kZWZpbmVkIG9yIG51bGwsIG5vdCBtYXRjaFxuICAgIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoZXNRdWVyeShkZWVwY29weShwYXJzZU9iamVjdCksIHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gIH1cblxuICBhc3luYyBfY2xlYXJDYWNoZWRSb2xlcyh1c2VySWQ6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YWxpZFRva2VucyA9IGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAuZXF1YWxUbygndXNlcicsIFBhcnNlLlVzZXIuY3JlYXRlV2l0aG91dERhdGEodXNlcklkKSlcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgdmFsaWRUb2tlbnMubWFwKGFzeW5jIHRva2VuID0+IHtcbiAgICAgICAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSB0b2tlbi5nZXQoJ3Nlc3Npb25Ub2tlbicpO1xuICAgICAgICAgIGNvbnN0IGF1dGhQcm9taXNlID0gdGhpcy5hdXRoQ2FjaGUuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgaWYgKCFhdXRoUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBbYXV0aDEsIGF1dGgyXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGF1dGhQcm9taXNlLFxuICAgICAgICAgICAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7IGNhY2hlQ29udHJvbGxlcjogdGhpcy5jYWNoZUNvbnRyb2xsZXIsIHNlc3Npb25Ub2tlbiB9KSxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBhdXRoMS5hdXRoPy5jbGVhclJvbGVDYWNoZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIGF1dGgyLmF1dGg/LmNsZWFyUm9sZUNhY2hlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsZXRlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBDb3VsZCBub3QgY2xlYXIgcm9sZSBjYWNoZS4gJHtlfWApO1xuICAgIH1cbiAgfVxuXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuOiA/c3RyaW5nKTogUHJvbWlzZTx7IGF1dGg6ID9BdXRoLCB1c2VySWQ6ID9zdHJpbmcgfT4ge1xuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICB9XG4gICAgY29uc3QgZnJvbUNhY2hlID0gdGhpcy5hdXRoQ2FjaGUuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKGZyb21DYWNoZSkge1xuICAgICAgcmV0dXJuIGZyb21DYWNoZTtcbiAgICB9XG4gICAgY29uc3QgYXV0aFByb21pc2UgPSBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgIGNhY2hlQ29udHJvbGxlcjogdGhpcy5jYWNoZUNvbnRyb2xsZXIsXG4gICAgICBzZXNzaW9uVG9rZW46IHNlc3Npb25Ub2tlbixcbiAgICB9KVxuICAgICAgLnRoZW4oYXV0aCA9PiB7XG4gICAgICAgIHJldHVybiB7IGF1dGgsIHVzZXJJZDogYXV0aCAmJiBhdXRoLnVzZXIgJiYgYXV0aC51c2VyLmlkIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gVGhlcmUgd2FzIGFuIGVycm9yIHdpdGggdGhlIHNlc3Npb24gdG9rZW5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0ge307XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4pIHtcbiAgICAgICAgICByZXN1bHQuZXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBQcm9taXNlLnJlc29sdmUocmVzdWx0KSwgdGhpcy5jb25maWcuY2FjaGVUaW1lb3V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5kZWxldGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfSk7XG4gICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgYXV0aFByb21pc2UpO1xuICAgIHJldHVybiBhdXRoUHJvbWlzZTtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQ0xQKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogP2FueSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBjbGllbnQ6IGFueSxcbiAgICByZXF1ZXN0SWQ6IG51bWJlcixcbiAgICBvcDogc3RyaW5nXG4gICk6IGFueSB7XG4gICAgLy8gdHJ5IHRvIG1hdGNoIG9uIHVzZXIgZmlyc3QsIGxlc3MgZXhwZW5zaXZlIHRoYW4gd2l0aCByb2xlc1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gWycqJ107XG4gICAgbGV0IHVzZXJJZDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgIH1cbiAgICB0cnkge1xuICAgICAgYXdhaXQgU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIG9wXG4gICAgICApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoYEZhaWxlZCBtYXRjaGluZyBDTFAgZm9yICR7b2JqZWN0LmlkfSAke3VzZXJJZH0gJHtlfWApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBUT0RPOiBoYW5kbGUgcm9sZXMgcGVybWlzc2lvbnNcbiAgICAvLyBPYmplY3Qua2V5cyhjbGFzc0xldmVsUGVybWlzc2lvbnMpLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgY29uc3QgcGVybSA9IGNsYXNzTGV2ZWxQZXJtaXNzaW9uc1trZXldO1xuICAgIC8vICAgT2JqZWN0LmtleXMocGVybSkuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICAgIGlmIChrZXkuaW5kZXhPZigncm9sZScpKVxuICAgIC8vICAgfSk7XG4gICAgLy8gfSlcbiAgICAvLyAvLyBpdCdzIHJlamVjdGVkIGhlcmUsIGNoZWNrIHRoZSByb2xlc1xuICAgIC8vIHZhciByb2xlc1F1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpO1xuICAgIC8vIHJvbGVzUXVlcnkuZXF1YWxUbyhcInVzZXJzXCIsIHVzZXIpO1xuICAgIC8vIHJldHVybiByb2xlc1F1ZXJ5LmZpbmQoe3VzZU1hc3RlcktleTp0cnVlfSk7XG4gIH1cblxuICBhc3luYyBfZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6ID9hbnksXG4gICAgcmVzOiBhbnksXG4gICAgY2xpZW50OiBhbnksXG4gICAgcmVxdWVzdElkOiBudW1iZXIsXG4gICAgb3A6IHN0cmluZyxcbiAgICBxdWVyeTogYW55XG4gICkge1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gWycqJ107XG4gICAgbGV0IGNsaWVudEF1dGg7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgeyB1c2VySWQsIGF1dGggfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbik7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICAgIGNsaWVudEF1dGggPSBhdXRoO1xuICAgIH1cbiAgICBjb25zdCBmaWx0ZXIgPSBvYmogPT4ge1xuICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcyA9IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucz8ucHJvdGVjdGVkRmllbGRzIHx8IFtdO1xuICAgICAgaWYgKCFjbGllbnQuaGFzTWFzdGVyS2V5ICYmICFBcnJheS5pc0FycmF5KHByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZ2V0RGF0YWJhc2VDb250cm9sbGVyKHRoaXMuY29uZmlnKS5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIHJlcy5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgIGNsaWVudEF1dGhcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBEYXRhYmFzZUNvbnRyb2xsZXIuZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgZmFsc2UsXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBjbGllbnRBdXRoLFxuICAgICAgICBvcCxcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICByZXMub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgcHJvdGVjdGVkRmllbGRzLFxuICAgICAgICBvYmosXG4gICAgICAgIHF1ZXJ5XG4gICAgICApO1xuICAgIH07XG4gICAgcmVzLm9iamVjdCA9IGZpbHRlcihyZXMub2JqZWN0KTtcbiAgICByZXMub3JpZ2luYWwgPSBmaWx0ZXIocmVzLm9yaWdpbmFsKTtcbiAgfVxuXG4gIF9nZXRDTFBPcGVyYXRpb24ocXVlcnk6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YgcXVlcnkgPT09ICdvYmplY3QnICYmXG4gICAgICBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09IDEgJiZcbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZydcbiAgICAgID8gJ2dldCdcbiAgICAgIDogJ2ZpbmQnO1xuICB9XG5cbiAgYXN5bmMgX3ZlcmlmeUFDTChhY2w6IGFueSwgdG9rZW46IHN0cmluZykge1xuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGF1dGgsIHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHRva2VuKTtcblxuICAgIC8vIEdldHRpbmcgdGhlIHNlc3Npb24gdG9rZW4gZmFpbGVkXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IG5vIGFkZGl0aW9uYWwgYXV0aCBpcyBhdmFpbGFibGVcbiAgICAvLyBBdCB0aGlzIHBvaW50LCBqdXN0IGJhaWwgb3V0IGFzIG5vIGFkZGl0aW9uYWwgdmlzaWJpbGl0eSBjYW4gYmUgaW5mZXJyZWQuXG4gICAgaWYgKCFhdXRoIHx8ICF1c2VySWQpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkID0gYWNsLmdldFJlYWRBY2Nlc3ModXNlcklkKTtcbiAgICBpZiAoaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGUgdXNlciBoYXMgYW55IHJvbGVzIHRoYXQgbWF0Y2ggdGhlIEFDTFxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBSZXNvbHZlIGZhbHNlIHJpZ2h0IGF3YXkgaWYgdGhlIGFjbCBkb2Vzbid0IGhhdmUgYW55IHJvbGVzXG4gICAgICAgIGNvbnN0IGFjbF9oYXNfcm9sZXMgPSBPYmplY3Qua2V5cyhhY2wucGVybWlzc2lvbnNCeUlkKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSk7XG4gICAgICAgIGlmICghYWNsX2hhc19yb2xlcykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCBhdXRoLmdldFVzZXJSb2xlcygpO1xuICAgICAgICAvLyBGaW5hbGx5LCBzZWUgaWYgYW55IG9mIHRoZSB1c2VyJ3Mgcm9sZXMgYWxsb3cgdGhlbSByZWFkIGFjY2Vzc1xuICAgICAgICBmb3IgKGNvbnN0IHJvbGUgb2Ygcm9sZU5hbWVzKSB7XG4gICAgICAgICAgLy8gV2UgdXNlIGdldFJlYWRBY2Nlc3MgYXMgYHJvbGVgIGlzIGluIHRoZSBmb3JtIGByb2xlOnJvbGVOYW1lYFxuICAgICAgICAgIGlmIChhY2wuZ2V0UmVhZEFjY2Vzcyhyb2xlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGdldEF1dGhGcm9tQ2xpZW50KGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlciwgc2Vzc2lvblRva2VuOiBzdHJpbmcpIHtcbiAgICBjb25zdCBnZXRTZXNzaW9uRnJvbUNsaWVudCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiB8fCBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgIH07XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHNlc3Npb25Ub2tlbiA9IGdldFNlc3Npb25Gcm9tQ2xpZW50KCk7XG4gICAgfVxuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbik7XG4gICAgcmV0dXJuIGF1dGg7XG4gIH1cblxuICBfY2hlY2tXYXRjaEZpZWxkcyhjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBhbnksIG1lc3NhZ2U6IGFueSkge1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGNvbnN0IHdhdGNoID0gc3Vic2NyaXB0aW9uSW5mbz8ud2F0Y2g7XG4gICAgaWYgKCF3YXRjaCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IG9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIGNvbnN0IG9yaWdpbmFsID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0O1xuICAgIHJldHVybiB3YXRjaC5zb21lKGZpZWxkID0+ICFpc0RlZXBTdHJpY3RFcXVhbChvYmplY3QuZ2V0KGZpZWxkKSwgb3JpZ2luYWw/LmdldChmaWVsZCkpKTtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQUNMKGFjbDogYW55LCBjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyBSZXR1cm4gdHJ1ZSBkaXJlY3RseSBpZiBBQ0wgaXNuJ3QgcHJlc2VudCwgQUNMIGlzIHB1YmxpYyByZWFkLCBvciBjbGllbnQgaGFzIG1hc3RlciBrZXlcbiAgICBpZiAoIWFjbCB8fCBhY2wuZ2V0UHVibGljUmVhZEFjY2VzcygpIHx8IGNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBzdWJzY3JpcHRpb24gc2Vzc2lvblRva2VuIG1hdGNoZXMgQUNMIGZpcnN0XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvblRva2VuID0gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW47XG4gICAgY29uc3QgY2xpZW50U2Vzc2lvblRva2VuID0gY2xpZW50LnNlc3Npb25Ub2tlbjtcblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBzdWJzY3JpcHRpb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBjbGllbnRTZXNzaW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIGlmICghdGhpcy5fdmFsaWRhdGVLZXlzKHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCA0LCAnS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBoYXNNYXN0ZXJLZXkgPSB0aGlzLl9oYXNNYXN0ZXJLZXkocmVxdWVzdCwgdGhpcy5rZXlQYWlycyk7XG4gICAgY29uc3QgY2xpZW50SWQgPSB1dWlkdjQoKTtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KFxuICAgICAgY2xpZW50SWQsXG4gICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgIGhhc01hc3RlcktleSxcbiAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgcmVxdWVzdC5pbnN0YWxsYXRpb25JZFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcSA9IHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcXVlc3QuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9O1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoJ0BDb25uZWN0JywgJ2JlZm9yZUNvbm5lY3QnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcS5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXEudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVDb25uZWN0LkBDb25uZWN0YCwgcmVxLCBhdXRoKTtcbiAgICAgIH1cbiAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkID0gY2xpZW50SWQ7XG4gICAgICB0aGlzLmNsaWVudHMuc2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCBjbGllbnQpO1xuICAgICAgbG9nZ2VyLmluZm8oYENyZWF0ZSBuZXcgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY2xpZW50LnB1c2hDb25uZWN0KCk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHJlcSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVDb25uZWN0IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhc01hc3RlcktleShyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCB8fCAhdmFsaWRLZXlQYWlycy5oYXMoJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICghcmVxdWVzdCB8fCAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlcXVlc3QsICdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gcmVxdWVzdC5tYXN0ZXJLZXkgPT09IHZhbGlkS2V5UGFpcnMuZ2V0KCdtYXN0ZXJLZXknKTtcbiAgfVxuXG4gIF92YWxpZGF0ZUtleXMocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBsZXQgaXNWYWxpZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgW2tleSwgc2VjcmV0XSBvZiB2YWxpZEtleVBhaXJzKSB7XG4gICAgICBpZiAoIXJlcXVlc3Rba2V5XSB8fCByZXF1ZXN0W2tleV0gIT09IHNlY3JldCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBpc1ZhbGlkO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSByZXF1ZXN0LnF1ZXJ5LmNsYXNzTmFtZTtcbiAgICBsZXQgYXV0aENhbGxlZCA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdiZWZvcmVTdWJzY3JpYmUnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcXVlc3Quc2Vzc2lvblRva2VuKTtcbiAgICAgICAgYXV0aENhbGxlZCA9IHRydWU7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgICAgICAgcGFyc2VRdWVyeS53aXRoSlNPTihyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZVN1YnNjcmliZS4ke2NsYXNzTmFtZX1gLCByZXF1ZXN0LCBhdXRoKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHJlcXVlc3QucXVlcnkudG9KU09OKCk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICAgIH1cblxuICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykge1xuICAgICAgICBpZiAoIWF1dGhDYWxsZWQpIHtcbiAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChcbiAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkLFxuICAgICAgICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW5cbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC5xdWVyeS53aGVyZS51c2VyID0gcmVxdWVzdC51c2VyLnRvUG9pbnRlcigpO1xuICAgICAgICB9IGVsc2UgaWYgKCFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgICAgICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBHZXQgc3Vic2NyaXB0aW9uIGZyb20gc3Vic2NyaXB0aW9ucywgY3JlYXRlIG9uZSBpZiBuZWNlc3NhcnlcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkhhc2ggPSBxdWVyeUhhc2gocmVxdWVzdC5xdWVyeSk7XG4gICAgICAvLyBBZGQgY2xhc3NOYW1lIHRvIHN1YnNjcmlwdGlvbnMgaWYgbmVjZXNzYXJ5XG5cbiAgICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25zLmhhcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NOYW1lLCBuZXcgTWFwKCkpO1xuICAgICAgfVxuICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgICAgbGV0IHN1YnNjcmlwdGlvbjtcbiAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuaGFzKHN1YnNjcmlwdGlvbkhhc2gpKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IGNsYXNzU3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBuZXcgU3Vic2NyaXB0aW9uKGNsYXNzTmFtZSwgcmVxdWVzdC5xdWVyeS53aGVyZSwgc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5zZXQoc3Vic2NyaXB0aW9uSGFzaCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIHN1YnNjcmlwdGlvbkluZm8gdG8gY2xpZW50XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0ge1xuICAgICAgICBzdWJzY3JpcHRpb246IHN1YnNjcmlwdGlvbixcbiAgICAgIH07XG4gICAgICAvLyBBZGQgc2VsZWN0ZWQgZmllbGRzLCBzZXNzaW9uVG9rZW4gYW5kIGluc3RhbGxhdGlvbklkIGZvciB0aGlzIHN1YnNjcmlwdGlvbiBpZiBuZWNlc3NhcnlcbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LmtleXMpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5rZXlzID0gQXJyYXkuaXNBcnJheShyZXF1ZXN0LnF1ZXJ5LmtleXMpXG4gICAgICAgICAgPyByZXF1ZXN0LnF1ZXJ5LmtleXNcbiAgICAgICAgICA6IHJlcXVlc3QucXVlcnkua2V5cy5zcGxpdCgnLCcpO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkuZmllbGRzKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ua2V5cyA9IHJlcXVlc3QucXVlcnkuZmllbGRzO1xuICAgICAgICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgICAgICAgdXNhZ2U6IGBTdWJzY3JpYmluZyB1c2luZyBmaWVsZHMgcGFyYW1ldGVyYCxcbiAgICAgICAgICBzb2x1dGlvbjogYFN1YnNjcmliZSB1c2luZyBcImtleXNcIiBpbnN0ZWFkLmAsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkud2F0Y2gpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby53YXRjaCA9IHJlcXVlc3QucXVlcnkud2F0Y2g7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5zZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gPSByZXF1ZXN0LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGNsaWVudC5hZGRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3QucmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvKTtcblxuICAgICAgLy8gQWRkIGNsaWVudElkIHRvIHN1YnNjcmlwdGlvblxuICAgICAgc3Vic2NyaXB0aW9uLmFkZENsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBjbGllbnQucHVzaFN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICBgQ3JlYXRlIGNsaWVudCAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSBuZXcgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICAgICk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnc3Vic2NyaWJlJyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVTdWJzY3JpYmUgb24gJHtjbGFzc05hbWV9IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0LCBmYWxzZSk7XG4gICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgfVxuXG4gIF9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnksIG5vdGlmeUNsaWVudDogYm9vbGVhbiA9IHRydWUpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdElkID0gcmVxdWVzdC5yZXF1ZXN0SWQ7XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIGNsaWVudCB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50ICcgKyBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3Ugc3Vic2NyaWJlIHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBzdWJzY3JpcHRpb24gZnJvbSBjbGllbnRcbiAgICBjbGllbnQuZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIC8vIFJlbW92ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25cbiAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBzdWJzY3JpcHRpb24uY2xhc3NOYW1lO1xuICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3RJZCk7XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgIH1cbiAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoY2xhc3NOYW1lKTtcbiAgICB9XG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBjbGllbnQsXG4gICAgICBldmVudDogJ3Vuc3Vic2NyaWJlJyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICBzZXNzaW9uVG9rZW46IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIGlmICghbm90aWZ5Q2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2xpZW50LnB1c2hVbnN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgIGBEZWxldGUgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSB8IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgeyBQ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
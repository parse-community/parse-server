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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwidHRsIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJjb25uZWN0IiwiaXNPcGVuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfY3JlYXRlU3Vic2NyaWJlcnMiLCJzaHV0ZG93biIsImFsbCIsInZhbHVlcyIsIm1hcCIsImNsaWVudCIsInBhcnNlV2ViU29ja2V0Iiwid3MiLCJjbG9zZSIsIkFycmF5IiwiZnJvbSIsInVuc3Vic2NyaWJlIiwibWVzc2FnZVJlY2lldmVkIiwiY2hhbm5lbCIsIm1lc3NhZ2VTdHIiLCJtZXNzYWdlIiwiSlNPTiIsInBhcnNlIiwiZSIsImVycm9yIiwiX2NsZWFyQ2FjaGVkUm9sZXMiLCJ1c2VySWQiLCJfaW5mbGF0ZVBhcnNlT2JqZWN0IiwiX29uQWZ0ZXJTYXZlIiwiX29uQWZ0ZXJEZWxldGUiLCJvbiIsImZpZWxkIiwic3Vic2NyaWJlIiwiY3VycmVudFBhcnNlT2JqZWN0IiwiVXNlclJvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJjbGFzc05hbWUiLCJwYXJzZU9iamVjdCIsIl9maW5pc2hGZXRjaCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJkZWxldGVkUGFyc2VPYmplY3QiLCJ0b0pTT04iLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpZCIsInNpemUiLCJjbGFzc1N1YnNjcmlwdGlvbnMiLCJnZXQiLCJkZWJ1ZyIsInN1YnNjcmlwdGlvbiIsImlzU3Vic2NyaXB0aW9uTWF0Y2hlZCIsIl9tYXRjaGVzU3Vic2NyaXB0aW9uIiwiY2xpZW50SWQiLCJyZXF1ZXN0SWRzIiwiXyIsImVudHJpZXMiLCJjbGllbnRSZXF1ZXN0SWRzIiwiZm9yRWFjaCIsInJlcXVlc3RJZCIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwiX21hdGNoZXNDTFAiLCJpc01hdGNoZWQiLCJfbWF0Y2hlc0FDTCIsImV2ZW50Iiwic2Vzc2lvblRva2VuIiwib2JqZWN0IiwidXNlTWFzdGVyS2V5IiwiaGFzTWFzdGVyS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJzZW5kRXZlbnQiLCJ0cmlnZ2VyIiwiZ2V0VHJpZ2dlciIsImF1dGgiLCJnZXRBdXRoRnJvbUNsaWVudCIsInVzZXIiLCJmcm9tSlNPTiIsInJ1blRyaWdnZXIiLCJ0b0pTT053aXRoT2JqZWN0cyIsIl9maWx0ZXJTZW5zaXRpdmVEYXRhIiwicHVzaERlbGV0ZSIsInJlc29sdmVFcnJvciIsIkNsaWVudCIsInB1c2hFcnJvciIsImNvZGUiLCJzdHJpbmdpZnkiLCJpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCIsImlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIm9yaWdpbmFsQUNMIiwiY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSIsImN1cnJlbnRBQ0wiLCJpc09yaWdpbmFsTWF0Y2hlZCIsImlzQ3VycmVudE1hdGNoZWQiLCJoYXNoIiwidHlwZSIsIndhdGNoRmllbGRzQ2hhbmdlZCIsIl9jaGVja1dhdGNoRmllbGRzIiwib3JpZ2luYWwiLCJmdW5jdGlvbk5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwicmVxdWVzdCIsInR2NCIsInZhbGlkYXRlIiwiUmVxdWVzdFNjaGVtYSIsIl9oYW5kbGVDb25uZWN0IiwiX2hhbmRsZVN1YnNjcmliZSIsIl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24iLCJfaGFuZGxlVW5zdWJzY3JpYmUiLCJpbmZvIiwiaGFzIiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImRlbGV0ZSIsInN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvcyIsImRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbiIsImhhc1N1YnNjcmliaW5nQ2xpZW50IiwibWF0Y2hlc1F1ZXJ5IiwiZGVlcGNvcHkiLCJ2YWxpZFRva2VucyIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJVc2VyIiwiY3JlYXRlV2l0aG91dERhdGEiLCJmaW5kIiwidG9rZW4iLCJhdXRoUHJvbWlzZSIsImF1dGgxIiwiYXV0aDIiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiY2xlYXJSb2xlQ2FjaGUiLCJmcm9tQ2FjaGUiLCJ0aGVuIiwiY2F0Y2giLCJyZXN1bHQiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsImdldFN1YnNjcmlwdGlvbkluZm8iLCJhY2xHcm91cCIsInB1c2giLCJTY2hlbWFDb250cm9sbGVyIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY2xpZW50QXV0aCIsImZpbHRlciIsIm9iaiIsInByb3RlY3RlZEZpZWxkcyIsImlzQXJyYXkiLCJnZXREYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJfdmVyaWZ5QUNMIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzb21lIiwic3RhcnRzV2l0aCIsInJvbGVOYW1lcyIsImdldFVzZXJSb2xlcyIsInJvbGUiLCJnZXRTZXNzaW9uRnJvbUNsaWVudCIsIndhdGNoIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJnZXRQdWJsaWNSZWFkQWNjZXNzIiwic3Vic2NyaXB0aW9uVG9rZW4iLCJjbGllbnRTZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVLZXlzIiwiX2hhc01hc3RlcktleSIsInV1aWR2NCIsInJlcSIsInB1c2hDb25uZWN0IiwidmFsaWRLZXlQYWlycyIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImlzVmFsaWQiLCJzZWNyZXQiLCJhdXRoQ2FsbGVkIiwicGFyc2VRdWVyeSIsIndpdGhKU09OIiwid2hlcmUiLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJzdWJzY3JpcHRpb25IYXNoIiwicXVlcnlIYXNoIiwiU3Vic2NyaXB0aW9uIiwic3BsaXQiLCJmaWVsZHMiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR2NCBmcm9tICd0djQnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi9TdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgQ2xpZW50IH0gZnJvbSAnLi9DbGllbnQnO1xuaW1wb3J0IHsgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIgfSBmcm9tICcuL1BhcnNlV2ViU29ja2V0U2VydmVyJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBSZXF1ZXN0U2NoZW1hIGZyb20gJy4vUmVxdWVzdFNjaGVtYSc7XG5pbXBvcnQgeyBtYXRjaGVzUXVlcnksIHF1ZXJ5SGFzaCB9IGZyb20gJy4vUXVlcnlUb29scyc7XG5pbXBvcnQgeyBQYXJzZVB1YlN1YiB9IGZyb20gJy4vUGFyc2VQdWJTdWInO1xuaW1wb3J0IFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQge1xuICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzLFxuICBnZXRUcmlnZ2VyLFxuICBydW5UcmlnZ2VyLFxuICByZXNvbHZlRXJyb3IsXG4gIHRvSlNPTndpdGhPYmplY3RzLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLCBBdXRoIH0gZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgeyBnZXRDYWNoZUNvbnRyb2xsZXIsIGdldERhdGFiYXNlQ29udHJvbGxlciB9IGZyb20gJy4uL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IExSVUNhY2hlIGFzIExSVSB9IGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9LCBwYXJzZVNlcnZlckNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICB0aGlzLmNsaWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgY29uZmlnLmFwcElkID0gY29uZmlnLmFwcElkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uZmlnLm1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXkgfHwgUGFyc2UubWFzdGVyS2V5O1xuXG4gICAgLy8gU3RvcmUga2V5cywgY29udmVydCBvYmogdG8gbWFwXG4gICAgY29uc3Qga2V5UGFpcnMgPSBjb25maWcua2V5UGFpcnMgfHwge307XG4gICAgdGhpcy5rZXlQYWlycyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhrZXlQYWlycykpIHtcbiAgICAgIHRoaXMua2V5UGFpcnMuc2V0KGtleSwga2V5UGFpcnNba2V5XSk7XG4gICAgfVxuICAgIGxvZ2dlci52ZXJib3NlKCdTdXBwb3J0IGtleSBwYWlycycsIHRoaXMua2V5UGFpcnMpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBQYXJzZVxuICAgIFBhcnNlLk9iamVjdC5kaXNhYmxlU2luZ2xlSW5zdGFuY2UoKTtcbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBjb25maWcuc2VydmVyVVJMIHx8IFBhcnNlLnNlcnZlclVSTDtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShjb25maWcuYXBwSWQsIFBhcnNlLmphdmFTY3JpcHRLZXksIGNvbmZpZy5tYXN0ZXJLZXkpO1xuXG4gICAgLy8gVGhlIGNhY2hlIGNvbnRyb2xsZXIgaXMgYSBwcm9wZXIgY2FjaGUgY29udHJvbGxlclxuICAgIC8vIHdpdGggYWNjZXNzIHRvIFVzZXIgYW5kIFJvbGVzXG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIocGFyc2VTZXJ2ZXJDb25maWcpO1xuXG4gICAgY29uZmlnLmNhY2hlVGltZW91dCA9IGNvbmZpZy5jYWNoZVRpbWVvdXQgfHwgNSAqIDEwMDA7IC8vIDVzXG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgdHRsOiBjb25maWcuY2FjaGVUaW1lb3V0LFxuICAgIH0pO1xuICAgIC8vIEluaXRpYWxpemUgd2Vic29ja2V0IHNlcnZlclxuICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIgPSBuZXcgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIoXG4gICAgICBzZXJ2ZXIsXG4gICAgICBwYXJzZVdlYnNvY2tldCA9PiB0aGlzLl9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQpLFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICB0aGlzLnN1YnNjcmliZXIgPSBQYXJzZVB1YlN1Yi5jcmVhdGVTdWJzY3JpYmVyKGNvbmZpZyk7XG4gICAgaWYgKCF0aGlzLnN1YnNjcmliZXIuY29ubmVjdCkge1xuICAgICAgdGhpcy5jb25uZWN0KCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY29ubmVjdCgpIHtcbiAgICBpZiAodGhpcy5zdWJzY3JpYmVyLmlzT3Blbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuc3Vic2NyaWJlci5jb25uZWN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc3Vic2NyaWJlci5pc09wZW4gPSB0cnVlO1xuICAgIH1cbiAgICB0aGlzLl9jcmVhdGVTdWJzY3JpYmVycygpO1xuICB9XG5cbiAgYXN5bmMgc2h1dGRvd24oKSB7XG4gICAgaWYgKHRoaXMuc3Vic2NyaWJlci5pc09wZW4pIHtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgLi4uWy4uLnRoaXMuY2xpZW50cy52YWx1ZXMoKV0ubWFwKGNsaWVudCA9PiBjbGllbnQucGFyc2VXZWJTb2NrZXQud3MuY2xvc2UoKSksXG4gICAgICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIuY2xvc2UoKSxcbiAgICAgICAgLi4uQXJyYXkuZnJvbSh0aGlzLnN1YnNjcmliZXIuc3Vic2NyaXB0aW9ucy5rZXlzKCkpLm1hcChrZXkgPT5cbiAgICAgICAgICB0aGlzLnN1YnNjcmliZXIudW5zdWJzY3JpYmUoa2V5KVxuICAgICAgICApLFxuICAgICAgICB0aGlzLnN1YnNjcmliZXIuY2xvc2U/LigpLFxuICAgICAgXSk7XG4gICAgfVxuICAgIHRoaXMuc3Vic2NyaWJlci5pc09wZW4gPSBmYWxzZTtcbiAgfVxuXG4gIF9jcmVhdGVTdWJzY3JpYmVycygpIHtcbiAgICBjb25zdCBtZXNzYWdlUmVjaWV2ZWQgPSAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2NsZWFyQ2FjaGUnKSB7XG4gICAgICAgIHRoaXMuX2NsZWFyQ2FjaGVkUm9sZXMobWVzc2FnZS51c2VySWQpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLl9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZSk7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJTYXZlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyRGVsZXRlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgbWVzc2FnZSAlcyBmcm9tIHVua25vd24gY2hhbm5lbCAlaicsIG1lc3NhZ2UsIGNoYW5uZWwpO1xuICAgICAgfVxuICAgIH07XG4gICAgdGhpcy5zdWJzY3JpYmVyLm9uKCdtZXNzYWdlJywgKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IG1lc3NhZ2VSZWNpZXZlZChjaGFubmVsLCBtZXNzYWdlU3RyKSk7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBbJ2FmdGVyU2F2ZScsICdhZnRlckRlbGV0ZScsICdjbGVhckNhY2hlJ10pIHtcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBgJHtQYXJzZS5hcHBsaWNhdGlvbklkfSR7ZmllbGR9YDtcbiAgICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoY2hhbm5lbCwgbWVzc2FnZVN0ciA9PiBtZXNzYWdlUmVjaWV2ZWQoY2hhbm5lbCwgbWVzc2FnZVN0cikpO1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgSlNPTiBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0IEpTT04uXG4gIF9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgLy8gSW5mbGF0ZSBtZXJnZWQgb2JqZWN0XG4gICAgY29uc3QgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbGV0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbGV0IHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgLy8gSW5mbGF0ZSBvcmlnaW5hbCBvYmplY3RcbiAgICBjb25zdCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0O1xuICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBjbGFzc05hbWUgPSBvcmlnaW5hbFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICAgIHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlckRlbGV0ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IGRlbGV0ZWRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJWogfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGRlbGV0ZWRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihkZWxldGVkUGFyc2VPYmplY3QsIHN1YnNjcmlwdGlvbik7XG4gICAgICBpZiAoIWlzU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0SWRzLmZvckVhY2goYXN5bmMgcmVxdWVzdElkID0+IHtcbiAgICAgICAgICBjb25zdCBhY2wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAvLyBDaGVjayBDTFBcbiAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgaXNNYXRjaGVkID0gYXdhaXQgdGhpcy5fbWF0Y2hlc0FDTChhY2wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGlmICghaXNNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogJ2RlbGV0ZScsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBkZWxldGVkUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJlcy5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9iamVjdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYWZ0ZXJFdmVudC4ke2NsYXNzTmFtZX1gLCByZXMsIGF1dGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBkZWxldGVkUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5fZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICByZXMsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLnF1ZXJ5XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY2xpZW50LnB1c2hEZWxldGUocmVxdWVzdElkLCBkZWxldGVkUGFyc2VPYmplY3QpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlclNhdmUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG51bGw7XG4gICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgbGV0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJXMgfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGN1cnJlbnRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgY29uc3QgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIFNldCBvcmlnbmFsIFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgaWYgKCFpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0w7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKG9yaWdpbmFsQUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFNldCBjdXJyZW50IFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgaWYgKCFpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFDTCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0woY3VycmVudEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IFtpc09yaWdpbmFsTWF0Y2hlZCwgaXNDdXJyZW50TWF0Y2hlZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgICAgICAgJ09yaWdpbmFsICVqIHwgQ3VycmVudCAlaiB8IE1hdGNoOiAlcywgJXMsICVzLCAlcyB8IFF1ZXJ5OiAlcycsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxNYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRNYXRjaGVkLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vIERlY2lkZSBldmVudCB0eXBlXG4gICAgICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAndXBkYXRlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgIWlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICdsZWF2ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdlbnRlcic7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjcmVhdGUnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHdhdGNoRmllbGRzQ2hhbmdlZCA9IHRoaXMuX2NoZWNrV2F0Y2hGaWVsZHMoY2xpZW50LCByZXF1ZXN0SWQsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgaWYgKCF3YXRjaEZpZWxkc0NoYW5nZWQgJiYgKHR5cGUgPT09ICd1cGRhdGUnIHx8IHR5cGUgPT09ICdjcmVhdGUnKSkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiB0eXBlLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJlcy5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9iamVjdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCkge1xuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub3JpZ2luYWwpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYWZ0ZXJFdmVudC4ke2NsYXNzTmFtZX1gLCByZXMsIGF1dGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCAmJiB0eXBlb2YgcmVzLm9yaWdpbmFsLnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMoXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCBjdXJyZW50UGFyc2VPYmplY3QsIG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55KTogdm9pZCB7XG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ21lc3NhZ2UnLCByZXF1ZXN0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShyZXF1ZXN0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIHJlcXVlc3QnLCByZXF1ZXN0LCBlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdSZXF1ZXN0OiAlaicsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBhIHZhbGlkIHJlcXVlc3QsIHJldHVybiBlcnJvciBkaXJlY3RseSBpZiBub3RcbiAgICAgIGlmIChcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hWydnZW5lcmFsJ10pIHx8XG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVtyZXF1ZXN0Lm9wXSlcbiAgICAgICkge1xuICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAxLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ29ubmVjdCBtZXNzYWdlIGVycm9yICVzJywgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocmVxdWVzdC5vcCkge1xuICAgICAgICBjYXNlICdjb25uZWN0JzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Vuc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMywgJ0dldCB1bmtub3duIG9wZXJhdGlvbicpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignR2V0IHVua25vd24gb3BlcmF0aW9uJywgcmVxdWVzdC5vcCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBwYXJzZVdlYnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5pbmZvKGBDbGllbnQgZGlzY29ubmVjdDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNvbnN0IGNsaWVudElkID0gcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQ7XG4gICAgICBpZiAoIXRoaXMuY2xpZW50cy5oYXMoY2xpZW50SWQpKSB7XG4gICAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdF9lcnJvcicsXG4gICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgZXJyb3I6IGBVbmFibGUgdG8gZmluZCBjbGllbnQgJHtjbGllbnRJZH1gLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBDYW4gbm90IGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9IG9uIGRpc2Nvbm5lY3RgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWxldGUgY2xpZW50XG4gICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgIHRoaXMuY2xpZW50cy5kZWxldGUoY2xpZW50SWQpO1xuXG4gICAgICAvLyBEZWxldGUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgZm9yIChjb25zdCBbcmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvXSBvZiBfLmVudHJpZXMoY2xpZW50LnN1YnNjcmlwdGlvbkluZm9zKSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICAgICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihjbGllbnRJZCwgcmVxdWVzdElkKTtcblxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudHMgJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBzdWJzY3JpcHRpb25zICVkJywgdGhpcy5zdWJzY3JpcHRpb25zLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KGRlZXBjb3B5KHBhcnNlT2JqZWN0KSwgc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgfVxuXG4gIGFzeW5jIF9jbGVhckNhY2hlZFJvbGVzKHVzZXJJZDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHZhbGlkVG9rZW5zID0gYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5lcXVhbFRvKCd1c2VyJywgUGFyc2UuVXNlci5jcmVhdGVXaXRob3V0RGF0YSh1c2VySWQpKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICB2YWxpZFRva2Vucy5tYXAoYXN5bmMgdG9rZW4gPT4ge1xuICAgICAgICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHRva2VuLmdldCgnc2Vzc2lvblRva2VuJyk7XG4gICAgICAgICAgY29uc3QgYXV0aFByb21pc2UgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBpZiAoIWF1dGhQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IFthdXRoMSwgYXV0aDJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgYXV0aFByb21pc2UsXG4gICAgICAgICAgICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHsgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlciwgc2Vzc2lvblRva2VuIH0pLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGF1dGgxLmF1dGg/LmNsZWFyUm9sZUNhY2hlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgYXV0aDIuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5kZWxldGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoYENvdWxkIG5vdCBjbGVhciByb2xlIGNhY2hlLiAke2V9YCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW46ID9zdHJpbmcpOiBQcm9taXNlPHsgYXV0aDogP0F1dGgsIHVzZXJJZDogP3N0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIG9iamVjdDogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmdcbiAgKTogYW55IHtcbiAgICAvLyB0cnkgdG8gbWF0Y2ggb24gdXNlciBmaXJzdCwgbGVzcyBleHBlbnNpdmUgdGhhbiB3aXRoIHJvbGVzXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgdXNlcklkO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgRmFpbGVkIG1hdGNoaW5nIENMUCBmb3IgJHtvYmplY3QuaWR9ICR7dXNlcklkfSAke2V9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIFRPRE86IGhhbmRsZSByb2xlcyBwZXJtaXNzaW9uc1xuICAgIC8vIE9iamVjdC5rZXlzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICBjb25zdCBwZXJtID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zW2tleV07XG4gICAgLy8gICBPYmplY3Qua2V5cyhwZXJtKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgICAgaWYgKGtleS5pbmRleE9mKCdyb2xlJykpXG4gICAgLy8gICB9KTtcbiAgICAvLyB9KVxuICAgIC8vIC8vIGl0J3MgcmVqZWN0ZWQgaGVyZSwgY2hlY2sgdGhlIHJvbGVzXG4gICAgLy8gdmFyIHJvbGVzUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSk7XG4gICAgLy8gcm9sZXNRdWVyeS5lcXVhbFRvKFwidXNlcnNcIiwgdXNlcik7XG4gICAgLy8gcmV0dXJuIHJvbGVzUXVlcnkuZmluZCh7dXNlTWFzdGVyS2V5OnRydWV9KTtcbiAgfVxuXG4gIGFzeW5jIF9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogP2FueSxcbiAgICByZXM6IGFueSxcbiAgICBjbGllbnQ6IGFueSxcbiAgICByZXF1ZXN0SWQ6IG51bWJlcixcbiAgICBvcDogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnlcbiAgKSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgY2xpZW50QXV0aDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCwgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgfVxuICAgIGNvbnN0IGZpbHRlciA9IG9iaiA9PiB7XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgcHJvdGVjdGVkRmllbGRzID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zPy5wcm90ZWN0ZWRGaWVsZHMgfHwgW107XG4gICAgICBpZiAoIWNsaWVudC5oYXNNYXN0ZXJLZXkgJiYgIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBnZXREYXRhYmFzZUNvbnRyb2xsZXIodGhpcy5jb25maWcpLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcXVlcnksXG4gICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgY2xpZW50QXV0aFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIERhdGFiYXNlQ29udHJvbGxlci5maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBmYWxzZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIGNsaWVudEF1dGgsXG4gICAgICAgIG9wLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIHJlcy5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgIG9iaixcbiAgICAgICAgcXVlcnlcbiAgICAgICk7XG4gICAgfTtcbiAgICByZXMub2JqZWN0ID0gZmlsdGVyKHJlcy5vYmplY3QpO1xuICAgIHJlcy5vcmlnaW5hbCA9IGZpbHRlcihyZXMub3JpZ2luYWwpO1xuICB9XG5cbiAgX2dldENMUE9wZXJhdGlvbihxdWVyeTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBxdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT0gMSAmJlxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgPyAnZ2V0J1xuICAgICAgOiAnZmluZCc7XG4gIH1cblxuICBhc3luYyBfdmVyaWZ5QUNMKGFjbDogYW55LCB0b2tlbjogc3RyaW5nKSB7XG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHsgYXV0aCwgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4odG9rZW4pO1xuXG4gICAgLy8gR2V0dGluZyB0aGUgc2Vzc2lvbiB0b2tlbiBmYWlsZWRcbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgbm8gYWRkaXRpb25hbCBhdXRoIGlzIGF2YWlsYWJsZVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIGp1c3QgYmFpbCBvdXQgYXMgbm8gYWRkaXRpb25hbCB2aXNpYmlsaXR5IGNhbiBiZSBpbmZlcnJlZC5cbiAgICBpZiAoIWF1dGggfHwgIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQgPSBhY2wuZ2V0UmVhZEFjY2Vzcyh1c2VySWQpO1xuICAgIGlmIChpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSB1c2VyIGhhcyBhbnkgcm9sZXMgdGhhdCBtYXRjaCB0aGUgQUNMXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIFJlc29sdmUgZmFsc2UgcmlnaHQgYXdheSBpZiB0aGUgYWNsIGRvZXNuJ3QgaGF2ZSBhbnkgcm9sZXNcbiAgICAgICAgY29uc3QgYWNsX2hhc19yb2xlcyA9IE9iamVjdC5rZXlzKGFjbC5wZXJtaXNzaW9uc0J5SWQpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKCdyb2xlOicpKTtcbiAgICAgICAgaWYgKCFhY2xfaGFzX3JvbGVzKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyLCBzZXNzaW9uVG9rZW46IHN0cmluZykge1xuICAgIGNvbnN0IGdldFNlc3Npb25Gcm9tQ2xpZW50ID0gKCkgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuIHx8IGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgfTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgc2Vzc2lvblRva2VuID0gZ2V0U2Vzc2lvbkZyb21DbGllbnQoKTtcbiAgICB9XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgICByZXR1cm4gYXV0aDtcbiAgfVxuXG4gIF9jaGVja1dhdGNoRmllbGRzKGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IGFueSwgbWVzc2FnZTogYW55KSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3Qgd2F0Y2ggPSBzdWJzY3JpcHRpb25JbmZvPy53YXRjaDtcbiAgICBpZiAoIXdhdGNoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3Qgb2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgY29uc3Qgb3JpZ2luYWwgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgcmV0dXJuIHdhdGNoLnNvbWUoZmllbGQgPT4gIWlzRGVlcFN0cmljdEVxdWFsKG9iamVjdC5nZXQoZmllbGQpLCBvcmlnaW5hbD8uZ2V0KGZpZWxkKSkpO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNBQ0woYWNsOiBhbnksIGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIC8vIFJldHVybiB0cnVlIGRpcmVjdGx5IGlmIEFDTCBpc24ndCBwcmVzZW50LCBBQ0wgaXMgcHVibGljIHJlYWQsIG9yIGNsaWVudCBoYXMgbWFzdGVyIGtleVxuICAgIGlmICghYWNsIHx8IGFjbC5nZXRQdWJsaWNSZWFkQWNjZXNzKCkgfHwgY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHN1YnNjcmlwdGlvbiBzZXNzaW9uVG9rZW4gbWF0Y2hlcyBBQ0wgZmlyc3RcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uVG9rZW4gPSBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbjtcbiAgICBjb25zdCBjbGllbnRTZXNzaW9uVG9rZW4gPSBjbGllbnQuc2Vzc2lvblRva2VuO1xuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIHN1YnNjcmlwdGlvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIGNsaWVudFNlc3Npb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgaWYgKCF0aGlzLl92YWxpZGF0ZUtleXMocmVxdWVzdCwgdGhpcy5rZXlQYWlycykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDQsICdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIGxvZ2dlci5lcnJvcignS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGhhc01hc3RlcktleSA9IHRoaXMuX2hhc01hc3RlcktleShyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKTtcbiAgICBjb25zdCBjbGllbnRJZCA9IHV1aWR2NCgpO1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoXG4gICAgICBjbGllbnRJZCxcbiAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgaGFzTWFzdGVyS2V5LFxuICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICByZXF1ZXN0Lmluc3RhbGxhdGlvbklkXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxID0ge1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxdWVzdC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH07XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcignQENvbm5lY3QnLCAnYmVmb3JlQ29ubmVjdCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxLnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcS51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZUNvbm5lY3QuQENvbm5lY3RgLCByZXEsIGF1dGgpO1xuICAgICAgfVxuICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICAgIHRoaXMuY2xpZW50cy5zZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIGNsaWVudCk7XG4gICAgICBsb2dnZXIuaW5mbyhgQ3JlYXRlIG5ldyBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjbGllbnQucHVzaENvbm5lY3QoKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMocmVxKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZUNvbm5lY3QgZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFzTWFzdGVyS2V5KHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwIHx8ICF2YWxpZEtleVBhaXJzLmhhcygnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0IHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVxdWVzdCwgJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiByZXF1ZXN0Lm1hc3RlcktleSA9PT0gdmFsaWRLZXlQYWlycy5nZXQoJ21hc3RlcktleScpO1xuICB9XG5cbiAgX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGxldCBpc1ZhbGlkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBba2V5LCBzZWNyZXRdIG9mIHZhbGlkS2V5UGFpcnMpIHtcbiAgICAgIGlmICghcmVxdWVzdFtrZXldIHx8IHJlcXVlc3Rba2V5XSAhPT0gc2VjcmV0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGlzVmFsaWQ7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHJlcXVlc3QucXVlcnkuY2xhc3NOYW1lO1xuICAgIGxldCBhdXRoQ2FsbGVkID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2JlZm9yZVN1YnNjcmliZScsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxdWVzdC5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBhdXRoQ2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICAgICAgICBwYXJzZVF1ZXJ5LndpdGhKU09OKHJlcXVlc3QucXVlcnkpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlU3Vic2NyaWJlLiR7Y2xhc3NOYW1lfWAsIHJlcXVlc3QsIGF1dGgpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gcmVxdWVzdC5xdWVyeS50b0pTT04oKTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgICAgfVxuXG4gICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSB7XG4gICAgICAgIGlmICghYXV0aENhbGxlZCkge1xuICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KFxuICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWQsXG4gICAgICAgICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlblxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0LnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnF1ZXJ5LndoZXJlLnVzZXIgPSByZXF1ZXN0LnVzZXIudG9Qb2ludGVyKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEdldCBzdWJzY3JpcHRpb24gZnJvbSBzdWJzY3JpcHRpb25zLCBjcmVhdGUgb25lIGlmIG5lY2Vzc2FyeVxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSGFzaCA9IHF1ZXJ5SGFzaChyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgIC8vIEFkZCBjbGFzc05hbWUgdG8gc3Vic2NyaXB0aW9ucyBpZiBuZWNlc3NhcnlcblxuICAgICAgaWYgKCF0aGlzLnN1YnNjcmlwdGlvbnMuaGFzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChjbGFzc05hbWUsIG5ldyBNYXAoKSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgICBsZXQgc3Vic2NyaXB0aW9uO1xuICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5oYXMoc3Vic2NyaXB0aW9uSGFzaCkpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gY2xhc3NTdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IG5ldyBTdWJzY3JpcHRpb24oY2xhc3NOYW1lLCByZXF1ZXN0LnF1ZXJ5LndoZXJlLCBzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLnNldChzdWJzY3JpcHRpb25IYXNoLCBzdWJzY3JpcHRpb24pO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgc3Vic2NyaXB0aW9uSW5mbyB0byBjbGllbnRcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbjogc3Vic2NyaXB0aW9uLFxuICAgICAgfTtcbiAgICAgIC8vIEFkZCBzZWxlY3RlZCBmaWVsZHMsIHNlc3Npb25Ub2tlbiBhbmQgaW5zdGFsbGF0aW9uSWQgZm9yIHRoaXMgc3Vic2NyaXB0aW9uIGlmIG5lY2Vzc2FyeVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkua2V5cykge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLmtleXMgPSBBcnJheS5pc0FycmF5KHJlcXVlc3QucXVlcnkua2V5cylcbiAgICAgICAgICA/IHJlcXVlc3QucXVlcnkua2V5c1xuICAgICAgICAgIDogcmVxdWVzdC5xdWVyeS5rZXlzLnNwbGl0KCcsJyk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5maWVsZHMpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5rZXlzID0gcmVxdWVzdC5xdWVyeS5maWVsZHM7XG4gICAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICAgICAgICB1c2FnZTogYFN1YnNjcmliaW5nIHVzaW5nIGZpZWxkcyBwYXJhbWV0ZXJgLFxuICAgICAgICAgIHNvbHV0aW9uOiBgU3Vic2NyaWJlIHVzaW5nIFwia2V5c1wiIGluc3RlYWQuYCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS53YXRjaCkge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLndhdGNoID0gcmVxdWVzdC5xdWVyeS53YXRjaDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnNlc3Npb25Ub2tlbikge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiA9IHJlcXVlc3Quc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgY2xpZW50LmFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdC5yZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuXG4gICAgICAvLyBBZGQgY2xpZW50SWQgdG8gc3Vic2NyaXB0aW9uXG4gICAgICBzdWJzY3JpcHRpb24uYWRkQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGNsaWVudC5wdXNoU3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgIGBDcmVhdGUgY2xpZW50ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IG5ldyBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXI6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdzdWJzY3JpYmUnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3QucmVxdWVzdElkKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZVN1YnNjcmliZSBvbiAke2NsYXNzTmFtZX0gZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSwgbm90aWZ5Q2xpZW50OiBib29sZWFuID0gdHJ1ZSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgY2xpZW50IHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQgJyArIHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBzdWJzY3JpYmUgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHN1YnNjcmlwdGlvbiBmcm9tIGNsaWVudFxuICAgIGNsaWVudC5kZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHN1YnNjcmlwdGlvbi5jbGFzc05hbWU7XG4gICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdElkKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgfVxuICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShjbGFzc05hbWUpO1xuICAgIH1cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAndW5zdWJzY3JpYmUnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgIHNlc3Npb25Ub2tlbjogc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFnQztBQUVoQyxNQUFNQSxvQkFBb0IsQ0FBQztFQUV6Qjs7RUFJQTs7RUFHQUMsV0FBVyxDQUFDQyxNQUFXLEVBQUVDLE1BQVcsR0FBRyxDQUFDLENBQUMsRUFBRUMsaUJBQXNCLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDdEUsSUFBSSxDQUFDRixNQUFNLEdBQUdBLE1BQU07SUFDcEIsSUFBSSxDQUFDRyxPQUFPLEdBQUcsSUFBSUMsR0FBRyxFQUFFO0lBQ3hCLElBQUksQ0FBQ0MsYUFBYSxHQUFHLElBQUlELEdBQUcsRUFBRTtJQUM5QixJQUFJLENBQUNILE1BQU0s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
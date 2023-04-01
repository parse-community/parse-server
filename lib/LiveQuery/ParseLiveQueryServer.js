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
    this.authCache = new _lruCache.default({
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwidHRsIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJjb25uZWN0IiwiaXNPcGVuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfY3JlYXRlU3Vic2NyaWJlcnMiLCJtZXNzYWdlUmVjaWV2ZWQiLCJjaGFubmVsIiwibWVzc2FnZVN0ciIsIm1lc3NhZ2UiLCJKU09OIiwicGFyc2UiLCJlIiwiZXJyb3IiLCJfY2xlYXJDYWNoZWRSb2xlcyIsInVzZXJJZCIsIl9pbmZsYXRlUGFyc2VPYmplY3QiLCJfb25BZnRlclNhdmUiLCJfb25BZnRlckRlbGV0ZSIsIm9uIiwiZmllbGQiLCJzdWJzY3JpYmUiLCJjdXJyZW50UGFyc2VPYmplY3QiLCJVc2VyUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsImNsYXNzTmFtZSIsInBhcnNlT2JqZWN0IiwiX2ZpbmlzaEZldGNoIiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImRlbGV0ZWRQYXJzZU9iamVjdCIsInRvSlNPTiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlkIiwic2l6ZSIsImNsYXNzU3Vic2NyaXB0aW9ucyIsImdldCIsImRlYnVnIiwic3Vic2NyaXB0aW9uIiwidmFsdWVzIiwiaXNTdWJzY3JpcHRpb25NYXRjaGVkIiwiX21hdGNoZXNTdWJzY3JpcHRpb24iLCJjbGllbnRJZCIsInJlcXVlc3RJZHMiLCJfIiwiZW50cmllcyIsImNsaWVudFJlcXVlc3RJZHMiLCJjbGllbnQiLCJmb3JFYWNoIiwicmVxdWVzdElkIiwiYWNsIiwiZ2V0QUNMIiwib3AiLCJfZ2V0Q0xQT3BlcmF0aW9uIiwicXVlcnkiLCJyZXMiLCJfbWF0Y2hlc0NMUCIsImlzTWF0Y2hlZCIsIl9tYXRjaGVzQUNMIiwiZXZlbnQiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3QiLCJ1c2VNYXN0ZXJLZXkiLCJoYXNNYXN0ZXJLZXkiLCJpbnN0YWxsYXRpb25JZCIsInNlbmRFdmVudCIsInRyaWdnZXIiLCJnZXRUcmlnZ2VyIiwiYXV0aCIsImdldEF1dGhGcm9tQ2xpZW50IiwidXNlciIsImZyb21KU09OIiwicnVuVHJpZ2dlciIsInRvSlNPTndpdGhPYmplY3RzIiwiX2ZpbHRlclNlbnNpdGl2ZURhdGEiLCJwdXNoRGVsZXRlIiwicmVzb2x2ZUVycm9yIiwiQ2xpZW50IiwicHVzaEVycm9yIiwicGFyc2VXZWJTb2NrZXQiLCJjb2RlIiwic3RyaW5naWZ5IiwiaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkIiwib3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiYWxsIiwiaGFzaCIsInR5cGUiLCJ3YXRjaEZpZWxkc0NoYW5nZWQiLCJfY2hlY2tXYXRjaEZpZWxkcyIsIm9yaWdpbmFsIiwiZnVuY3Rpb25OYW1lIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJzbGljZSIsInJlcXVlc3QiLCJ0djQiLCJ2YWxpZGF0ZSIsIlJlcXVlc3RTY2hlbWEiLCJfaGFuZGxlQ29ubmVjdCIsIl9oYW5kbGVTdWJzY3JpYmUiLCJfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uIiwiX2hhbmRsZVVuc3Vic2NyaWJlIiwiaW5mbyIsImhhcyIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJkZWxldGUiLCJzdWJzY3JpcHRpb25JbmZvIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJoYXNTdWJzY3JpYmluZ0NsaWVudCIsIm1hdGNoZXNRdWVyeSIsImRlZXBjb3B5IiwidmFsaWRUb2tlbnMiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiVXNlciIsImNyZWF0ZVdpdGhvdXREYXRhIiwiZmluZCIsIm1hcCIsInRva2VuIiwiYXV0aFByb21pc2UiLCJhdXRoMSIsImF1dGgyIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImNsZWFyUm9sZUNhY2hlIiwiZnJvbUNhY2hlIiwidGhlbiIsImNhdGNoIiwicmVzdWx0IiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiYWNsR3JvdXAiLCJwdXNoIiwiU2NoZW1hQ29udHJvbGxlciIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNsaWVudEF1dGgiLCJmaWx0ZXIiLCJvYmoiLCJwcm90ZWN0ZWRGaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJnZXREYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJfdmVyaWZ5QUNMIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzb21lIiwic3RhcnRzV2l0aCIsInJvbGVOYW1lcyIsImdldFVzZXJSb2xlcyIsInJvbGUiLCJnZXRTZXNzaW9uRnJvbUNsaWVudCIsIndhdGNoIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJnZXRQdWJsaWNSZWFkQWNjZXNzIiwic3Vic2NyaXB0aW9uVG9rZW4iLCJjbGllbnRTZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVLZXlzIiwiX2hhc01hc3RlcktleSIsInV1aWR2NCIsInJlcSIsInB1c2hDb25uZWN0IiwidmFsaWRLZXlQYWlycyIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImlzVmFsaWQiLCJzZWNyZXQiLCJhdXRoQ2FsbGVkIiwicGFyc2VRdWVyeSIsIndpdGhKU09OIiwid2hlcmUiLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJzdWJzY3JpcHRpb25IYXNoIiwicXVlcnlIYXNoIiwiU3Vic2NyaXB0aW9uIiwic3BsaXQiLCJmaWVsZHMiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR2NCBmcm9tICd0djQnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi9TdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgQ2xpZW50IH0gZnJvbSAnLi9DbGllbnQnO1xuaW1wb3J0IHsgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIgfSBmcm9tICcuL1BhcnNlV2ViU29ja2V0U2VydmVyJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBSZXF1ZXN0U2NoZW1hIGZyb20gJy4vUmVxdWVzdFNjaGVtYSc7XG5pbXBvcnQgeyBtYXRjaGVzUXVlcnksIHF1ZXJ5SGFzaCB9IGZyb20gJy4vUXVlcnlUb29scyc7XG5pbXBvcnQgeyBQYXJzZVB1YlN1YiB9IGZyb20gJy4vUGFyc2VQdWJTdWInO1xuaW1wb3J0IFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQge1xuICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzLFxuICBnZXRUcmlnZ2VyLFxuICBydW5UcmlnZ2VyLFxuICByZXNvbHZlRXJyb3IsXG4gIHRvSlNPTndpdGhPYmplY3RzLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLCBBdXRoIH0gZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgeyBnZXRDYWNoZUNvbnRyb2xsZXIsIGdldERhdGFiYXNlQ29udHJvbGxlciB9IGZyb20gJy4uL0NvbnRyb2xsZXJzJztcbmltcG9ydCBMUlUgZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBVc2VyUm91dGVyIGZyb20gJy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4uL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuXG5jbGFzcyBQYXJzZUxpdmVRdWVyeVNlcnZlciB7XG4gIGNsaWVudHM6IE1hcDtcbiAgLy8gY2xhc3NOYW1lIC0+IChxdWVyeUhhc2ggLT4gc3Vic2NyaXB0aW9uKVxuICBzdWJzY3JpcHRpb25zOiBPYmplY3Q7XG4gIHBhcnNlV2ViU29ja2V0U2VydmVyOiBPYmplY3Q7XG4gIGtleVBhaXJzOiBhbnk7XG4gIC8vIFRoZSBzdWJzY3JpYmVyIHdlIHVzZSB0byBnZXQgb2JqZWN0IHVwZGF0ZSBmcm9tIHB1Ymxpc2hlclxuICBzdWJzY3JpYmVyOiBPYmplY3Q7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIGNvbmZpZzogYW55ID0ge30sIHBhcnNlU2VydmVyQ29uZmlnOiBhbnkgPSB7fSkge1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuICAgIHRoaXMuY2xpZW50cyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICBjb25maWcuYXBwSWQgPSBjb25maWcuYXBwSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICBjb25maWcubWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleSB8fCBQYXJzZS5tYXN0ZXJLZXk7XG5cbiAgICAvLyBTdG9yZSBrZXlzLCBjb252ZXJ0IG9iaiB0byBtYXBcbiAgICBjb25zdCBrZXlQYWlycyA9IGNvbmZpZy5rZXlQYWlycyB8fCB7fTtcbiAgICB0aGlzLmtleVBhaXJzID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGtleVBhaXJzKSkge1xuICAgICAgdGhpcy5rZXlQYWlycy5zZXQoa2V5LCBrZXlQYWlyc1trZXldKTtcbiAgICB9XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ1N1cHBvcnQga2V5IHBhaXJzJywgdGhpcy5rZXlQYWlycyk7XG5cbiAgICAvLyBJbml0aWFsaXplIFBhcnNlXG4gICAgUGFyc2UuT2JqZWN0LmRpc2FibGVTaW5nbGVJbnN0YW5jZSgpO1xuICAgIGNvbnN0IHNlcnZlclVSTCA9IGNvbmZpZy5zZXJ2ZXJVUkwgfHwgUGFyc2Uuc2VydmVyVVJMO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBQYXJzZS5pbml0aWFsaXplKGNvbmZpZy5hcHBJZCwgUGFyc2UuamF2YVNjcmlwdEtleSwgY29uZmlnLm1hc3RlcktleSk7XG5cbiAgICAvLyBUaGUgY2FjaGUgY29udHJvbGxlciBpcyBhIHByb3BlciBjYWNoZSBjb250cm9sbGVyXG4gICAgLy8gd2l0aCBhY2Nlc3MgdG8gVXNlciBhbmQgUm9sZXNcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGdldENhY2hlQ29udHJvbGxlcihwYXJzZVNlcnZlckNvbmZpZyk7XG5cbiAgICBjb25maWcuY2FjaGVUaW1lb3V0ID0gY29uZmlnLmNhY2hlVGltZW91dCB8fCA1ICogMTAwMDsgLy8gNXNcblxuICAgIC8vIFRoaXMgYXV0aCBjYWNoZSBzdG9yZXMgdGhlIHByb21pc2VzIGZvciBlYWNoIGF1dGggcmVzb2x1dGlvbi5cbiAgICAvLyBUaGUgbWFpbiBiZW5lZml0IGlzIHRvIGJlIGFibGUgdG8gcmV1c2UgdGhlIHNhbWUgdXNlciAvIHNlc3Npb24gdG9rZW4gcmVzb2x1dGlvbi5cbiAgICB0aGlzLmF1dGhDYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgbWF4OiA1MDAsIC8vIDUwMCBjb25jdXJyZW50XG4gICAgICB0dGw6IGNvbmZpZy5jYWNoZVRpbWVvdXQsXG4gICAgfSk7XG4gICAgLy8gSW5pdGlhbGl6ZSB3ZWJzb2NrZXQgc2VydmVyXG4gICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlciA9IG5ldyBQYXJzZVdlYlNvY2tldFNlcnZlcihcbiAgICAgIHNlcnZlcixcbiAgICAgIHBhcnNlV2Vic29ja2V0ID0+IHRoaXMuX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldCksXG4gICAgICBjb25maWdcbiAgICApO1xuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICBpZiAoIXRoaXMuc3Vic2NyaWJlci5jb25uZWN0KSB7XG4gICAgICB0aGlzLmNvbm5lY3QoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLnN1YnNjcmliZXIuaXNPcGVuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnN1YnNjcmliZXIuY29ubmVjdCgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zdWJzY3JpYmVyLmlzT3BlbiA9IHRydWU7XG4gICAgfVxuICAgIHRoaXMuX2NyZWF0ZVN1YnNjcmliZXJzKCk7XG4gIH1cbiAgX2NyZWF0ZVN1YnNjcmliZXJzKCkge1xuICAgIGNvbnN0IG1lc3NhZ2VSZWNpZXZlZCA9IChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiB7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnU3Vic2NyaWJlIG1lc3NhZ2UgJWonLCBtZXNzYWdlU3RyKTtcbiAgICAgIGxldCBtZXNzYWdlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgbWVzc2FnZSA9IEpTT04ucGFyc2UobWVzc2FnZVN0cik7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIG1lc3NhZ2UnLCBtZXNzYWdlU3RyLCBlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnY2xlYXJDYWNoZScpIHtcbiAgICAgICAgdGhpcy5fY2xlYXJDYWNoZWRSb2xlcyhtZXNzYWdlLnVzZXJJZCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlKTtcbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlclNhdmUobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJEZWxldGUobWVzc2FnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCBtZXNzYWdlICVzIGZyb20gdW5rbm93biBjaGFubmVsICVqJywgbWVzc2FnZSwgY2hhbm5lbCk7XG4gICAgICB9XG4gICAgfTtcbiAgICB0aGlzLnN1YnNjcmliZXIub24oJ21lc3NhZ2UnLCAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4gbWVzc2FnZVJlY2lldmVkKGNoYW5uZWwsIG1lc3NhZ2VTdHIpKTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIFsnYWZ0ZXJTYXZlJywgJ2FmdGVyRGVsZXRlJywgJ2NsZWFyQ2FjaGUnXSkge1xuICAgICAgY29uc3QgY2hhbm5lbCA9IGAke1BhcnNlLmFwcGxpY2F0aW9uSWR9JHtmaWVsZH1gO1xuICAgICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShjaGFubmVsLCBtZXNzYWdlU3RyID0+IG1lc3NhZ2VSZWNpZXZlZChjaGFubmVsLCBtZXNzYWdlU3RyKSk7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBKU09OIGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QgSlNPTi5cbiAgX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICAvLyBJbmZsYXRlIG1lcmdlZCBvYmplY3RcbiAgICBjb25zdCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMoY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBsZXQgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsZXQgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICAvLyBJbmZsYXRlIG9yaWdpbmFsIG9iamVjdFxuICAgIGNvbnN0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIGNsYXNzTmFtZSA9IG9yaWdpbmFsUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgICAgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2gob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyRGVsZXRlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgZGVsZXRlZFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlaiB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgZGVsZXRlZFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc1N1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKGRlbGV0ZWRQYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIGlmICghaXNTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIGNvbnN0IGFjbCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgIC8vIENoZWNrIENMUFxuICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBpc01hdGNoZWQgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgaWYgKCFpc01hdGNoZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiAnZGVsZXRlJyxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGRlbGV0ZWRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZWRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjbGllbnQucHVzaERlbGV0ZShyZXF1ZXN0SWQsIGRlbGV0ZWRQYXJzZU9iamVjdCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBsZXQgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlcyB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgY3VycmVudFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBjb25zdCBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgLy8gU2V0IG9yaWduYWwgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBpZiAoIWlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBvcmlnaW5hbEFDTDtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0wgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0wob3JpZ2luYWxBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gU2V0IGN1cnJlbnQgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICBpZiAoIWlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QUNMID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChjdXJyZW50QUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgW2lzT3JpZ2luYWxNYXRjaGVkLCBpc0N1cnJlbnRNYXRjaGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbE1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudE1hdGNoZWQsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5oYXNoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gRGVjaWRlIGV2ZW50IHR5cGVcbiAgICAgICAgICAgIGxldCB0eXBlO1xuICAgICAgICAgICAgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICd1cGRhdGUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiAhaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ2xlYXZlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2VudGVyJztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NyZWF0ZSc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2F0Y2hGaWVsZHNDaGFuZ2VkID0gdGhpcy5fY2hlY2tXYXRjaEZpZWxkcyhjbGllbnQsIHJlcXVlc3RJZCwgbWVzc2FnZSk7XG4gICAgICAgICAgICBpZiAoIXdhdGNoRmllbGRzQ2hhbmdlZCAmJiAodHlwZSA9PT0gJ3VwZGF0ZScgfHwgdHlwZSA9PT0gJ2NyZWF0ZScpKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6IHR5cGUsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vcmlnaW5hbCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsICYmIHR5cGVvZiByZXMub3JpZ2luYWwudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwsXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLmNsYXNzTmFtZSB8fCBjbGFzc05hbWVcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5xdWVyeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9ICdwdXNoJyArIHJlcy5ldmVudC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHJlcy5ldmVudC5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChjbGllbnRbZnVuY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgICBjbGllbnRbZnVuY3Rpb25OYW1lXShyZXF1ZXN0SWQsIGN1cnJlbnRQYXJzZU9iamVjdCwgb3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfb25Db25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnkpOiB2b2lkIHtcbiAgICBwYXJzZVdlYnNvY2tldC5vbignbWVzc2FnZScsIHJlcXVlc3QgPT4ge1xuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKHJlcXVlc3QpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgcmVxdWVzdCcsIHJlcXVlc3QsIGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1JlcXVlc3Q6ICVqJywgcmVxdWVzdCk7XG5cbiAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyByZXF1ZXN0IGlzIGEgdmFsaWQgcmVxdWVzdCwgcmV0dXJuIGVycm9yIGRpcmVjdGx5IGlmIG5vdFxuICAgICAgaWYgKFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbJ2dlbmVyYWwnXSkgfHxcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hW3JlcXVlc3Qub3BdKVxuICAgICAgKSB7XG4gICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDEsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25uZWN0IG1lc3NhZ2UgZXJyb3IgJXMnLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChyZXF1ZXN0Lm9wKSB7XG4gICAgICAgIGNhc2UgJ2Nvbm5lY3QnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdzdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VwZGF0ZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndW5zdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAzLCAnR2V0IHVua25vd24gb3BlcmF0aW9uJyk7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgdW5rbm93biBvcGVyYXRpb24nLCByZXF1ZXN0Lm9wKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oYENsaWVudCBkaXNjb25uZWN0OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY29uc3QgY2xpZW50SWQgPSBwYXJzZVdlYnNvY2tldC5jbGllbnRJZDtcbiAgICAgIGlmICghdGhpcy5jbGllbnRzLmhhcyhjbGllbnRJZCkpIHtcbiAgICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0X2Vycm9yJyxcbiAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICBlcnJvcjogYFVuYWJsZSB0byBmaW5kIGNsaWVudCAke2NsaWVudElkfWAsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYENhbiBub3QgZmluZCBjbGllbnQgJHtjbGllbnRJZH0gb24gZGlzY29ubmVjdGApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnRcbiAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgdGhpcy5jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICBmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm9dIG9mIF8uZW50cmllcyhjbGllbnQuc3Vic2NyaXB0aW9uSW5mb3MpKSB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgICAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKGNsaWVudElkLCByZXF1ZXN0SWQpO1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50cyAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IHN1YnNjcmlwdGlvbnMgJWQnLCB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBldmVudDogJ3dzX2Nvbm5lY3QnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICB9KTtcbiAgfVxuXG4gIF9tYXRjaGVzU3Vic2NyaXB0aW9uKHBhcnNlT2JqZWN0OiBhbnksIHN1YnNjcmlwdGlvbjogYW55KTogYm9vbGVhbiB7XG4gICAgLy8gT2JqZWN0IGlzIHVuZGVmaW5lZCBvciBudWxsLCBub3QgbWF0Y2hcbiAgICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzUXVlcnkoZGVlcGNvcHkocGFyc2VPYmplY3QpLCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgYXN5bmMgX2NsZWFyQ2FjaGVkUm9sZXModXNlcklkOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFsaWRUb2tlbnMgPSBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmVxdWFsVG8oJ3VzZXInLCBQYXJzZS5Vc2VyLmNyZWF0ZVdpdGhvdXREYXRhKHVzZXJJZCkpXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIHZhbGlkVG9rZW5zLm1hcChhc3luYyB0b2tlbiA9PiB7XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvblRva2VuID0gdG9rZW4uZ2V0KCdzZXNzaW9uVG9rZW4nKTtcbiAgICAgICAgICBjb25zdCBhdXRoUHJvbWlzZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIGlmICghYXV0aFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgW2F1dGgxLCBhdXRoMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBhdXRoUHJvbWlzZSxcbiAgICAgICAgICAgIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oeyBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLCBzZXNzaW9uVG9rZW4gfSksXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgYXV0aDEuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBhdXRoMi5hdXRoPy5jbGVhclJvbGVDYWNoZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgQ291bGQgbm90IGNsZWFyIHJvbGUgY2FjaGUuICR7ZX1gKTtcbiAgICB9XG4gIH1cblxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbjogP3N0cmluZyk6IFByb21pc2U8eyBhdXRoOiA/QXV0aCwgdXNlcklkOiA/c3RyaW5nIH0+IHtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfVxuICAgIGNvbnN0IGZyb21DYWNoZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmIChmcm9tQ2FjaGUpIHtcbiAgICAgIHJldHVybiBmcm9tQ2FjaGU7XG4gICAgfVxuICAgIGNvbnN0IGF1dGhQcm9taXNlID0gZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLFxuICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgfSlcbiAgICAgIC50aGVuKGF1dGggPT4ge1xuICAgICAgICByZXR1cm4geyBhdXRoLCB1c2VySWQ6IGF1dGggJiYgYXV0aC51c2VyICYmIGF1dGgudXNlci5pZCB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlcnJvciB3aXRoIHRoZSBzZXNzaW9uIHRva2VuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksIHRoaXMuY29uZmlnLmNhY2hlVGltZW91dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsZXRlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6ID9hbnksXG4gICAgb2JqZWN0OiBhbnksXG4gICAgY2xpZW50OiBhbnksXG4gICAgcmVxdWVzdElkOiBudW1iZXIsXG4gICAgb3A6IHN0cmluZ1xuICApOiBhbnkge1xuICAgIC8vIHRyeSB0byBtYXRjaCBvbiB1c2VyIGZpcnN0LCBsZXNzIGV4cGVuc2l2ZSB0aGFuIHdpdGggcm9sZXNcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgeyB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbik7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIG9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBvcFxuICAgICAgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBGYWlsZWQgbWF0Y2hpbmcgQ0xQIGZvciAke29iamVjdC5pZH0gJHt1c2VySWR9ICR7ZX1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gVE9ETzogaGFuZGxlIHJvbGVzIHBlcm1pc3Npb25zXG4gICAgLy8gT2JqZWN0LmtleXMoY2xhc3NMZXZlbFBlcm1pc3Npb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgIGNvbnN0IHBlcm0gPSBjbGFzc0xldmVsUGVybWlzc2lvbnNba2V5XTtcbiAgICAvLyAgIE9iamVjdC5rZXlzKHBlcm0pLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgICBpZiAoa2V5LmluZGV4T2YoJ3JvbGUnKSlcbiAgICAvLyAgIH0pO1xuICAgIC8vIH0pXG4gICAgLy8gLy8gaXQncyByZWplY3RlZCBoZXJlLCBjaGVjayB0aGUgcm9sZXNcbiAgICAvLyB2YXIgcm9sZXNRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKTtcbiAgICAvLyByb2xlc1F1ZXJ5LmVxdWFsVG8oXCJ1c2Vyc1wiLCB1c2VyKTtcbiAgICAvLyByZXR1cm4gcm9sZXNRdWVyeS5maW5kKHt1c2VNYXN0ZXJLZXk6dHJ1ZX0pO1xuICB9XG5cbiAgYXN5bmMgX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIHJlczogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueVxuICApIHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCBjbGllbnRBdXRoO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkLCBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBjbGllbnRBdXRoID0gYXV0aDtcbiAgICB9XG4gICAgY29uc3QgZmlsdGVyID0gb2JqID0+IHtcbiAgICAgIGlmICghb2JqKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM/LnByb3RlY3RlZEZpZWxkcyB8fCBbXTtcbiAgICAgIGlmICghY2xpZW50Lmhhc01hc3RlcktleSAmJiAhQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGdldERhdGFiYXNlQ29udHJvbGxlcih0aGlzLmNvbmZpZykuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICByZXMub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICBjbGllbnRBdXRoXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gRGF0YWJhc2VDb250cm9sbGVyLmZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgIGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGZhbHNlLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgY2xpZW50QXV0aCxcbiAgICAgICAgb3AsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgb2JqLFxuICAgICAgICBxdWVyeVxuICAgICAgKTtcbiAgICB9O1xuICAgIHJlcy5vYmplY3QgPSBmaWx0ZXIocmVzLm9iamVjdCk7XG4gICAgcmVzLm9yaWdpbmFsID0gZmlsdGVyKHJlcy5vcmlnaW5hbCk7XG4gIH1cblxuICBfZ2V0Q0xQT3BlcmF0aW9uKHF1ZXJ5OiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mIHF1ZXJ5ID09PSAnb2JqZWN0JyAmJlxuICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PSAxICYmXG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICA/ICdnZXQnXG4gICAgICA6ICdmaW5kJztcbiAgfVxuXG4gIGFzeW5jIF92ZXJpZnlBQ0woYWNsOiBhbnksIHRva2VuOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgeyBhdXRoLCB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih0b2tlbik7XG5cbiAgICAvLyBHZXR0aW5nIHRoZSBzZXNzaW9uIHRva2VuIGZhaWxlZFxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBubyBhZGRpdGlvbmFsIGF1dGggaXMgYXZhaWxhYmxlXG4gICAgLy8gQXQgdGhpcyBwb2ludCwganVzdCBiYWlsIG91dCBhcyBubyBhZGRpdGlvbmFsIHZpc2liaWxpdHkgY2FuIGJlIGluZmVycmVkLlxuICAgIGlmICghYXV0aCB8fCAhdXNlcklkKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCA9IGFjbC5nZXRSZWFkQWNjZXNzKHVzZXJJZCk7XG4gICAgaWYgKGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHVzZXIgaGFzIGFueSByb2xlcyB0aGF0IG1hdGNoIHRoZSBBQ0xcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgLy8gUmVzb2x2ZSBmYWxzZSByaWdodCBhd2F5IGlmIHRoZSBhY2wgZG9lc24ndCBoYXZlIGFueSByb2xlc1xuICAgICAgICBjb25zdCBhY2xfaGFzX3JvbGVzID0gT2JqZWN0LmtleXMoYWNsLnBlcm1pc3Npb25zQnlJZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpO1xuICAgICAgICBpZiAoIWFjbF9oYXNfcm9sZXMpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgICAgICAgLy8gRmluYWxseSwgc2VlIGlmIGFueSBvZiB0aGUgdXNlcidzIHJvbGVzIGFsbG93IHRoZW0gcmVhZCBhY2Nlc3NcbiAgICAgICAgZm9yIChjb25zdCByb2xlIG9mIHJvbGVOYW1lcykge1xuICAgICAgICAgIC8vIFdlIHVzZSBnZXRSZWFkQWNjZXNzIGFzIGByb2xlYCBpcyBpbiB0aGUgZm9ybSBgcm9sZTpyb2xlTmFtZWBcbiAgICAgICAgICBpZiAoYWNsLmdldFJlYWRBY2Nlc3Mocm9sZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRBdXRoRnJvbUNsaWVudChjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIsIHNlc3Npb25Ub2tlbjogc3RyaW5nKSB7XG4gICAgY29uc3QgZ2V0U2Vzc2lvbkZyb21DbGllbnQgPSAoKSA9PiB7XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICByZXR1cm4gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gfHwgY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICB9O1xuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICBzZXNzaW9uVG9rZW4gPSBnZXRTZXNzaW9uRnJvbUNsaWVudCgpO1xuICAgIH1cbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7IGF1dGggfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW4pO1xuICAgIHJldHVybiBhdXRoO1xuICB9XG5cbiAgX2NoZWNrV2F0Y2hGaWVsZHMoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogYW55LCBtZXNzYWdlOiBhbnkpIHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCB3YXRjaCA9IHN1YnNjcmlwdGlvbkluZm8/LndhdGNoO1xuICAgIGlmICghd2F0Y2gpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBvYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBjb25zdCBvcmlnaW5hbCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICByZXR1cm4gd2F0Y2guc29tZShmaWVsZCA9PiAhaXNEZWVwU3RyaWN0RXF1YWwob2JqZWN0LmdldChmaWVsZCksIG9yaWdpbmFsPy5nZXQoZmllbGQpKSk7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0FDTChhY2w6IGFueSwgY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgLy8gUmV0dXJuIHRydWUgZGlyZWN0bHkgaWYgQUNMIGlzbid0IHByZXNlbnQsIEFDTCBpcyBwdWJsaWMgcmVhZCwgb3IgY2xpZW50IGhhcyBtYXN0ZXIga2V5XG4gICAgaWYgKCFhY2wgfHwgYWNsLmdldFB1YmxpY1JlYWRBY2Nlc3MoKSB8fCBjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgc3Vic2NyaXB0aW9uIHNlc3Npb25Ub2tlbiBtYXRjaGVzIEFDTCBmaXJzdFxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25Ub2tlbiA9IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuO1xuICAgIGNvbnN0IGNsaWVudFNlc3Npb25Ub2tlbiA9IGNsaWVudC5zZXNzaW9uVG9rZW47XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgc3Vic2NyaXB0aW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgY2xpZW50U2Vzc2lvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICBpZiAoIXRoaXMuX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgNCwgJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgbG9nZ2VyLmVycm9yKCdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaGFzTWFzdGVyS2V5ID0gdGhpcy5faGFzTWFzdGVyS2V5KHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpO1xuICAgIGNvbnN0IGNsaWVudElkID0gdXVpZHY0KCk7XG4gICAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudChcbiAgICAgIGNsaWVudElkLFxuICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICBoYXNNYXN0ZXJLZXksXG4gICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgIHJlcXVlc3QuaW5zdGFsbGF0aW9uSWRcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXEgPSB7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiByZXF1ZXN0Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKCdAQ29ubmVjdCcsICdiZWZvcmVDb25uZWN0JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXEuc2Vzc2lvblRva2VuKTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlQ29ubmVjdC5AQ29ubmVjdGAsIHJlcSwgYXV0aCk7XG4gICAgICB9XG4gICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCA9IGNsaWVudElkO1xuICAgICAgdGhpcy5jbGllbnRzLnNldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgY2xpZW50KTtcbiAgICAgIGxvZ2dlci5pbmZvKGBDcmVhdGUgbmV3IGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNsaWVudC5wdXNoQ29ubmVjdCgpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhyZXEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlQ29ubmVjdCBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYXNNYXN0ZXJLZXkocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDAgfHwgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXJlcXVlc3QgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC5xdWVyeS5jbGFzc05hbWU7XG4gICAgbGV0IGF1dGhDYWxsZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYmVmb3JlU3Vic2NyaWJlJywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gICAgICAgIHBhcnNlUXVlcnkud2l0aEpTT04ocmVxdWVzdC5xdWVyeSk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVTdWJzY3JpYmUuJHtjbGFzc05hbWV9YCwgcmVxdWVzdCwgYXV0aCk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXF1ZXN0LnF1ZXJ5LnRvSlNPTigpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgaWYgKCFhdXRoQ2FsbGVkKSB7XG4gICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoXG4gICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZCxcbiAgICAgICAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3QudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUudXNlciA9IHJlcXVlc3QudXNlci50b1BvaW50ZXIoKTtcbiAgICAgICAgfSBlbHNlIGlmICghcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWRcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gR2V0IHN1YnNjcmlwdGlvbiBmcm9tIHN1YnNjcmlwdGlvbnMsIGNyZWF0ZSBvbmUgaWYgbmVjZXNzYXJ5XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25IYXNoID0gcXVlcnlIYXNoKHJlcXVlc3QucXVlcnkpO1xuICAgICAgLy8gQWRkIGNsYXNzTmFtZSB0byBzdWJzY3JpcHRpb25zIGlmIG5lY2Vzc2FyeVxuXG4gICAgICBpZiAoIXRoaXMuc3Vic2NyaXB0aW9ucy5oYXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzTmFtZSwgbmV3IE1hcCgpKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICAgIGxldCBzdWJzY3JpcHRpb247XG4gICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLmhhcyhzdWJzY3JpcHRpb25IYXNoKSkge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBjbGFzc1N1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gbmV3IFN1YnNjcmlwdGlvbihjbGFzc05hbWUsIHJlcXVlc3QucXVlcnkud2hlcmUsIHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuc2V0KHN1YnNjcmlwdGlvbkhhc2gsIHN1YnNjcmlwdGlvbik7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBzdWJzY3JpcHRpb25JbmZvIHRvIGNsaWVudFxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb24sXG4gICAgICB9O1xuICAgICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5rZXlzKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ua2V5cyA9IEFycmF5LmlzQXJyYXkocmVxdWVzdC5xdWVyeS5rZXlzKVxuICAgICAgICAgID8gcmVxdWVzdC5xdWVyeS5rZXlzXG4gICAgICAgICAgOiByZXF1ZXN0LnF1ZXJ5LmtleXMuc3BsaXQoJywnKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LmZpZWxkcykge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLmtleXMgPSByZXF1ZXN0LnF1ZXJ5LmZpZWxkcztcbiAgICAgICAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgICAgICAgIHVzYWdlOiBgU3Vic2NyaWJpbmcgdXNpbmcgZmllbGRzIHBhcmFtZXRlcmAsXG4gICAgICAgICAgc29sdXRpb246IGBTdWJzY3JpYmUgdXNpbmcgXCJrZXlzXCIgaW5zdGVhZC5gLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LndhdGNoKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ud2F0Y2ggPSByZXF1ZXN0LnF1ZXJ5LndhdGNoO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3Quc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBjbGllbnQuYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0LnJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG5cbiAgICAgIC8vIEFkZCBjbGllbnRJZCB0byBzdWJzY3JpcHRpb25cbiAgICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgY2xpZW50LnB1c2hTdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgICApO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlcjogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ3N1YnNjcmliZScsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlU3Vic2NyaWJlIG9uICR7Y2xhc3NOYW1lfSBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCwgZmFsc2UpO1xuICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gIH1cblxuICBfaGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55LCBub3RpZnlDbGllbnQ6IGJvb2xlYW4gPSB0cnVlKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIW5vdGlmeUNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNsaWVudC5wdXNoVW5zdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICBgRGVsZXRlIGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gfCBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIg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
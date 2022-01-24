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
          } catch (error) {
            _Client.Client.pushError(client.parseWebSocket, error.code || _node.default.Error.SCRIPT_FAILED, error.message || error, false, requestId);

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
          } catch (error) {
            _Client.Client.pushError(client.parseWebSocket, error.code || _node.default.Error.SCRIPT_FAILED, error.message || error, false, requestId);

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
    } catch (error) {
      _Client.Client.pushError(parseWebsocket, error.code || _node.default.Error.SCRIPT_FAILED, error.message || error, false);

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
      _Client.Client.pushError(parseWebsocket, e.code || _node.default.Error.SCRIPT_FAILED, e.message || e, false, request.requestId);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsIm1heEFnZSIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwic3Vic2NyaWJlIiwib24iLCJjaGFubmVsIiwibWVzc2FnZVN0ciIsIm1lc3NhZ2UiLCJKU09OIiwicGFyc2UiLCJlIiwiZXJyb3IiLCJfaW5mbGF0ZVBhcnNlT2JqZWN0IiwiX29uQWZ0ZXJTYXZlIiwiX29uQWZ0ZXJEZWxldGUiLCJjdXJyZW50UGFyc2VPYmplY3QiLCJVc2VyUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsImNsYXNzTmFtZSIsInBhcnNlT2JqZWN0IiwiX2ZpbmlzaEZldGNoIiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImRlbGV0ZWRQYXJzZU9iamVjdCIsInRvSlNPTiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlkIiwic2l6ZSIsImNsYXNzU3Vic2NyaXB0aW9ucyIsImdldCIsImRlYnVnIiwic3Vic2NyaXB0aW9uIiwidmFsdWVzIiwiaXNTdWJzY3JpcHRpb25NYXRjaGVkIiwiX21hdGNoZXNTdWJzY3JpcHRpb24iLCJjbGllbnRJZCIsInJlcXVlc3RJZHMiLCJfIiwiZW50cmllcyIsImNsaWVudFJlcXVlc3RJZHMiLCJjbGllbnQiLCJmb3JFYWNoIiwicmVxdWVzdElkIiwiYWNsIiwiZ2V0QUNMIiwib3AiLCJfZ2V0Q0xQT3BlcmF0aW9uIiwicXVlcnkiLCJyZXMiLCJfbWF0Y2hlc0NMUCIsImlzTWF0Y2hlZCIsIl9tYXRjaGVzQUNMIiwiZXZlbnQiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3QiLCJ1c2VNYXN0ZXJLZXkiLCJoYXNNYXN0ZXJLZXkiLCJpbnN0YWxsYXRpb25JZCIsInNlbmRFdmVudCIsInRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJhdXRoRGF0YSIsInB1c2hEZWxldGUiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJwYXJzZVdlYlNvY2tldCIsImNvZGUiLCJFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJzdHJpbmdpZnkiLCJpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCIsImlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwib3JpZ2luYWxBQ0wiLCJjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlIiwiY3VycmVudEFDTCIsImlzT3JpZ2luYWxNYXRjaGVkIiwiaXNDdXJyZW50TWF0Y2hlZCIsImFsbCIsImhhc2giLCJ0eXBlIiwib3JpZ2luYWwiLCJmdW5jdGlvbk5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwicmVxdWVzdCIsInR2NCIsInZhbGlkYXRlIiwiUmVxdWVzdFNjaGVtYSIsIl9oYW5kbGVDb25uZWN0IiwiX2hhbmRsZVN1YnNjcmliZSIsIl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24iLCJfaGFuZGxlVW5zdWJzY3JpYmUiLCJpbmZvIiwiaGFzIiwiZGVsZXRlIiwic3Vic2NyaXB0aW9uSW5mbyIsInN1YnNjcmlwdGlvbkluZm9zIiwiZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uIiwiaGFzU3Vic2NyaWJpbmdDbGllbnQiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiZnJvbUNhY2hlIiwiYXV0aFByb21pc2UiLCJ0aGVuIiwidXNlcklkIiwiY2F0Y2giLCJyZXN1bHQiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJkZWwiLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiYWNsR3JvdXAiLCJwdXNoIiwiU2NoZW1hQ29udHJvbGxlciIsInZhbGlkYXRlUGVybWlzc2lvbiIsImxlbmd0aCIsIm9iamVjdElkIiwiX3ZlcmlmeUFDTCIsInRva2VuIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzb21lIiwic3RhcnRzV2l0aCIsInJvbGVOYW1lcyIsImdldFVzZXJSb2xlcyIsInJvbGUiLCJnZXRTZXNzaW9uRnJvbUNsaWVudCIsImdldFB1YmxpY1JlYWRBY2Nlc3MiLCJzdWJzY3JpcHRpb25Ub2tlbiIsImNsaWVudFNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZUtleXMiLCJfaGFzTWFzdGVyS2V5IiwicmVxIiwicHVzaENvbm5lY3QiLCJ2YWxpZEtleVBhaXJzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaXNWYWxpZCIsInNlY3JldCIsImF1dGhDYWxsZWQiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsImZpZWxkcyIsInNwbGl0Iiwid2hlcmUiLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJzdWJzY3JpcHRpb25IYXNoIiwiU3Vic2NyaXB0aW9uIiwiYWRkU3Vic2NyaXB0aW9uSW5mbyIsImFkZENsaWVudFN1YnNjcmlwdGlvbiIsInB1c2hTdWJzY3JpYmUiLCJub3RpZnlD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RixDQXFEdkY7O0FBQ0EsVUFBTWQsa0JBQWtCLEdBQUcsS0FBS3JELGFBQUwsQ0FBbUJzRCxHQUFuQixDQUF1QlYsU0FBdkIsQ0FBM0I7O0FBQ0EsUUFBSSxDQUFDWSxZQUFZLENBQUMwRSxvQkFBYixFQUFMLEVBQTBDO0FBQ3hDN0UsTUFBQUEsa0JBQWtCLENBQUN5RSxNQUFuQixDQUEwQnRFLFlBQVksQ0FBQ3FELElBQXZDO0FBQ0QsS0F6RHNGLENBMER2Rjs7O0FBQ0EsUUFBSXhELGtCQUFrQixDQUFDRCxJQUFuQixLQUE0QixDQUFoQyxFQUFtQztBQUNqQyxXQUFLcEQsYUFBTCxDQUFtQjhILE1BQW5CLENBQTBCbEYsU0FBMUI7QUFDRDs7QUFDRCw2Q0FBMEI7QUFDeEJxQixNQUFBQSxNQUR3QjtBQUV4QlksTUFBQUEsS0FBSyxFQUFFLGFBRmlCO0FBR3hCL0UsTUFBQUEsT0FBTyxFQUFFLEtBQUtBLE9BQUwsQ0FBYXNELElBSEU7QUFJeEJwRCxNQUFBQSxhQUFhLEVBQUUsS0FBS0EsYUFBTCxDQUFtQm9ELElBSlY7QUFLeEIwQixNQUFBQSxZQUFZLEVBQUVpRCxnQkFBZ0IsQ0FBQ2pELFlBTFA7QUFNeEJFLE1BQUFBLFlBQVksRUFBRWYsTUFBTSxDQUFDZ0IsWUFORztBQU94QkMsTUFBQUEsY0FBYyxFQUFFakIsTUFBTSxDQUFDaUI7QUFQQyxLQUExQjs7QUFVQSxRQUFJLENBQUN3RyxZQUFMLEVBQW1CO0FBQ2pCO0FBQ0Q7O0FBRUR6SCxJQUFBQSxNQUFNLENBQUMySCxlQUFQLENBQXVCeEUsT0FBTyxDQUFDakQsU0FBL0I7O0FBRUF6RCxvQkFBT0MsT0FBUCxDQUNHLGtCQUFpQmEsY0FBYyxDQUFDb0MsUUFBUyxvQkFBbUJ3RCxPQUFPLENBQUNqRCxTQUFVLEVBRGpGO0FBR0Q7O0FBLzRCd0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHY0IGZyb20gJ3R2NCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICcuL1N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBDbGllbnQgfSBmcm9tICcuL0NsaWVudCc7XG5pbXBvcnQgeyBQYXJzZVdlYlNvY2tldFNlcnZlciB9IGZyb20gJy4vUGFyc2VXZWJTb2NrZXRTZXJ2ZXInO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFJlcXVlc3RTY2hlbWEgZnJvbSAnLi9SZXF1ZXN0U2NoZW1hJztcbmltcG9ydCB7IG1hdGNoZXNRdWVyeSwgcXVlcnlIYXNoIH0gZnJvbSAnLi9RdWVyeVRvb2xzJztcbmltcG9ydCB7IFBhcnNlUHViU3ViIH0gZnJvbSAnLi9QYXJzZVB1YlN1Yic7XG5pbXBvcnQgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCB7IHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMsIGdldFRyaWdnZXIsIHJ1blRyaWdnZXIsIHRvSlNPTndpdGhPYmplY3RzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiwgQXV0aCB9IGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHsgZ2V0Q2FjaGVDb250cm9sbGVyIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IExSVSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IFVzZXJSb3V0ZXIgZnJvbSAnLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5cbmNsYXNzIFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIHtcbiAgY2xpZW50czogTWFwO1xuICAvLyBjbGFzc05hbWUgLT4gKHF1ZXJ5SGFzaCAtPiBzdWJzY3JpcHRpb24pXG4gIHN1YnNjcmlwdGlvbnM6IE9iamVjdDtcbiAgcGFyc2VXZWJTb2NrZXRTZXJ2ZXI6IE9iamVjdDtcbiAga2V5UGFpcnM6IGFueTtcbiAgLy8gVGhlIHN1YnNjcmliZXIgd2UgdXNlIHRvIGdldCBvYmplY3QgdXBkYXRlIGZyb20gcHVibGlzaGVyXG4gIHN1YnNjcmliZXI6IE9iamVjdDtcblxuICBjb25zdHJ1Y3RvcihzZXJ2ZXI6IGFueSwgY29uZmlnOiBhbnkgPSB7fSwgcGFyc2VTZXJ2ZXJDb25maWc6IGFueSA9IHt9KSB7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgdGhpcy5jbGllbnRzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIGNvbmZpZy5hcHBJZCA9IGNvbmZpZy5hcHBJZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgIGNvbmZpZy5tYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5IHx8IFBhcnNlLm1hc3RlcktleTtcblxuICAgIC8vIFN0b3JlIGtleXMsIGNvbnZlcnQgb2JqIHRvIG1hcFxuICAgIGNvbnN0IGtleVBhaXJzID0gY29uZmlnLmtleVBhaXJzIHx8IHt9O1xuICAgIHRoaXMua2V5UGFpcnMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoa2V5UGFpcnMpKSB7XG4gICAgICB0aGlzLmtleVBhaXJzLnNldChrZXksIGtleVBhaXJzW2tleV0pO1xuICAgIH1cbiAgICBsb2dnZXIudmVyYm9zZSgnU3VwcG9ydCBrZXkgcGFpcnMnLCB0aGlzLmtleVBhaXJzKTtcblxuICAgIC8vIEluaXRpYWxpemUgUGFyc2VcbiAgICBQYXJzZS5PYmplY3QuZGlzYWJsZVNpbmdsZUluc3RhbmNlKCk7XG4gICAgY29uc3Qgc2VydmVyVVJMID0gY29uZmlnLnNlcnZlclVSTCB8fCBQYXJzZS5zZXJ2ZXJVUkw7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuICAgIFBhcnNlLmluaXRpYWxpemUoY29uZmlnLmFwcElkLCBQYXJzZS5qYXZhU2NyaXB0S2V5LCBjb25maWcubWFzdGVyS2V5KTtcblxuICAgIC8vIFRoZSBjYWNoZSBjb250cm9sbGVyIGlzIGEgcHJvcGVyIGNhY2hlIGNvbnRyb2xsZXJcbiAgICAvLyB3aXRoIGFjY2VzcyB0byBVc2VyIGFuZCBSb2xlc1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gZ2V0Q2FjaGVDb250cm9sbGVyKHBhcnNlU2VydmVyQ29uZmlnKTtcblxuICAgIGNvbmZpZy5jYWNoZVRpbWVvdXQgPSBjb25maWcuY2FjaGVUaW1lb3V0IHx8IDUgKiAxMDAwOyAvLyA1c1xuXG4gICAgLy8gVGhpcyBhdXRoIGNhY2hlIHN0b3JlcyB0aGUgcHJvbWlzZXMgZm9yIGVhY2ggYXV0aCByZXNvbHV0aW9uLlxuICAgIC8vIFRoZSBtYWluIGJlbmVmaXQgaXMgdG8gYmUgYWJsZSB0byByZXVzZSB0aGUgc2FtZSB1c2VyIC8gc2Vzc2lvbiB0b2tlbiByZXNvbHV0aW9uLlxuICAgIHRoaXMuYXV0aENhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IDUwMCwgLy8gNTAwIGNvbmN1cnJlbnRcbiAgICAgIG1heEFnZTogY29uZmlnLmNhY2hlVGltZW91dCxcbiAgICB9KTtcbiAgICAvLyBJbml0aWFsaXplIHdlYnNvY2tldCBzZXJ2ZXJcbiAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyID0gbmV3IFBhcnNlV2ViU29ja2V0U2VydmVyKFxuICAgICAgc2VydmVyLFxuICAgICAgcGFyc2VXZWJzb2NrZXQgPT4gdGhpcy5fb25Db25uZWN0KHBhcnNlV2Vic29ja2V0KSxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBJbml0aWFsaXplIHN1YnNjcmliZXJcbiAgICB0aGlzLnN1YnNjcmliZXIgPSBQYXJzZVB1YlN1Yi5jcmVhdGVTdWJzY3JpYmVyKGNvbmZpZyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpO1xuICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpO1xuICAgIC8vIFJlZ2lzdGVyIG1lc3NhZ2UgaGFuZGxlciBmb3Igc3Vic2NyaWJlci4gV2hlbiBwdWJsaXNoZXIgZ2V0IG1lc3NhZ2VzLCBpdCB3aWxsIHB1Ymxpc2ggbWVzc2FnZVxuICAgIC8vIHRvIHRoZSBzdWJzY3JpYmVycyBhbmQgdGhlIGhhbmRsZXIgd2lsbCBiZSBjYWxsZWQuXG4gICAgdGhpcy5zdWJzY3JpYmVyLm9uKCdtZXNzYWdlJywgKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdTdWJzY3JpYmUgbWVzc2FnZSAlaicsIG1lc3NhZ2VTdHIpO1xuICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICB0cnkge1xuICAgICAgICBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlU3RyKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgbWVzc2FnZScsIG1lc3NhZ2VTdHIsIGUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLl9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZSk7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJTYXZlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyRGVsZXRlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgbWVzc2FnZSAlcyBmcm9tIHVua25vd24gY2hhbm5lbCAlaicsIG1lc3NhZ2UsIGNoYW5uZWwpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBKU09OIGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QgSlNPTi5cbiAgX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICAvLyBJbmZsYXRlIG1lcmdlZCBvYmplY3RcbiAgICBjb25zdCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMoY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBsZXQgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsZXQgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICAvLyBJbmZsYXRlIG9yaWdpbmFsIG9iamVjdFxuICAgIGNvbnN0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIGNsYXNzTmFtZSA9IG9yaWdpbmFsUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgICAgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2gob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyRGVsZXRlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgZGVsZXRlZFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlaiB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgZGVsZXRlZFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc1N1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKGRlbGV0ZWRQYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIGlmICghaXNTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIGNvbnN0IGFjbCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgIC8vIENoZWNrIENMUFxuICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBpc01hdGNoZWQgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgaWYgKCFpc01hdGNoZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiAnZGVsZXRlJyxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGRlbGV0ZWRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZWRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIChkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInIHx8XG4gICAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykgJiZcbiAgICAgICAgICAgICAgIWNsaWVudC5oYXNNYXN0ZXJLZXlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBkZWxldGUgZGVsZXRlZFBhcnNlT2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICAgICAgZGVsZXRlIGRlbGV0ZWRQYXJzZU9iamVjdC5hdXRoRGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNsaWVudC5wdXNoRGVsZXRlKHJlcXVlc3RJZCwgZGVsZXRlZFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgICAgY2xpZW50LnBhcnNlV2ViU29ja2V0LFxuICAgICAgICAgICAgICBlcnJvci5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3IsXG4gICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBsZXQgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlcyB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgY3VycmVudFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBjb25zdCBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgLy8gU2V0IG9yaWduYWwgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBpZiAoIWlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBvcmlnaW5hbEFDTDtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0wgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0wob3JpZ2luYWxBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gU2V0IGN1cnJlbnQgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICBpZiAoIWlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QUNMID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChjdXJyZW50QUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgW2lzT3JpZ2luYWxNYXRjaGVkLCBpc0N1cnJlbnRNYXRjaGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbE1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudE1hdGNoZWQsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5oYXNoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gRGVjaWRlIGV2ZW50IHR5cGVcbiAgICAgICAgICAgIGxldCB0eXBlO1xuICAgICAgICAgICAgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICd1cGRhdGUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiAhaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ2xlYXZlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2VudGVyJztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NyZWF0ZSc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogdHlwZSxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwpIHtcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9yaWdpbmFsKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwgJiYgdHlwZW9mIHJlcy5vcmlnaW5hbC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCxcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAoY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyB8fFxuICAgICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpICYmXG4gICAgICAgICAgICAgICFjbGllbnQuaGFzTWFzdGVyS2V5XG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgZGVsZXRlIGN1cnJlbnRQYXJzZU9iamVjdC5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgICAgIGRlbGV0ZSBvcmlnaW5hbFBhcnNlT2JqZWN0Py5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgICAgIGRlbGV0ZSBjdXJyZW50UGFyc2VPYmplY3QuYXV0aERhdGE7XG4gICAgICAgICAgICAgIGRlbGV0ZSBvcmlnaW5hbFBhcnNlT2JqZWN0Py5hdXRoRGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9ICdwdXNoJyArIHJlcy5ldmVudC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHJlcy5ldmVudC5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChjbGllbnRbZnVuY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgICBjbGllbnRbZnVuY3Rpb25OYW1lXShyZXF1ZXN0SWQsIGN1cnJlbnRQYXJzZU9iamVjdCwgb3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgICAgICAgIGNsaWVudC5wYXJzZVdlYlNvY2tldCxcbiAgICAgICAgICAgICAgZXJyb3IuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlIHx8IGVycm9yLFxuICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgcmVxdWVzdElkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55KTogdm9pZCB7XG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ21lc3NhZ2UnLCByZXF1ZXN0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShyZXF1ZXN0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIHJlcXVlc3QnLCByZXF1ZXN0LCBlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdSZXF1ZXN0OiAlaicsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBhIHZhbGlkIHJlcXVlc3QsIHJldHVybiBlcnJvciBkaXJlY3RseSBpZiBub3RcbiAgICAgIGlmIChcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hWydnZW5lcmFsJ10pIHx8XG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVtyZXF1ZXN0Lm9wXSlcbiAgICAgICkge1xuICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAxLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ29ubmVjdCBtZXNzYWdlIGVycm9yICVzJywgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocmVxdWVzdC5vcCkge1xuICAgICAgICBjYXNlICdjb25uZWN0JzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Vuc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMywgJ0dldCB1bmtub3duIG9wZXJhdGlvbicpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignR2V0IHVua25vd24gb3BlcmF0aW9uJywgcmVxdWVzdC5vcCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBwYXJzZVdlYnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5pbmZvKGBDbGllbnQgZGlzY29ubmVjdDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNvbnN0IGNsaWVudElkID0gcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQ7XG4gICAgICBpZiAoIXRoaXMuY2xpZW50cy5oYXMoY2xpZW50SWQpKSB7XG4gICAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdF9lcnJvcicsXG4gICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgZXJyb3I6IGBVbmFibGUgdG8gZmluZCBjbGllbnQgJHtjbGllbnRJZH1gLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBDYW4gbm90IGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9IG9uIGRpc2Nvbm5lY3RgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWxldGUgY2xpZW50XG4gICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgIHRoaXMuY2xpZW50cy5kZWxldGUoY2xpZW50SWQpO1xuXG4gICAgICAvLyBEZWxldGUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgZm9yIChjb25zdCBbcmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvXSBvZiBfLmVudHJpZXMoY2xpZW50LnN1YnNjcmlwdGlvbkluZm9zKSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICAgICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihjbGllbnRJZCwgcmVxdWVzdElkKTtcblxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudHMgJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBzdWJzY3JpcHRpb25zICVkJywgdGhpcy5zdWJzY3JpcHRpb25zLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KHBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW46ID9zdHJpbmcpOiBQcm9taXNlPHsgYXV0aDogP0F1dGgsIHVzZXJJZDogP3N0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbChzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIG9iamVjdDogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmdcbiAgKTogYW55IHtcbiAgICAvLyB0cnkgdG8gbWF0Y2ggb24gdXNlciBmaXJzdCwgbGVzcyBleHBlbnNpdmUgdGhhbiB3aXRoIHJvbGVzXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgdXNlcklkO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgRmFpbGVkIG1hdGNoaW5nIENMUCBmb3IgJHtvYmplY3QuaWR9ICR7dXNlcklkfSAke2V9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIFRPRE86IGhhbmRsZSByb2xlcyBwZXJtaXNzaW9uc1xuICAgIC8vIE9iamVjdC5rZXlzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICBjb25zdCBwZXJtID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zW2tleV07XG4gICAgLy8gICBPYmplY3Qua2V5cyhwZXJtKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgICAgaWYgKGtleS5pbmRleE9mKCdyb2xlJykpXG4gICAgLy8gICB9KTtcbiAgICAvLyB9KVxuICAgIC8vIC8vIGl0J3MgcmVqZWN0ZWQgaGVyZSwgY2hlY2sgdGhlIHJvbGVzXG4gICAgLy8gdmFyIHJvbGVzUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSk7XG4gICAgLy8gcm9sZXNRdWVyeS5lcXVhbFRvKFwidXNlcnNcIiwgdXNlcik7XG4gICAgLy8gcmV0dXJuIHJvbGVzUXVlcnkuZmluZCh7dXNlTWFzdGVyS2V5OnRydWV9KTtcbiAgfVxuXG4gIF9nZXRDTFBPcGVyYXRpb24ocXVlcnk6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YgcXVlcnkgPT09ICdvYmplY3QnICYmXG4gICAgICBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09IDEgJiZcbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZydcbiAgICAgID8gJ2dldCdcbiAgICAgIDogJ2ZpbmQnO1xuICB9XG5cbiAgYXN5bmMgX3ZlcmlmeUFDTChhY2w6IGFueSwgdG9rZW46IHN0cmluZykge1xuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGF1dGgsIHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHRva2VuKTtcblxuICAgIC8vIEdldHRpbmcgdGhlIHNlc3Npb24gdG9rZW4gZmFpbGVkXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IG5vIGFkZGl0aW9uYWwgYXV0aCBpcyBhdmFpbGFibGVcbiAgICAvLyBBdCB0aGlzIHBvaW50LCBqdXN0IGJhaWwgb3V0IGFzIG5vIGFkZGl0aW9uYWwgdmlzaWJpbGl0eSBjYW4gYmUgaW5mZXJyZWQuXG4gICAgaWYgKCFhdXRoIHx8ICF1c2VySWQpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkID0gYWNsLmdldFJlYWRBY2Nlc3ModXNlcklkKTtcbiAgICBpZiAoaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGUgdXNlciBoYXMgYW55IHJvbGVzIHRoYXQgbWF0Y2ggdGhlIEFDTFxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBSZXNvbHZlIGZhbHNlIHJpZ2h0IGF3YXkgaWYgdGhlIGFjbCBkb2Vzbid0IGhhdmUgYW55IHJvbGVzXG4gICAgICAgIGNvbnN0IGFjbF9oYXNfcm9sZXMgPSBPYmplY3Qua2V5cyhhY2wucGVybWlzc2lvbnNCeUlkKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSk7XG4gICAgICAgIGlmICghYWNsX2hhc19yb2xlcykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyLCBzZXNzaW9uVG9rZW46IHN0cmluZykge1xuICAgIGNvbnN0IGdldFNlc3Npb25Gcm9tQ2xpZW50ID0gKCkgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuIHx8IGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgfTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgc2Vzc2lvblRva2VuID0gZ2V0U2Vzc2lvbkZyb21DbGllbnQoKTtcbiAgICB9XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgICByZXR1cm4gYXV0aDtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQUNMKGFjbDogYW55LCBjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyBSZXR1cm4gdHJ1ZSBkaXJlY3RseSBpZiBBQ0wgaXNuJ3QgcHJlc2VudCwgQUNMIGlzIHB1YmxpYyByZWFkLCBvciBjbGllbnQgaGFzIG1hc3RlciBrZXlcbiAgICBpZiAoIWFjbCB8fCBhY2wuZ2V0UHVibGljUmVhZEFjY2VzcygpIHx8IGNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBzdWJzY3JpcHRpb24gc2Vzc2lvblRva2VuIG1hdGNoZXMgQUNMIGZpcnN0XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvblRva2VuID0gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW47XG4gICAgY29uc3QgY2xpZW50U2Vzc2lvblRva2VuID0gY2xpZW50LnNlc3Npb25Ub2tlbjtcblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBzdWJzY3JpcHRpb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBjbGllbnRTZXNzaW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIGlmICghdGhpcy5fdmFsaWRhdGVLZXlzKHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCA0LCAnS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBoYXNNYXN0ZXJLZXkgPSB0aGlzLl9oYXNNYXN0ZXJLZXkocmVxdWVzdCwgdGhpcy5rZXlQYWlycyk7XG4gICAgY29uc3QgY2xpZW50SWQgPSB1dWlkdjQoKTtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KFxuICAgICAgY2xpZW50SWQsXG4gICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgIGhhc01hc3RlcktleSxcbiAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgcmVxdWVzdC5pbnN0YWxsYXRpb25JZFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcSA9IHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcXVlc3QuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9O1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoJ0BDb25uZWN0JywgJ2JlZm9yZUNvbm5lY3QnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcS5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXEudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVDb25uZWN0LkBDb25uZWN0YCwgcmVxLCBhdXRoKTtcbiAgICAgIH1cbiAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkID0gY2xpZW50SWQ7XG4gICAgICB0aGlzLmNsaWVudHMuc2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCBjbGllbnQpO1xuICAgICAgbG9nZ2VyLmluZm8oYENyZWF0ZSBuZXcgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY2xpZW50LnB1c2hDb25uZWN0KCk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHJlcSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICBlcnJvci5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3IsXG4gICAgICAgIGZhbHNlXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlQ29ubmVjdCBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYXNNYXN0ZXJLZXkocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDAgfHwgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXJlcXVlc3QgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC5xdWVyeS5jbGFzc05hbWU7XG4gICAgbGV0IGF1dGhDYWxsZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYmVmb3JlU3Vic2NyaWJlJywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gICAgICAgIHBhcnNlUXVlcnkud2l0aEpTT04ocmVxdWVzdC5xdWVyeSk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVTdWJzY3JpYmUuJHtjbGFzc05hbWV9YCwgcmVxdWVzdCwgYXV0aCk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXF1ZXN0LnF1ZXJ5LnRvSlNPTigpO1xuICAgICAgICBpZiAocXVlcnkua2V5cykge1xuICAgICAgICAgIHF1ZXJ5LmZpZWxkcyA9IHF1ZXJ5LmtleXMuc3BsaXQoJywnKTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgaWYgKCFhdXRoQ2FsbGVkKSB7XG4gICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoXG4gICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZCxcbiAgICAgICAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3QudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUudXNlciA9IHJlcXVlc3QudXNlci50b1BvaW50ZXIoKTtcbiAgICAgICAgfSBlbHNlIGlmICghcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWRcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gR2V0IHN1YnNjcmlwdGlvbiBmcm9tIHN1YnNjcmlwdGlvbnMsIGNyZWF0ZSBvbmUgaWYgbmVjZXNzYXJ5XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25IYXNoID0gcXVlcnlIYXNoKHJlcXVlc3QucXVlcnkpO1xuICAgICAgLy8gQWRkIGNsYXNzTmFtZSB0byBzdWJzY3JpcHRpb25zIGlmIG5lY2Vzc2FyeVxuXG4gICAgICBpZiAoIXRoaXMuc3Vic2NyaXB0aW9ucy5oYXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzTmFtZSwgbmV3IE1hcCgpKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICAgIGxldCBzdWJzY3JpcHRpb247XG4gICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLmhhcyhzdWJzY3JpcHRpb25IYXNoKSkge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBjbGFzc1N1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gbmV3IFN1YnNjcmlwdGlvbihjbGFzc05hbWUsIHJlcXVlc3QucXVlcnkud2hlcmUsIHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuc2V0KHN1YnNjcmlwdGlvbkhhc2gsIHN1YnNjcmlwdGlvbik7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBzdWJzY3JpcHRpb25JbmZvIHRvIGNsaWVudFxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb24sXG4gICAgICB9O1xuICAgICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5maWVsZHMpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5maWVsZHMgPSByZXF1ZXN0LnF1ZXJ5LmZpZWxkcztcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnNlc3Npb25Ub2tlbikge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiA9IHJlcXVlc3Quc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgY2xpZW50LmFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdC5yZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuXG4gICAgICAvLyBBZGQgY2xpZW50SWQgdG8gc3Vic2NyaXB0aW9uXG4gICAgICBzdWJzY3JpcHRpb24uYWRkQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGNsaWVudC5wdXNoU3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgIGBDcmVhdGUgY2xpZW50ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IG5ldyBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXI6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdzdWJzY3JpYmUnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICBlLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgZS5tZXNzYWdlIHx8IGUsXG4gICAgICAgIGZhbHNlLFxuICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZVN1YnNjcmliZSBvbiAke2NsYXNzTmFtZX0gZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCwgZmFsc2UpO1xuICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gIH1cblxuICBfaGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55LCBub3RpZnlDbGllbnQ6IGJvb2xlYW4gPSB0cnVlKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIW5vdGlmeUNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNsaWVudC5wdXNoVW5zdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICBgRGVsZXRlIGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gfCBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfTtcbiJdfQ==
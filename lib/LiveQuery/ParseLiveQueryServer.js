'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseLiveQueryServer = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _tv = require('tv4');

var _tv2 = _interopRequireDefault(_tv);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _Subscription = require('./Subscription');

var _Client = require('./Client');

var _ParseWebSocketServer = require('./ParseWebSocketServer');

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

var _RequestSchema = require('./RequestSchema');

var _RequestSchema2 = _interopRequireDefault(_RequestSchema);

var _QueryTools = require('./QueryTools');

var _ParsePubSub = require('./ParsePubSub');

var _SessionTokenCache = require('./SessionTokenCache');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ParseLiveQueryServer = function () {
  // className -> (queryHash -> subscription)
  function ParseLiveQueryServer(server, config) {
    var _this = this;

    _classCallCheck(this, ParseLiveQueryServer);

    this.clientId = 0;
    this.clients = new Map();
    this.subscriptions = new Map();

    config = config || {};

    // Store keys, convert obj to map
    var keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = Object.keys(keyPairs)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var key = _step.value;

        this.keyPairs.set(key, keyPairs[key]);
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    _logger2.default.verbose('Support key pairs', this.keyPairs);

    // Initialize Parse
    _node2.default.Object.disableSingleInstance();

    var serverURL = config.serverURL || _node2.default.serverURL;
    _node2.default.serverURL = serverURL;
    var appId = config.appId || _node2.default.applicationId;
    var javascriptKey = _node2.default.javaScriptKey;
    var masterKey = config.masterKey || _node2.default.masterKey;
    _node2.default.initialize(appId, javascriptKey, masterKey);

    // Initialize websocket server
    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, function (parseWebsocket) {
      return _this._onConnect(parseWebsocket);
    }, config.websocketTimeout);

    // Initialize subscriber
    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(_node2.default.applicationId + 'afterSave');
    this.subscriber.subscribe(_node2.default.applicationId + 'afterDelete');
    // Register message handler for subscriber. When publisher get messages, it will publish message
    // to the subscribers and the handler will be called.
    this.subscriber.on('message', function (channel, messageStr) {
      _logger2.default.verbose('Subscribe messsage %j', messageStr);
      var message = void 0;
      try {
        message = JSON.parse(messageStr);
      } catch (e) {
        _logger2.default.error('unable to parse message', messageStr, e);
        return;
      }
      _this._inflateParseObject(message);
      if (channel === _node2.default.applicationId + 'afterSave') {
        _this._onAfterSave(message);
      } else if (channel === _node2.default.applicationId + 'afterDelete') {
        _this._onAfterDelete(message);
      } else {
        _logger2.default.error('Get message %s from unknown channel %j', message, channel);
      }
    });

    // Initialize sessionToken cache
    this.sessionTokenCache = new _SessionTokenCache.SessionTokenCache(config.cacheTimeout);
  }

  // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.

  // The subscriber we use to get object update from publisher


  _createClass(ParseLiveQueryServer, [{
    key: '_inflateParseObject',
    value: function _inflateParseObject(message) {
      // Inflate merged object
      var currentParseObject = message.currentParseObject;
      var className = currentParseObject.className;
      var parseObject = new _node2.default.Object(className);
      parseObject._finishFetch(currentParseObject);
      message.currentParseObject = parseObject;
      // Inflate original object
      var originalParseObject = message.originalParseObject;
      if (originalParseObject) {
        className = originalParseObject.className;
        parseObject = new _node2.default.Object(className);
        parseObject._finishFetch(originalParseObject);
        message.originalParseObject = parseObject;
      }
    }

    // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
    // Message.originalParseObject is the original ParseObject.

  }, {
    key: '_onAfterDelete',
    value: function _onAfterDelete(message) {
      var _this2 = this;

      _logger2.default.verbose(_node2.default.applicationId + 'afterDelete is triggered');

      var deletedParseObject = message.currentParseObject.toJSON();
      var className = deletedParseObject.className;
      _logger2.default.verbose('ClassName: %j | ObjectId: %s', className, deletedParseObject.id);
      _logger2.default.verbose('Current client number : %d', this.clients.size);

      var classSubscriptions = this.subscriptions.get(className);
      if (typeof classSubscriptions === 'undefined') {
        _logger2.default.debug('Can not find subscriptions under this class ' + className);
        return;
      }
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = classSubscriptions.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var subscription = _step2.value;

          var isSubscriptionMatched = this._matchesSubscription(deletedParseObject, subscription);
          if (!isSubscriptionMatched) {
            continue;
          }
          var _iteratorNormalCompletion3 = true;
          var _didIteratorError3 = false;
          var _iteratorError3 = undefined;

          try {
            var _loop = function _loop() {
              var _step3$value = _slicedToArray(_step3.value, 2),
                  clientId = _step3$value[0],
                  requestIds = _step3$value[1];

              var client = _this2.clients.get(clientId);
              if (typeof client === 'undefined') {
                return 'continue';
              }
              var _iteratorNormalCompletion4 = true;
              var _didIteratorError4 = false;
              var _iteratorError4 = undefined;

              try {
                var _loop2 = function _loop2() {
                  var requestId = _step4.value;

                  var acl = message.currentParseObject.getACL();
                  // Check ACL
                  _this2._matchesACL(acl, client, requestId).then(function (isMatched) {
                    if (!isMatched) {
                      return null;
                    }
                    client.pushDelete(requestId, deletedParseObject);
                  }, function (error) {
                    _logger2.default.error('Matching ACL error : ', error);
                  });
                };

                for (var _iterator4 = requestIds[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                  _loop2();
                }
              } catch (err) {
                _didIteratorError4 = true;
                _iteratorError4 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion4 && _iterator4.return) {
                    _iterator4.return();
                  }
                } finally {
                  if (_didIteratorError4) {
                    throw _iteratorError4;
                  }
                }
              }
            };

            for (var _iterator3 = _lodash2.default.entries(subscription.clientRequestIds)[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
              var _ret = _loop();

              if (_ret === 'continue') continue;
            }
          } catch (err) {
            _didIteratorError3 = true;
            _iteratorError3 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion3 && _iterator3.return) {
                _iterator3.return();
              }
            } finally {
              if (_didIteratorError3) {
                throw _iteratorError3;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }
    }

    // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
    // Message.originalParseObject is the original ParseObject.

  }, {
    key: '_onAfterSave',
    value: function _onAfterSave(message) {
      var _this3 = this;

      _logger2.default.verbose(_node2.default.applicationId + 'afterSave is triggered');

      var originalParseObject = null;
      if (message.originalParseObject) {
        originalParseObject = message.originalParseObject.toJSON();
      }
      var currentParseObject = message.currentParseObject.toJSON();
      var className = currentParseObject.className;
      _logger2.default.verbose('ClassName: %s | ObjectId: %s', className, currentParseObject.id);
      _logger2.default.verbose('Current client number : %d', this.clients.size);

      var classSubscriptions = this.subscriptions.get(className);
      if (typeof classSubscriptions === 'undefined') {
        _logger2.default.debug('Can not find subscriptions under this class ' + className);
        return;
      }
      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        var _loop3 = function _loop3() {
          var subscription = _step5.value;

          var isOriginalSubscriptionMatched = _this3._matchesSubscription(originalParseObject, subscription);
          var isCurrentSubscriptionMatched = _this3._matchesSubscription(currentParseObject, subscription);
          var _iteratorNormalCompletion6 = true;
          var _didIteratorError6 = false;
          var _iteratorError6 = undefined;

          try {
            var _loop4 = function _loop4() {
              var _step6$value = _slicedToArray(_step6.value, 2),
                  clientId = _step6$value[0],
                  requestIds = _step6$value[1];

              var client = _this3.clients.get(clientId);
              if (typeof client === 'undefined') {
                return 'continue';
              }
              var _iteratorNormalCompletion7 = true;
              var _didIteratorError7 = false;
              var _iteratorError7 = undefined;

              try {
                var _loop5 = function _loop5() {
                  var requestId = _step7.value;

                  // Set orignal ParseObject ACL checking promise, if the object does not match
                  // subscription, we do not need to check ACL
                  var originalACLCheckingPromise = void 0;
                  if (!isOriginalSubscriptionMatched) {
                    originalACLCheckingPromise = _node2.default.Promise.as(false);
                  } else {
                    var originalACL = void 0;
                    if (message.originalParseObject) {
                      originalACL = message.originalParseObject.getACL();
                    }
                    originalACLCheckingPromise = _this3._matchesACL(originalACL, client, requestId);
                  }
                  // Set current ParseObject ACL checking promise, if the object does not match
                  // subscription, we do not need to check ACL
                  var currentACLCheckingPromise = void 0;
                  if (!isCurrentSubscriptionMatched) {
                    currentACLCheckingPromise = _node2.default.Promise.as(false);
                  } else {
                    var currentACL = message.currentParseObject.getACL();
                    currentACLCheckingPromise = _this3._matchesACL(currentACL, client, requestId);
                  }

                  _node2.default.Promise.when(originalACLCheckingPromise, currentACLCheckingPromise).then(function (isOriginalMatched, isCurrentMatched) {
                    _logger2.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', originalParseObject, currentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash);

                    // Decide event type
                    var type = void 0;
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
                    var functionName = 'push' + type;
                    client[functionName](requestId, currentParseObject);
                  }, function (error) {
                    _logger2.default.error('Matching ACL error : ', error);
                  });
                };

                for (var _iterator7 = requestIds[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                  _loop5();
                }
              } catch (err) {
                _didIteratorError7 = true;
                _iteratorError7 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion7 && _iterator7.return) {
                    _iterator7.return();
                  }
                } finally {
                  if (_didIteratorError7) {
                    throw _iteratorError7;
                  }
                }
              }
            };

            for (var _iterator6 = _lodash2.default.entries(subscription.clientRequestIds)[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
              var _ret4 = _loop4();

              if (_ret4 === 'continue') continue;
            }
          } catch (err) {
            _didIteratorError6 = true;
            _iteratorError6 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion6 && _iterator6.return) {
                _iterator6.return();
              }
            } finally {
              if (_didIteratorError6) {
                throw _iteratorError6;
              }
            }
          }
        };

        for (var _iterator5 = classSubscriptions.values()[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
          _loop3();
        }
      } catch (err) {
        _didIteratorError5 = true;
        _iteratorError5 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion5 && _iterator5.return) {
            _iterator5.return();
          }
        } finally {
          if (_didIteratorError5) {
            throw _iteratorError5;
          }
        }
      }
    }
  }, {
    key: '_onConnect',
    value: function _onConnect(parseWebsocket) {
      var _this4 = this;

      parseWebsocket.on('message', function (request) {
        if (typeof request === 'string') {
          try {
            request = JSON.parse(request);
          } catch (e) {
            _logger2.default.error('unable to parse request', request, e);
            return;
          }
        }
        _logger2.default.verbose('Request: %j', request);

        // Check whether this request is a valid request, return error directly if not
        if (!_tv2.default.validate(request, _RequestSchema2.default['general']) || !_tv2.default.validate(request, _RequestSchema2.default[request.op])) {
          _Client.Client.pushError(parseWebsocket, 1, _tv2.default.error.message);
          _logger2.default.error('Connect message error %s', _tv2.default.error.message);
          return;
        }

        switch (request.op) {
          case 'connect':
            _this4._handleConnect(parseWebsocket, request);
            break;
          case 'subscribe':
            _this4._handleSubscribe(parseWebsocket, request);
            break;
          case 'update':
            _this4._handleUpdateSubscription(parseWebsocket, request);
            break;
          case 'unsubscribe':
            _this4._handleUnsubscribe(parseWebsocket, request);
            break;
          default:
            _Client.Client.pushError(parseWebsocket, 3, 'Get unknown operation');
            _logger2.default.error('Get unknown operation', request.op);
        }
      });

      parseWebsocket.on('disconnect', function () {
        _logger2.default.info('Client disconnect: %d', parseWebsocket.clientId);
        var clientId = parseWebsocket.clientId;
        if (!_this4.clients.has(clientId)) {
          _logger2.default.error('Can not find client %d on disconnect', clientId);
          return;
        }

        // Delete client
        var client = _this4.clients.get(clientId);
        _this4.clients.delete(clientId);

        // Delete client from subscriptions
        var _iteratorNormalCompletion8 = true;
        var _didIteratorError8 = false;
        var _iteratorError8 = undefined;

        try {
          for (var _iterator8 = _lodash2.default.entries(client.subscriptionInfos)[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
            var _step8$value = _slicedToArray(_step8.value, 2),
                _requestId = _step8$value[0],
                subscriptionInfo = _step8$value[1];

            var _subscription = subscriptionInfo.subscription;
            _subscription.deleteClientSubscription(clientId, _requestId);

            // If there is no client which is subscribing this subscription, remove it from subscriptions
            var classSubscriptions = _this4.subscriptions.get(_subscription.className);
            if (!_subscription.hasSubscribingClient()) {
              classSubscriptions.delete(_subscription.hash);
            }
            // If there is no subscriptions under this class, remove it from subscriptions
            if (classSubscriptions.size === 0) {
              _this4.subscriptions.delete(_subscription.className);
            }
          }
        } catch (err) {
          _didIteratorError8 = true;
          _iteratorError8 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion8 && _iterator8.return) {
              _iterator8.return();
            }
          } finally {
            if (_didIteratorError8) {
              throw _iteratorError8;
            }
          }
        }

        _logger2.default.verbose('Current clients %d', _this4.clients.size);
        _logger2.default.verbose('Current subscriptions %d', _this4.subscriptions.size);
      });
    }
  }, {
    key: '_matchesSubscription',
    value: function _matchesSubscription(parseObject, subscription) {
      // Object is undefined or null, not match
      if (!parseObject) {
        return false;
      }
      return (0, _QueryTools.matchesQuery)(parseObject, subscription.query);
    }
  }, {
    key: '_matchesACL',
    value: function _matchesACL(acl, client, requestId) {
      var _this5 = this;

      // If ACL is undefined or null, or ACL has public read access, return true directly
      if (!acl || acl.getPublicReadAccess()) {
        return _node2.default.Promise.as(true);
      }
      // Check subscription sessionToken matches ACL first
      var subscriptionInfo = client.getSubscriptionInfo(requestId);
      if (typeof subscriptionInfo === 'undefined') {
        return _node2.default.Promise.as(false);
      }

      var subscriptionSessionToken = subscriptionInfo.sessionToken;
      return this.sessionTokenCache.getUserId(subscriptionSessionToken).then(function (userId) {
        return acl.getReadAccess(userId);
      }).then(function (isSubscriptionSessionTokenMatched) {
        if (isSubscriptionSessionTokenMatched) {
          return _node2.default.Promise.as(true);
        }

        // Check if the user has any roles that match the ACL
        return new _node2.default.Promise(function (resolve, reject) {

          // Resolve false right away if the acl doesn't have any roles
          var acl_has_roles = Object.keys(acl.permissionsById).some(function (key) {
            return key.startsWith("role:");
          });
          if (!acl_has_roles) {
            return resolve(false);
          }

          _this5.sessionTokenCache.getUserId(subscriptionSessionToken).then(function (userId) {

            // Pass along a null if there is no user id
            if (!userId) {
              return _node2.default.Promise.as(null);
            }

            // Prepare a user object to query for roles
            // To eliminate a query for the user, create one locally with the id
            var user = new _node2.default.User();
            user.id = userId;
            return user;
          }).then(function (user) {

            // Pass along an empty array (of roles) if no user
            if (!user) {
              return _node2.default.Promise.as([]);
            }

            // Then get the user's roles
            var rolesQuery = new _node2.default.Query(_node2.default.Role);
            rolesQuery.equalTo("users", user);
            return rolesQuery.find({ useMasterKey: true });
          }).then(function (roles) {

            // Finally, see if any of the user's roles allow them read access
            var _iteratorNormalCompletion9 = true;
            var _didIteratorError9 = false;
            var _iteratorError9 = undefined;

            try {
              for (var _iterator9 = roles[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                var role = _step9.value;

                if (acl.getRoleReadAccess(role)) {
                  return resolve(true);
                }
              }
            } catch (err) {
              _didIteratorError9 = true;
              _iteratorError9 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion9 && _iterator9.return) {
                  _iterator9.return();
                }
              } finally {
                if (_didIteratorError9) {
                  throw _iteratorError9;
                }
              }
            }

            resolve(false);
          }).catch(function (error) {
            reject(error);
          });
        });
      }).then(function (isRoleMatched) {

        if (isRoleMatched) {
          return _node2.default.Promise.as(true);
        }

        // Check client sessionToken matches ACL
        var clientSessionToken = client.sessionToken;
        return _this5.sessionTokenCache.getUserId(clientSessionToken).then(function (userId) {
          return acl.getReadAccess(userId);
        });
      }).then(function (isMatched) {
        return _node2.default.Promise.as(isMatched);
      }, function () {
        return _node2.default.Promise.as(false);
      });
    }
  }, {
    key: '_handleConnect',
    value: function _handleConnect(parseWebsocket, request) {
      if (!this._validateKeys(request, this.keyPairs)) {
        _Client.Client.pushError(parseWebsocket, 4, 'Key in request is not valid');
        _logger2.default.error('Key in request is not valid');
        return;
      }
      var client = new _Client.Client(this.clientId, parseWebsocket);
      parseWebsocket.clientId = this.clientId;
      this.clientId += 1;
      this.clients.set(parseWebsocket.clientId, client);
      _logger2.default.info('Create new client: %d', parseWebsocket.clientId);
      client.pushConnect();
    }
  }, {
    key: '_validateKeys',
    value: function _validateKeys(request, validKeyPairs) {
      if (!validKeyPairs || validKeyPairs.size == 0) {
        return true;
      }
      var isValid = false;
      var _iteratorNormalCompletion10 = true;
      var _didIteratorError10 = false;
      var _iteratorError10 = undefined;

      try {
        for (var _iterator10 = validKeyPairs[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
          var _step10$value = _slicedToArray(_step10.value, 2),
              key = _step10$value[0],
              secret = _step10$value[1];

          if (!request[key] || request[key] !== secret) {
            continue;
          }
          isValid = true;
          break;
        }
      } catch (err) {
        _didIteratorError10 = true;
        _iteratorError10 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion10 && _iterator10.return) {
            _iterator10.return();
          }
        } finally {
          if (_didIteratorError10) {
            throw _iteratorError10;
          }
        }
      }

      return isValid;
    }
  }, {
    key: '_handleSubscribe',
    value: function _handleSubscribe(parseWebsocket, request) {
      // If we can not find this client, return error to client
      if (!parseWebsocket.hasOwnProperty('clientId')) {
        _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before subscribing');
        _logger2.default.error('Can not find this client, make sure you connect to server before subscribing');
        return;
      }
      var client = this.clients.get(parseWebsocket.clientId);

      // Get subscription from subscriptions, create one if necessary
      var subscriptionHash = (0, _QueryTools.queryHash)(request.query);
      // Add className to subscriptions if necessary
      var className = request.query.className;
      if (!this.subscriptions.has(className)) {
        this.subscriptions.set(className, new Map());
      }
      var classSubscriptions = this.subscriptions.get(className);
      var subscription = void 0;
      if (classSubscriptions.has(subscriptionHash)) {
        subscription = classSubscriptions.get(subscriptionHash);
      } else {
        subscription = new _Subscription.Subscription(className, request.query.where, subscriptionHash);
        classSubscriptions.set(subscriptionHash, subscription);
      }

      // Add subscriptionInfo to client
      var subscriptionInfo = {
        subscription: subscription
      };
      // Add selected fields and sessionToken for this subscription if necessary
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

      _logger2.default.verbose('Create client %d new subscription: %d', parseWebsocket.clientId, request.requestId);
      _logger2.default.verbose('Current client number: %d', this.clients.size);
    }
  }, {
    key: '_handleUpdateSubscription',
    value: function _handleUpdateSubscription(parseWebsocket, request) {
      this._handleUnsubscribe(parseWebsocket, request, false);
      this._handleSubscribe(parseWebsocket, request);
    }
  }, {
    key: '_handleUnsubscribe',
    value: function _handleUnsubscribe(parseWebsocket, request) {
      var notifyClient = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;

      // If we can not find this client, return error to client
      if (!parseWebsocket.hasOwnProperty('clientId')) {
        _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before unsubscribing');
        _logger2.default.error('Can not find this client, make sure you connect to server before unsubscribing');
        return;
      }
      var requestId = request.requestId;
      var client = this.clients.get(parseWebsocket.clientId);
      if (typeof client === 'undefined') {
        _Client.Client.pushError(parseWebsocket, 2, 'Cannot find client with clientId ' + parseWebsocket.clientId + '. Make sure you connect to live query server before unsubscribing.');
        _logger2.default.error('Can not find this client ' + parseWebsocket.clientId);
        return;
      }

      var subscriptionInfo = client.getSubscriptionInfo(requestId);
      if (typeof subscriptionInfo === 'undefined') {
        _Client.Client.pushError(parseWebsocket, 2, 'Cannot find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId + '. Make sure you subscribe to live query server before unsubscribing.');
        _logger2.default.error('Can not find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId);
        return;
      }

      // Remove subscription from client
      client.deleteSubscriptionInfo(requestId);
      // Remove client from subscription
      var subscription = subscriptionInfo.subscription;
      var className = subscription.className;
      subscription.deleteClientSubscription(parseWebsocket.clientId, requestId);
      // If there is no client which is subscribing this subscription, remove it from subscriptions
      var classSubscriptions = this.subscriptions.get(className);
      if (!subscription.hasSubscribingClient()) {
        classSubscriptions.delete(subscription.hash);
      }
      // If there is no subscriptions under this class, remove it from subscriptions
      if (classSubscriptions.size === 0) {
        this.subscriptions.delete(className);
      }

      if (!notifyClient) {
        return;
      }

      client.pushUnsubscribe(request.requestId);

      _logger2.default.verbose('Delete client: %d | subscription: %d', parseWebsocket.clientId, request.requestId);
    }
  }]);

  return ParseLiveQueryServer;
}();

exports.ParseLiveQueryServer = ParseLiveQueryServer;
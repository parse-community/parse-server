'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Client = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var dafaultFields = ['className', 'objectId', 'updatedAt', 'createdAt', 'ACL'];

var Client = function () {
  function Client(id, parseWebSocket) {
    _classCallCheck(this, Client);

    this.id = id;
    this.parseWebSocket = parseWebSocket;
    this.roles = [];
    this.subscriptionInfos = new Map();
    this.pushConnect = this._pushEvent('connected');
    this.pushSubscribe = this._pushEvent('subscribed');
    this.pushUnsubscribe = this._pushEvent('unsubscribed');
    this.pushCreate = this._pushEvent('create');
    this.pushEnter = this._pushEvent('enter');
    this.pushUpdate = this._pushEvent('update');
    this.pushDelete = this._pushEvent('delete');
    this.pushLeave = this._pushEvent('leave');
  }

  _createClass(Client, [{
    key: 'addSubscriptionInfo',
    value: function addSubscriptionInfo(requestId, subscriptionInfo) {
      this.subscriptionInfos.set(requestId, subscriptionInfo);
    }
  }, {
    key: 'getSubscriptionInfo',
    value: function getSubscriptionInfo(requestId) {
      return this.subscriptionInfos.get(requestId);
    }
  }, {
    key: 'deleteSubscriptionInfo',
    value: function deleteSubscriptionInfo(requestId) {
      return this.subscriptionInfos.delete(requestId);
    }
  }, {
    key: '_pushEvent',
    value: function _pushEvent(type) {
      return function (subscriptionId, parseObjectJSON) {
        var response = {
          'op': type,
          'clientId': this.id
        };
        if (typeof subscriptionId !== 'undefined') {
          response['requestId'] = subscriptionId;
        }
        if (typeof parseObjectJSON !== 'undefined') {
          var fields = void 0;
          if (this.subscriptionInfos.has(subscriptionId)) {
            fields = this.subscriptionInfos.get(subscriptionId).fields;
          }
          response['object'] = this._toJSONWithFields(parseObjectJSON, fields);
        }
        Client.pushResponse(this.parseWebSocket, JSON.stringify(response));
      };
    }
  }, {
    key: '_toJSONWithFields',
    value: function _toJSONWithFields(parseObjectJSON, fields) {
      if (!fields) {
        return parseObjectJSON;
      }
      var limitedParseObject = {};
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = dafaultFields[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var field = _step.value;

          limitedParseObject[field] = parseObjectJSON[field];
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

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = fields[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var _field = _step2.value;

          if (_field in parseObjectJSON) {
            limitedParseObject[_field] = parseObjectJSON[_field];
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

      return limitedParseObject;
    }
  }], [{
    key: 'pushResponse',
    value: function pushResponse(parseWebSocket, message) {
      _logger2.default.verbose('Push Response : %j', message);
      parseWebSocket.send(message);
    }
  }, {
    key: 'pushError',
    value: function pushError(parseWebSocket, code, error) {
      var reconnect = arguments.length <= 3 || arguments[3] === undefined ? true : arguments[3];

      Client.pushResponse(parseWebSocket, JSON.stringify({
        'op': 'error',
        'error': error,
        'code': code,
        'reconnect': reconnect
      }));
    }
  }]);

  return Client;
}();

exports.Client = Client;
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Subscription = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Subscription = function () {
  // It is query condition eg query.where
  function Subscription(className, query, queryHash) {
    _classCallCheck(this, Subscription);

    this.className = className;
    this.query = query;
    this.hash = queryHash;
    this.clientRequestIds = new Map();
  }

  _createClass(Subscription, [{
    key: 'addClientSubscription',
    value: function addClientSubscription(clientId, requestId) {
      if (!this.clientRequestIds.has(clientId)) {
        this.clientRequestIds.set(clientId, []);
      }
      var requestIds = this.clientRequestIds.get(clientId);
      requestIds.push(requestId);
    }
  }, {
    key: 'deleteClientSubscription',
    value: function deleteClientSubscription(clientId, requestId) {
      var requestIds = this.clientRequestIds.get(clientId);
      if (typeof requestIds === 'undefined') {
        _logger2.default.error('Can not find client %d to delete', clientId);
        return;
      }

      var index = requestIds.indexOf(requestId);
      if (index < 0) {
        _logger2.default.error('Can not find client %d subscription %d to delete', clientId, requestId);
        return;
      }
      requestIds.splice(index, 1);
      // Delete client reference if it has no subscription
      if (requestIds.length == 0) {
        this.clientRequestIds.delete(clientId);
      }
    }
  }, {
    key: 'hasSubscribingClient',
    value: function hasSubscribingClient() {
      return this.clientRequestIds.size > 0;
    }
  }]);

  return Subscription;
}();

exports.Subscription = Subscription;
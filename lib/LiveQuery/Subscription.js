'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Subscription = undefined;

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Subscription {
  // It is query condition eg query.where
  constructor(className, query, queryHash) {
    this.className = className;
    this.query = query;
    this.hash = queryHash;
    this.clientRequestIds = new Map();
  }

  addClientSubscription(clientId, requestId) {
    if (!this.clientRequestIds.has(clientId)) {
      this.clientRequestIds.set(clientId, []);
    }
    const requestIds = this.clientRequestIds.get(clientId);
    requestIds.push(requestId);
  }

  deleteClientSubscription(clientId, requestId) {
    const requestIds = this.clientRequestIds.get(clientId);
    if (typeof requestIds === 'undefined') {
      _logger2.default.error('Can not find client %d to delete', clientId);
      return;
    }

    const index = requestIds.indexOf(requestId);
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

  hasSubscribingClient() {
    return this.clientRequestIds.size > 0;
  }
}

exports.Subscription = Subscription;
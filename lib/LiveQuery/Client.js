'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Client = undefined;

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const dafaultFields = ['className', 'objectId', 'updatedAt', 'createdAt', 'ACL'];

class Client {

  constructor(id, parseWebSocket, hasMasterKey) {
    this.id = id;
    this.parseWebSocket = parseWebSocket;
    this.hasMasterKey = hasMasterKey;
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

  static pushResponse(parseWebSocket, message) {
    _logger2.default.verbose('Push Response : %j', message);
    parseWebSocket.send(message);
  }

  static pushError(parseWebSocket, code, error, reconnect = true) {
    Client.pushResponse(parseWebSocket, JSON.stringify({
      'op': 'error',
      'error': error,
      'code': code,
      'reconnect': reconnect
    }));
  }

  addSubscriptionInfo(requestId, subscriptionInfo) {
    this.subscriptionInfos.set(requestId, subscriptionInfo);
  }

  getSubscriptionInfo(requestId) {
    return this.subscriptionInfos.get(requestId);
  }

  deleteSubscriptionInfo(requestId) {
    return this.subscriptionInfos.delete(requestId);
  }

  _pushEvent(type) {
    return function (subscriptionId, parseObjectJSON) {
      const response = {
        'op': type,
        'clientId': this.id
      };
      if (typeof subscriptionId !== 'undefined') {
        response['requestId'] = subscriptionId;
      }
      if (typeof parseObjectJSON !== 'undefined') {
        let fields;
        if (this.subscriptionInfos.has(subscriptionId)) {
          fields = this.subscriptionInfos.get(subscriptionId).fields;
        }
        response['object'] = this._toJSONWithFields(parseObjectJSON, fields);
      }
      Client.pushResponse(this.parseWebSocket, JSON.stringify(response));
    };
  }

  _toJSONWithFields(parseObjectJSON, fields) {
    if (!fields) {
      return parseObjectJSON;
    }
    const limitedParseObject = {};
    for (const field of dafaultFields) {
      limitedParseObject[field] = parseObjectJSON[field];
    }
    for (const field of fields) {
      if (field in parseObjectJSON) {
        limitedParseObject[field] = parseObjectJSON[field];
      }
    }
    return limitedParseObject;
  }
}

exports.Client = Client;
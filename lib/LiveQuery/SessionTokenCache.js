'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SessionTokenCache = undefined;

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _lruCache = require('lru-cache');

var _lruCache2 = _interopRequireDefault(_lruCache);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function userForSessionToken(sessionToken) {
  var q = new _node2.default.Query("_Session");
  q.equalTo("sessionToken", sessionToken);
  return q.first({ useMasterKey: true }).then(function (session) {
    if (!session) {
      return _node2.default.Promise.error("No session found for session token");
    }
    return session.get("user");
  });
}

class SessionTokenCache {

  constructor(timeout = 30 * 24 * 60 * 60 * 1000, maxSize = 10000) {
    this.cache = new _lruCache2.default({
      max: maxSize,
      maxAge: timeout
    });
  }

  getUserId(sessionToken) {
    if (!sessionToken) {
      return _node2.default.Promise.error('Empty sessionToken');
    }
    const userId = this.cache.get(sessionToken);
    if (userId) {
      _logger2.default.verbose('Fetch userId %s of sessionToken %s from Cache', userId, sessionToken);
      return _node2.default.Promise.as(userId);
    }
    return userForSessionToken(sessionToken).then(user => {
      _logger2.default.verbose('Fetch userId %s of sessionToken %s from Parse', user.id, sessionToken);
      const userId = user.id;
      this.cache.set(sessionToken, userId);
      return _node2.default.Promise.as(userId);
    }, error => {
      _logger2.default.error('Can not fetch userId for sessionToken %j, error %j', sessionToken, error);
      return _node2.default.Promise.error(error);
    });
  }
}

exports.SessionTokenCache = SessionTokenCache;
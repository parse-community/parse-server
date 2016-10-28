'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SessionTokenCache = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _lruCache = require('lru-cache');

var _lruCache2 = _interopRequireDefault(_lruCache);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var SessionTokenCache = function () {
  function SessionTokenCache() {
    var timeout = arguments.length <= 0 || arguments[0] === undefined ? 30 * 24 * 60 * 60 * 1000 : arguments[0];
    var maxSize = arguments.length <= 1 || arguments[1] === undefined ? 10000 : arguments[1];

    _classCallCheck(this, SessionTokenCache);

    this.cache = new _lruCache2.default({
      max: maxSize,
      maxAge: timeout
    });
  }

  _createClass(SessionTokenCache, [{
    key: 'getUserId',
    value: function getUserId(sessionToken) {
      var _this = this;

      if (!sessionToken) {
        return _node2.default.Promise.error('Empty sessionToken');
      }
      var userId = this.cache.get(sessionToken);
      if (userId) {
        _logger2.default.verbose('Fetch userId %s of sessionToken %s from Cache', userId, sessionToken);
        return _node2.default.Promise.as(userId);
      }
      return _node2.default.User.become(sessionToken).then(function (user) {
        _logger2.default.verbose('Fetch userId %s of sessionToken %s from Parse', user.id, sessionToken);
        var userId = user.id;
        _this.cache.set(sessionToken, userId);
        return _node2.default.Promise.as(userId);
      }, function (error) {
        _logger2.default.error('Can not fetch userId for sessionToken %j, error %j', sessionToken, error);
        return _node2.default.Promise.error(error);
      });
    }
  }]);

  return SessionTokenCache;
}();

exports.SessionTokenCache = SessionTokenCache;
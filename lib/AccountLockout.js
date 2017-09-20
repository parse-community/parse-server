'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AccountLockout = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // This class handles the Account Lockout Policy settings.

var _Config = require('./Config');

var _Config2 = _interopRequireDefault(_Config);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AccountLockout = exports.AccountLockout = function () {
  function AccountLockout(user, config) {
    _classCallCheck(this, AccountLockout);

    this._user = user;
    this._config = config;
  }

  /**
   * set _failed_login_count to value
   */


  _createClass(AccountLockout, [{
    key: '_setFailedLoginCount',
    value: function _setFailedLoginCount(value) {
      var query = {
        username: this._user.username
      };

      var updateFields = {
        _failed_login_count: value
      };

      return this._config.database.update('_User', query, updateFields);
    }

    /**
     * check if the _failed_login_count field has been set
     */

  }, {
    key: '_isFailedLoginCountSet',
    value: function _isFailedLoginCountSet() {
      var _this = this;

      return new Promise(function (resolve, reject) {
        var query = {
          username: _this._user.username,
          _failed_login_count: { $exists: true }
        };

        _this._config.database.find('_User', query).then(function (users) {
          if (Array.isArray(users) && users.length > 0) {
            resolve(true);
          } else {
            resolve(false);
          }
        }).catch(function (err) {
          reject(err);
        });
      });
    }

    /**
     * if _failed_login_count is NOT set then set it to 0
     * else do nothing
     */

  }, {
    key: '_initFailedLoginCount',
    value: function _initFailedLoginCount() {
      var _this2 = this;

      return new Promise(function (resolve, reject) {

        _this2._isFailedLoginCountSet().then(function (failedLoginCountIsSet) {
          if (!failedLoginCountIsSet) {
            return _this2._setFailedLoginCount(0);
          } else {
            return Promise.resolve();
          }
        }).then(function () {
          resolve();
        }).catch(function (err) {
          reject(err);
        });
      });
    }

    /**
     * increment _failed_login_count by 1
     */

  }, {
    key: '_incrementFailedLoginCount',
    value: function _incrementFailedLoginCount() {
      var query = {
        username: this._user.username
      };

      var updateFields = { _failed_login_count: { __op: 'Increment', amount: 1 } };

      return this._config.database.update('_User', query, updateFields);
    }

    /**
     * if the failed login count is greater than the threshold 
     * then sets lockout expiration to 'currenttime + accountPolicy.duration', i.e., account is locked out for the next 'accountPolicy.duration' minutes 
     * else do nothing
     */

  }, {
    key: '_setLockoutExpiration',
    value: function _setLockoutExpiration() {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        var query = {
          username: _this3._user.username,
          _failed_login_count: { $gte: _this3._config.accountLockout.threshold }
        };

        var now = new Date();

        var updateFields = {
          _account_lockout_expires_at: Parse._encode(new Date(now.getTime() + _this3._config.accountLockout.duration * 60 * 1000))
        };

        _this3._config.database.update('_User', query, updateFields).then(function () {
          resolve();
        }).catch(function (err) {
          if (err && err.code && err.message && err.code === 101 && err.message === 'Object not found.') {
            resolve(); // nothing to update so we are good
          } else {
            reject(err); // unknown error
          }
        });
      });
    }

    /**
     * if _account_lockout_expires_at > current_time and _failed_login_count > threshold
     *   reject with account locked error
     * else
     *   resolve
     */

  }, {
    key: '_notLocked',
    value: function _notLocked() {
      var _this4 = this;

      return new Promise(function (resolve, reject) {
        var query = {
          username: _this4._user.username,
          _account_lockout_expires_at: { $gt: Parse._encode(new Date()) },
          _failed_login_count: { $gte: _this4._config.accountLockout.threshold }
        };

        _this4._config.database.find('_User', query).then(function (users) {
          if (Array.isArray(users) && users.length > 0) {
            reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Your account is locked due to multiple failed login attempts. Please try again after ' + _this4._config.accountLockout.duration + ' minute(s)'));
          } else {
            resolve();
          }
        }).catch(function (err) {
          reject(err);
        });
      });
    }

    /**
     * set and/or increment _failed_login_count
     * if _failed_login_count > threshold
     *   set the _account_lockout_expires_at to current_time + accountPolicy.duration
     * else 
     *   do nothing   
     */

  }, {
    key: '_handleFailedLoginAttempt',
    value: function _handleFailedLoginAttempt() {
      var _this5 = this;

      return new Promise(function (resolve, reject) {
        _this5._initFailedLoginCount().then(function () {
          return _this5._incrementFailedLoginCount();
        }).then(function () {
          return _this5._setLockoutExpiration();
        }).then(function () {
          resolve();
        }).catch(function (err) {
          reject(err);
        });
      });
    }

    /**
     * handle login attempt if the Account Lockout Policy is enabled
     */

  }, {
    key: 'handleLoginAttempt',
    value: function handleLoginAttempt(loginSuccessful) {
      var _this6 = this;

      if (!this._config.accountLockout) {
        return Promise.resolve();
      }

      return new Promise(function (resolve, reject) {
        _this6._notLocked().then(function () {
          if (loginSuccessful) {
            return _this6._setFailedLoginCount(0);
          } else {
            return _this6._handleFailedLoginAttempt();
          }
        }).then(function () {
          resolve();
        }).catch(function (err) {
          reject(err);
        });
      });
    }
  }]);

  return AccountLockout;
}();

exports.default = AccountLockout;
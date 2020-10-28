"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AccountLockout = void 0;

var _node = _interopRequireDefault(require("parse/node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// This class handles the Account Lockout Policy settings.
class AccountLockout {
  constructor(user, config) {
    this._user = user;
    this._config = config;
  }
  /**
   * set _failed_login_count to value
   */


  _setFailedLoginCount(value) {
    const query = {
      username: this._user.username
    };
    const updateFields = {
      _failed_login_count: value
    };
    return this._config.database.update('_User', query, updateFields);
  }
  /**
   * check if the _failed_login_count field has been set
   */


  _isFailedLoginCountSet() {
    const query = {
      username: this._user.username,
      _failed_login_count: {
        $exists: true
      }
    };
    return this._config.database.find('_User', query).then(users => {
      if (Array.isArray(users) && users.length > 0) {
        return true;
      } else {
        return false;
      }
    });
  }
  /**
   * if _failed_login_count is NOT set then set it to 0
   * else do nothing
   */


  _initFailedLoginCount() {
    return this._isFailedLoginCountSet().then(failedLoginCountIsSet => {
      if (!failedLoginCountIsSet) {
        return this._setFailedLoginCount(0);
      }
    });
  }
  /**
   * increment _failed_login_count by 1
   */


  _incrementFailedLoginCount() {
    const query = {
      username: this._user.username
    };
    const updateFields = {
      _failed_login_count: {
        __op: 'Increment',
        amount: 1
      }
    };
    return this._config.database.update('_User', query, updateFields);
  }
  /**
   * if the failed login count is greater than the threshold
   * then sets lockout expiration to 'currenttime + accountPolicy.duration', i.e., account is locked out for the next 'accountPolicy.duration' minutes
   * else do nothing
   */


  _setLockoutExpiration() {
    const query = {
      username: this._user.username,
      _failed_login_count: {
        $gte: this._config.accountLockout.threshold
      }
    };
    const now = new Date();
    const updateFields = {
      _account_lockout_expires_at: _node.default._encode(new Date(now.getTime() + this._config.accountLockout.duration * 60 * 1000))
    };
    return this._config.database.update('_User', query, updateFields).catch(err => {
      if (err && err.code && err.message && err.code === 101 && err.message === 'Object not found.') {
        return; // nothing to update so we are good
      } else {
        throw err; // unknown error
      }
    });
  }
  /**
   * if _account_lockout_expires_at > current_time and _failed_login_count > threshold
   *   reject with account locked error
   * else
   *   resolve
   */


  _notLocked() {
    const query = {
      username: this._user.username,
      _account_lockout_expires_at: {
        $gt: _node.default._encode(new Date())
      },
      _failed_login_count: {
        $gte: this._config.accountLockout.threshold
      }
    };
    return this._config.database.find('_User', query).then(users => {
      if (Array.isArray(users) && users.length > 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your account is locked due to multiple failed login attempts. Please try again after ' + this._config.accountLockout.duration + ' minute(s)');
      }
    });
  }
  /**
   * set and/or increment _failed_login_count
   * if _failed_login_count > threshold
   *   set the _account_lockout_expires_at to current_time + accountPolicy.duration
   * else
   *   do nothing
   */


  _handleFailedLoginAttempt() {
    return this._initFailedLoginCount().then(() => {
      return this._incrementFailedLoginCount();
    }).then(() => {
      return this._setLockoutExpiration();
    });
  }
  /**
   * handle login attempt if the Account Lockout Policy is enabled
   */


  handleLoginAttempt(loginSuccessful) {
    if (!this._config.accountLockout) {
      return Promise.resolve();
    }

    return this._notLocked().then(() => {
      if (loginSuccessful) {
        return this._setFailedLoginCount(0);
      } else {
        return this._handleFailedLoginAttempt();
      }
    });
  }

}

exports.AccountLockout = AccountLockout;
var _default = AccountLockout;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BY2NvdW50TG9ja291dC5qcyJdLCJuYW1lcyI6WyJBY2NvdW50TG9ja291dCIsImNvbnN0cnVjdG9yIiwidXNlciIsImNvbmZpZyIsIl91c2VyIiwiX2NvbmZpZyIsIl9zZXRGYWlsZWRMb2dpbkNvdW50IiwidmFsdWUiLCJxdWVyeSIsInVzZXJuYW1lIiwidXBkYXRlRmllbGRzIiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsImRhdGFiYXNlIiwidXBkYXRlIiwiX2lzRmFpbGVkTG9naW5Db3VudFNldCIsIiRleGlzdHMiLCJmaW5kIiwidGhlbiIsInVzZXJzIiwiQXJyYXkiLCJpc0FycmF5IiwibGVuZ3RoIiwiX2luaXRGYWlsZWRMb2dpbkNvdW50IiwiZmFpbGVkTG9naW5Db3VudElzU2V0IiwiX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQiLCJfX29wIiwiYW1vdW50IiwiX3NldExvY2tvdXRFeHBpcmF0aW9uIiwiJGd0ZSIsImFjY291bnRMb2Nrb3V0IiwidGhyZXNob2xkIiwibm93IiwiRGF0ZSIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdldFRpbWUiLCJkdXJhdGlvbiIsImNhdGNoIiwiZXJyIiwiY29kZSIsIm1lc3NhZ2UiLCJfbm90TG9ja2VkIiwiJGd0IiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiX2hhbmRsZUZhaWxlZExvZ2luQXR0ZW1wdCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImxvZ2luU3VjY2Vzc2Z1bCIsIlByb21pc2UiLCJyZXNvbHZlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7Ozs7QUFEQTtBQUdPLE1BQU1BLGNBQU4sQ0FBcUI7QUFDMUJDLEVBQUFBLFdBQVcsQ0FBQ0MsSUFBRCxFQUFPQyxNQUFQLEVBQWU7QUFDeEIsU0FBS0MsS0FBTCxHQUFhRixJQUFiO0FBQ0EsU0FBS0csT0FBTCxHQUFlRixNQUFmO0FBQ0Q7QUFFRDs7Ozs7QUFHQUcsRUFBQUEsb0JB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OztBQUdBb0IsRUFBQUEsa0JBQWtCLENBQUNDLGVBQUQsRUFBa0I7QUFDbEMsUUFBSSxDQUFDLEtBQUszQyxPQUFMLENBQWF3QixjQUFsQixFQUFrQztBQUNoQyxhQUFPb0IsT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRDs7QUFDRCxXQUFPLEtBQUtSLFVBQUwsR0FBa0J6QixJQUFsQixDQUF1QixNQUFNO0FBQ2xDLFVBQUkrQixlQUFKLEVBQXFCO0FBQ25CLGVBQU8sS0FBSzFDLG9CQUFMLENBQTBCLENBQTFCLENBQVA7QUFDRCxPQUZELE1BRU87QUFDTCxlQUFPLEtBQUt3Qyx5QkFBTCxFQUFQO0FBQ0Q7QUFDRixLQU5NLENBQVA7QUFPRDs7QUE1SnlCOzs7ZUErSmI5QyxjIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHRoZSBBY2NvdW50IExvY2tvdXQgUG9saWN5IHNldHRpbmdzLlxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5leHBvcnQgY2xhc3MgQWNjb3VudExvY2tvdXQge1xuICBjb25zdHJ1Y3Rvcih1c2VyLCBjb25maWcpIHtcbiAgICB0aGlzLl91c2VyID0gdXNlcjtcbiAgICB0aGlzLl9jb25maWcgPSBjb25maWc7XG4gIH1cblxuICAvKipcbiAgICogc2V0IF9mYWlsZWRfbG9naW5fY291bnQgdG8gdmFsdWVcbiAgICovXG4gIF9zZXRGYWlsZWRMb2dpbkNvdW50KHZhbHVlKSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICB1c2VybmFtZTogdGhpcy5fdXNlci51c2VybmFtZSxcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlRmllbGRzID0ge1xuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogdmFsdWUsXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIGNoZWNrIGlmIHRoZSBfZmFpbGVkX2xvZ2luX2NvdW50IGZpZWxkIGhhcyBiZWVuIHNldFxuICAgKi9cbiAgX2lzRmFpbGVkTG9naW5Db3VudFNldCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZXhpc3RzOiB0cnVlIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCBxdWVyeSkudGhlbih1c2VycyA9PiB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh1c2VycykgJiYgdXNlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpZiBfZmFpbGVkX2xvZ2luX2NvdW50IGlzIE5PVCBzZXQgdGhlbiBzZXQgaXQgdG8gMFxuICAgKiBlbHNlIGRvIG5vdGhpbmdcbiAgICovXG4gIF9pbml0RmFpbGVkTG9naW5Db3VudCgpIHtcbiAgICByZXR1cm4gdGhpcy5faXNGYWlsZWRMb2dpbkNvdW50U2V0KCkudGhlbihmYWlsZWRMb2dpbkNvdW50SXNTZXQgPT4ge1xuICAgICAgaWYgKCFmYWlsZWRMb2dpbkNvdW50SXNTZXQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldEZhaWxlZExvZ2luQ291bnQoMCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogaW5jcmVtZW50IF9mYWlsZWRfbG9naW5fY291bnQgYnkgMVxuICAgKi9cbiAgX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQoKSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICB1c2VybmFtZTogdGhpcy5fdXNlci51c2VybmFtZSxcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlRmllbGRzID0ge1xuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyBfX29wOiAnSW5jcmVtZW50JywgYW1vdW50OiAxIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIGlmIHRoZSBmYWlsZWQgbG9naW4gY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSB0aHJlc2hvbGRcbiAgICogdGhlbiBzZXRzIGxvY2tvdXQgZXhwaXJhdGlvbiB0byAnY3VycmVudHRpbWUgKyBhY2NvdW50UG9saWN5LmR1cmF0aW9uJywgaS5lLiwgYWNjb3VudCBpcyBsb2NrZWQgb3V0IGZvciB0aGUgbmV4dCAnYWNjb3VudFBvbGljeS5kdXJhdGlvbicgbWludXRlc1xuICAgKiBlbHNlIGRvIG5vdGhpbmdcbiAgICovXG4gIF9zZXRMb2Nrb3V0RXhwaXJhdGlvbigpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZ3RlOiB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQudGhyZXNob2xkIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG5cbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ6IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQuZHVyYXRpb24gKiA2MCAqIDEwMDApXG4gICAgICApLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCBxdWVyeSwgdXBkYXRlRmllbGRzKS5jYXRjaChlcnIgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnIgJiZcbiAgICAgICAgZXJyLmNvZGUgJiZcbiAgICAgICAgZXJyLm1lc3NhZ2UgJiZcbiAgICAgICAgZXJyLmNvZGUgPT09IDEwMSAmJlxuICAgICAgICBlcnIubWVzc2FnZSA9PT0gJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybjsgLy8gbm90aGluZyB0byB1cGRhdGUgc28gd2UgYXJlIGdvb2RcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycjsgLy8gdW5rbm93biBlcnJvclxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIGlmIF9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA+IGN1cnJlbnRfdGltZSBhbmQgX2ZhaWxlZF9sb2dpbl9jb3VudCA+IHRocmVzaG9sZFxuICAgKiAgIHJlamVjdCB3aXRoIGFjY291bnQgbG9ja2VkIGVycm9yXG4gICAqIGVsc2VcbiAgICogICByZXNvbHZlXG4gICAqL1xuICBfbm90TG9ja2VkKCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUsXG4gICAgICBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ6IHsgJGd0OiBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpIH0sXG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB7ICRndGU6IHRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dC50aHJlc2hvbGQgfSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHF1ZXJ5KS50aGVuKHVzZXJzID0+IHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHVzZXJzKSAmJiB1c2Vycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdZb3VyIGFjY291bnQgaXMgbG9ja2VkIGR1ZSB0byBtdWx0aXBsZSBmYWlsZWQgbG9naW4gYXR0ZW1wdHMuIFBsZWFzZSB0cnkgYWdhaW4gYWZ0ZXIgJyArXG4gICAgICAgICAgICB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQuZHVyYXRpb24gK1xuICAgICAgICAgICAgJyBtaW51dGUocyknXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogc2V0IGFuZC9vciBpbmNyZW1lbnQgX2ZhaWxlZF9sb2dpbl9jb3VudFxuICAgKiBpZiBfZmFpbGVkX2xvZ2luX2NvdW50ID4gdGhyZXNob2xkXG4gICAqICAgc2V0IHRoZSBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgdG8gY3VycmVudF90aW1lICsgYWNjb3VudFBvbGljeS5kdXJhdGlvblxuICAgKiBlbHNlXG4gICAqICAgZG8gbm90aGluZ1xuICAgKi9cbiAgX2hhbmRsZUZhaWxlZExvZ2luQXR0ZW1wdCgpIHtcbiAgICByZXR1cm4gdGhpcy5faW5pdEZhaWxlZExvZ2luQ291bnQoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5faW5jcmVtZW50RmFpbGVkTG9naW5Db3VudCgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldExvY2tvdXRFeHBpcmF0aW9uKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBoYW5kbGUgbG9naW4gYXR0ZW1wdCBpZiB0aGUgQWNjb3VudCBMb2Nrb3V0IFBvbGljeSBpcyBlbmFibGVkXG4gICAqL1xuICBoYW5kbGVMb2dpbkF0dGVtcHQobG9naW5TdWNjZXNzZnVsKSB7XG4gICAgaWYgKCF0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX25vdExvY2tlZCgpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKGxvZ2luU3VjY2Vzc2Z1bCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2V0RmFpbGVkTG9naW5Db3VudCgwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9oYW5kbGVGYWlsZWRMb2dpbkF0dGVtcHQoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBY2NvdW50TG9ja291dDtcbiJdfQ==
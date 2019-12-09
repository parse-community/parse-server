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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BY2NvdW50TG9ja291dC5qcyJdLCJuYW1lcyI6WyJBY2NvdW50TG9ja291dCIsImNvbnN0cnVjdG9yIiwidXNlciIsImNvbmZpZyIsIl91c2VyIiwiX2NvbmZpZyIsIl9zZXRGYWlsZWRMb2dpbkNvdW50IiwidmFsdWUiLCJxdWVyeSIsInVzZXJuYW1lIiwidXBkYXRlRmllbGRzIiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsImRhdGFiYXNlIiwidXBkYXRlIiwiX2lzRmFpbGVkTG9naW5Db3VudFNldCIsIiRleGlzdHMiLCJmaW5kIiwidGhlbiIsInVzZXJzIiwiQXJyYXkiLCJpc0FycmF5IiwibGVuZ3RoIiwiX2luaXRGYWlsZWRMb2dpbkNvdW50IiwiZmFpbGVkTG9naW5Db3VudElzU2V0IiwiX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQiLCJfX29wIiwiYW1vdW50IiwiX3NldExvY2tvdXRFeHBpcmF0aW9uIiwiJGd0ZSIsImFjY291bnRMb2Nrb3V0IiwidGhyZXNob2xkIiwibm93IiwiRGF0ZSIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdldFRpbWUiLCJkdXJhdGlvbiIsImNhdGNoIiwiZXJyIiwiY29kZSIsIm1lc3NhZ2UiLCJfbm90TG9ja2VkIiwiJGd0IiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiX2hhbmRsZUZhaWxlZExvZ2luQXR0ZW1wdCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImxvZ2luU3VjY2Vzc2Z1bCIsIlByb21pc2UiLCJyZXNvbHZlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7Ozs7QUFEQTtBQUdPLE1BQU1BLGNBQU4sQ0FBcUI7QUFDMUJDLEVBQUFBLFdBQVcsQ0FBQ0MsSUFBRCxFQUFPQyxNQUFQLEVBQWU7QUFDeEIsU0FBS0MsS0FBTCxHQUFhRixJQUFiO0FBQ0EsU0FBS0csT0FBTCxHQUFlRixNQUFmO0FBQ0Q7QUFFRDs7Ozs7QUFHQUcsRUFBQUEsb0JB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QUFBQSxrQkFBa0IsQ0FBQ0MsZUFBRCxFQUFrQjtBQUNsQyxRQUFJLENBQUMsS0FBSzNDLE9BQUwsQ0FBYXdCLGNBQWxCLEVBQWtDO0FBQ2hDLGFBQU9vQixPQUFPLENBQUNDLE9BQVIsRUFBUDtBQUNEOztBQUNELFdBQU8sS0FBS1IsVUFBTCxHQUFrQnpCLElBQWxCLENBQXVCLE1BQU07QUFDbEMsVUFBSStCLGVBQUosRUFBcUI7QUFDbkIsZUFBTyxLQUFLMUMsb0JBQUwsQ0FBMEIsQ0FBMUIsQ0FBUDtBQUNELE9BRkQsTUFFTztBQUNMLGVBQU8sS0FBS3dDLHlCQUFMLEVBQVA7QUFDRDtBQUNGLEtBTk0sQ0FBUDtBQU9EOztBQWhLeUI7OztlQW1LYjlDLGMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGlzIGNsYXNzIGhhbmRsZXMgdGhlIEFjY291bnQgTG9ja291dCBQb2xpY3kgc2V0dGluZ3MuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmV4cG9ydCBjbGFzcyBBY2NvdW50TG9ja291dCB7XG4gIGNvbnN0cnVjdG9yKHVzZXIsIGNvbmZpZykge1xuICAgIHRoaXMuX3VzZXIgPSB1c2VyO1xuICAgIHRoaXMuX2NvbmZpZyA9IGNvbmZpZztcbiAgfVxuXG4gIC8qKlxuICAgKiBzZXQgX2ZhaWxlZF9sb2dpbl9jb3VudCB0byB2YWx1ZVxuICAgKi9cbiAgX3NldEZhaWxlZExvZ2luQ291bnQodmFsdWUpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgIH07XG5cbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB2YWx1ZSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS51cGRhdGUoJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcyk7XG4gIH1cblxuICAvKipcbiAgICogY2hlY2sgaWYgdGhlIF9mYWlsZWRfbG9naW5fY291bnQgZmllbGQgaGFzIGJlZW4gc2V0XG4gICAqL1xuICBfaXNGYWlsZWRMb2dpbkNvdW50U2V0KCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUsXG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB7ICRleGlzdHM6IHRydWUgfSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHF1ZXJ5KS50aGVuKHVzZXJzID0+IHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHVzZXJzKSAmJiB1c2Vycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIGlmIF9mYWlsZWRfbG9naW5fY291bnQgaXMgTk9UIHNldCB0aGVuIHNldCBpdCB0byAwXG4gICAqIGVsc2UgZG8gbm90aGluZ1xuICAgKi9cbiAgX2luaXRGYWlsZWRMb2dpbkNvdW50KCkge1xuICAgIHJldHVybiB0aGlzLl9pc0ZhaWxlZExvZ2luQ291bnRTZXQoKS50aGVuKGZhaWxlZExvZ2luQ291bnRJc1NldCA9PiB7XG4gICAgICBpZiAoIWZhaWxlZExvZ2luQ291bnRJc1NldCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2V0RmFpbGVkTG9naW5Db3VudCgwKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpbmNyZW1lbnQgX2ZhaWxlZF9sb2dpbl9jb3VudCBieSAxXG4gICAqL1xuICBfaW5jcmVtZW50RmFpbGVkTG9naW5Db3VudCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgIH07XG5cbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB7IF9fb3A6ICdJbmNyZW1lbnQnLCBhbW91bnQ6IDEgfSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS51cGRhdGUoJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcyk7XG4gIH1cblxuICAvKipcbiAgICogaWYgdGhlIGZhaWxlZCBsb2dpbiBjb3VudCBpcyBncmVhdGVyIHRoYW4gdGhlIHRocmVzaG9sZFxuICAgKiB0aGVuIHNldHMgbG9ja291dCBleHBpcmF0aW9uIHRvICdjdXJyZW50dGltZSArIGFjY291bnRQb2xpY3kuZHVyYXRpb24nLCBpLmUuLCBhY2NvdW50IGlzIGxvY2tlZCBvdXQgZm9yIHRoZSBuZXh0ICdhY2NvdW50UG9saWN5LmR1cmF0aW9uJyBtaW51dGVzXG4gICAqIGVsc2UgZG8gbm90aGluZ1xuICAgKi9cbiAgX3NldExvY2tvdXRFeHBpcmF0aW9uKCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUsXG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB7ICRndGU6IHRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dC50aHJlc2hvbGQgfSxcbiAgICB9O1xuXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcblxuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIF9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdDogUGFyc2UuX2VuY29kZShcbiAgICAgICAgbmV3IERhdGUoXG4gICAgICAgICAgbm93LmdldFRpbWUoKSArIHRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dC5kdXJhdGlvbiAqIDYwICogMTAwMFxuICAgICAgICApXG4gICAgICApLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlXG4gICAgICAudXBkYXRlKCdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVyciAmJlxuICAgICAgICAgIGVyci5jb2RlICYmXG4gICAgICAgICAgZXJyLm1lc3NhZ2UgJiZcbiAgICAgICAgICBlcnIuY29kZSA9PT0gMTAxICYmXG4gICAgICAgICAgZXJyLm1lc3NhZ2UgPT09ICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgKSB7XG4gICAgICAgICAgcmV0dXJuOyAvLyBub3RoaW5nIHRvIHVwZGF0ZSBzbyB3ZSBhcmUgZ29vZFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjsgLy8gdW5rbm93biBlcnJvclxuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpZiBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPiBjdXJyZW50X3RpbWUgYW5kIF9mYWlsZWRfbG9naW5fY291bnQgPiB0aHJlc2hvbGRcbiAgICogICByZWplY3Qgd2l0aCBhY2NvdW50IGxvY2tlZCBlcnJvclxuICAgKiBlbHNlXG4gICAqICAgcmVzb2x2ZVxuICAgKi9cbiAgX25vdExvY2tlZCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0OiB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9LFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZ3RlOiB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQudGhyZXNob2xkIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCBxdWVyeSkudGhlbih1c2VycyA9PiB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh1c2VycykgJiYgdXNlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnWW91ciBhY2NvdW50IGlzIGxvY2tlZCBkdWUgdG8gbXVsdGlwbGUgZmFpbGVkIGxvZ2luIGF0dGVtcHRzLiBQbGVhc2UgdHJ5IGFnYWluIGFmdGVyICcgK1xuICAgICAgICAgICAgdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LmR1cmF0aW9uICtcbiAgICAgICAgICAgICcgbWludXRlKHMpJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIHNldCBhbmQvb3IgaW5jcmVtZW50IF9mYWlsZWRfbG9naW5fY291bnRcbiAgICogaWYgX2ZhaWxlZF9sb2dpbl9jb3VudCA+IHRocmVzaG9sZFxuICAgKiAgIHNldCB0aGUgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0IHRvIGN1cnJlbnRfdGltZSArIGFjY291bnRQb2xpY3kuZHVyYXRpb25cbiAgICogZWxzZVxuICAgKiAgIGRvIG5vdGhpbmdcbiAgICovXG4gIF9oYW5kbGVGYWlsZWRMb2dpbkF0dGVtcHQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2luaXRGYWlsZWRMb2dpbkNvdW50KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZXRMb2Nrb3V0RXhwaXJhdGlvbigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogaGFuZGxlIGxvZ2luIGF0dGVtcHQgaWYgdGhlIEFjY291bnQgTG9ja291dCBQb2xpY3kgaXMgZW5hYmxlZFxuICAgKi9cbiAgaGFuZGxlTG9naW5BdHRlbXB0KGxvZ2luU3VjY2Vzc2Z1bCkge1xuICAgIGlmICghdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9ub3RMb2NrZWQoKS50aGVuKCgpID0+IHtcbiAgICAgIGlmIChsb2dpblN1Y2Nlc3NmdWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldEZhaWxlZExvZ2luQ291bnQoMCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5faGFuZGxlRmFpbGVkTG9naW5BdHRlbXB0KCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQWNjb3VudExvY2tvdXQ7XG4iXX0=
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
  /**
   * Removes the account lockout.
   */


  unlockAccount() {
    if (!this._config.accountLockout || !this._config.accountLockout.unlockOnPasswordReset) {
      return Promise.resolve();
    }

    return this._config.database.update('_User', {
      username: this._user.username
    }, {
      _failed_login_count: {
        __op: 'Delete'
      },
      _account_lockout_expires_at: {
        __op: 'Delete'
      }
    });
  }

}

exports.AccountLockout = AccountLockout;
var _default = AccountLockout;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BY2NvdW50TG9ja291dC5qcyJdLCJuYW1lcyI6WyJBY2NvdW50TG9ja291dCIsImNvbnN0cnVjdG9yIiwidXNlciIsImNvbmZpZyIsIl91c2VyIiwiX2NvbmZpZyIsIl9zZXRGYWlsZWRMb2dpbkNvdW50IiwidmFsdWUiLCJxdWVyeSIsInVzZXJuYW1lIiwidXBkYXRlRmllbGRzIiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsImRhdGFiYXNlIiwidXBkYXRlIiwiX2lzRmFpbGVkTG9naW5Db3VudFNldCIsIiRleGlzdHMiLCJmaW5kIiwidGhlbiIsInVzZXJzIiwiQXJyYXkiLCJpc0FycmF5IiwibGVuZ3RoIiwiX2luaXRGYWlsZWRMb2dpbkNvdW50IiwiZmFpbGVkTG9naW5Db3VudElzU2V0IiwiX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQiLCJfX29wIiwiYW1vdW50IiwiX3NldExvY2tvdXRFeHBpcmF0aW9uIiwiJGd0ZSIsImFjY291bnRMb2Nrb3V0IiwidGhyZXNob2xkIiwibm93IiwiRGF0ZSIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdldFRpbWUiLCJkdXJhdGlvbiIsImNhdGNoIiwiZXJyIiwiY29kZSIsIm1lc3NhZ2UiLCJfbm90TG9ja2VkIiwiJGd0IiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiX2hhbmRsZUZhaWxlZExvZ2luQXR0ZW1wdCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImxvZ2luU3VjY2Vzc2Z1bCIsIlByb21pc2UiLCJyZXNvbHZlIiwidW5sb2NrQWNjb3VudCIsInVubG9ja09uUGFzc3dvcmRSZXNldCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOzs7O0FBREE7QUFHTyxNQUFNQSxjQUFOLENBQXFCO0FBQzFCQyxFQUFBQSxXQUFXLENBQUNDLElBQUQsRUFBT0MsTUFBUCxFQUFlO0FBQ3hCLFNBQUtDLEtBQUwsR0FBYUYsSUFBYjtBQUNBLFNBQUtHLE9BQUws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ZW50IjpbIi8vIFRoaXMgY2xhc3MgaGFuZGxlcyB0aGUgQWNjb3VudCBMb2Nrb3V0IFBvbGljeSBzZXR0aW5ncy5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuZXhwb3J0IGNsYXNzIEFjY291bnRMb2Nrb3V0IHtcbiAgY29uc3RydWN0b3IodXNlciwgY29uZmlnKSB7XG4gICAgdGhpcy5fdXNlciA9IHVzZXI7XG4gICAgdGhpcy5fY29uZmlnID0gY29uZmlnO1xuICB9XG5cbiAgLyoqXG4gICAqIHNldCBfZmFpbGVkX2xvZ2luX2NvdW50IHRvIHZhbHVlXG4gICAqL1xuICBfc2V0RmFpbGVkTG9naW5Db3VudCh2YWx1ZSkge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUsXG4gICAgfTtcblxuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIF9mYWlsZWRfbG9naW5fY291bnQ6IHZhbHVlLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCBxdWVyeSwgdXBkYXRlRmllbGRzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBjaGVjayBpZiB0aGUgX2ZhaWxlZF9sb2dpbl9jb3VudCBmaWVsZCBoYXMgYmVlbiBzZXRcbiAgICovXG4gIF9pc0ZhaWxlZExvZ2luQ291bnRTZXQoKSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICB1c2VybmFtZTogdGhpcy5fdXNlci51c2VybmFtZSxcbiAgICAgIF9mYWlsZWRfbG9naW5fY291bnQ6IHsgJGV4aXN0czogdHJ1ZSB9LFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgcXVlcnkpLnRoZW4odXNlcnMgPT4ge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkodXNlcnMpICYmIHVzZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogaWYgX2ZhaWxlZF9sb2dpbl9jb3VudCBpcyBOT1Qgc2V0IHRoZW4gc2V0IGl0IHRvIDBcbiAgICogZWxzZSBkbyBub3RoaW5nXG4gICAqL1xuICBfaW5pdEZhaWxlZExvZ2luQ291bnQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2lzRmFpbGVkTG9naW5Db3VudFNldCgpLnRoZW4oZmFpbGVkTG9naW5Db3VudElzU2V0ID0+IHtcbiAgICAgIGlmICghZmFpbGVkTG9naW5Db3VudElzU2V0KSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZXRGYWlsZWRMb2dpbkNvdW50KDApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIGluY3JlbWVudCBfZmFpbGVkX2xvZ2luX2NvdW50IGJ5IDFcbiAgICovXG4gIF9pbmNyZW1lbnRGYWlsZWRMb2dpbkNvdW50KCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUsXG4gICAgfTtcblxuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIF9mYWlsZWRfbG9naW5fY291bnQ6IHsgX19vcDogJ0luY3JlbWVudCcsIGFtb3VudDogMSB9LFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCBxdWVyeSwgdXBkYXRlRmllbGRzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpZiB0aGUgZmFpbGVkIGxvZ2luIGNvdW50IGlzIGdyZWF0ZXIgdGhhbiB0aGUgdGhyZXNob2xkXG4gICAqIHRoZW4gc2V0cyBsb2Nrb3V0IGV4cGlyYXRpb24gdG8gJ2N1cnJlbnR0aW1lICsgYWNjb3VudFBvbGljeS5kdXJhdGlvbicsIGkuZS4sIGFjY291bnQgaXMgbG9ja2VkIG91dCBmb3IgdGhlIG5leHQgJ2FjY291bnRQb2xpY3kuZHVyYXRpb24nIG1pbnV0ZXNcbiAgICogZWxzZSBkbyBub3RoaW5nXG4gICAqL1xuICBfc2V0TG9ja291dEV4cGlyYXRpb24oKSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICB1c2VybmFtZTogdGhpcy5fdXNlci51c2VybmFtZSxcbiAgICAgIF9mYWlsZWRfbG9naW5fY291bnQ6IHsgJGd0ZTogdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCB9LFxuICAgIH07XG5cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuXG4gICAgY29uc3QgdXBkYXRlRmllbGRzID0ge1xuICAgICAgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0OiBQYXJzZS5fZW5jb2RlKFxuICAgICAgICBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LmR1cmF0aW9uICogNjAgKiAxMDAwKVxuICAgICAgKSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS51cGRhdGUoJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcykuY2F0Y2goZXJyID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyICYmXG4gICAgICAgIGVyci5jb2RlICYmXG4gICAgICAgIGVyci5tZXNzYWdlICYmXG4gICAgICAgIGVyci5jb2RlID09PSAxMDEgJiZcbiAgICAgICAgZXJyLm1lc3NhZ2UgPT09ICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICkge1xuICAgICAgICByZXR1cm47IC8vIG5vdGhpbmcgdG8gdXBkYXRlIHNvIHdlIGFyZSBnb29kXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnI7IC8vIHVua25vd24gZXJyb3JcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpZiBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPiBjdXJyZW50X3RpbWUgYW5kIF9mYWlsZWRfbG9naW5fY291bnQgPiB0aHJlc2hvbGRcbiAgICogICByZWplY3Qgd2l0aCBhY2NvdW50IGxvY2tlZCBlcnJvclxuICAgKiBlbHNlXG4gICAqICAgcmVzb2x2ZVxuICAgKi9cbiAgX25vdExvY2tlZCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0OiB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9LFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZ3RlOiB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQudGhyZXNob2xkIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCBxdWVyeSkudGhlbih1c2VycyA9PiB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh1c2VycykgJiYgdXNlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnWW91ciBhY2NvdW50IGlzIGxvY2tlZCBkdWUgdG8gbXVsdGlwbGUgZmFpbGVkIGxvZ2luIGF0dGVtcHRzLiBQbGVhc2UgdHJ5IGFnYWluIGFmdGVyICcgK1xuICAgICAgICAgICAgdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LmR1cmF0aW9uICtcbiAgICAgICAgICAgICcgbWludXRlKHMpJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIHNldCBhbmQvb3IgaW5jcmVtZW50IF9mYWlsZWRfbG9naW5fY291bnRcbiAgICogaWYgX2ZhaWxlZF9sb2dpbl9jb3VudCA+IHRocmVzaG9sZFxuICAgKiAgIHNldCB0aGUgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0IHRvIGN1cnJlbnRfdGltZSArIGFjY291bnRQb2xpY3kuZHVyYXRpb25cbiAgICogZWxzZVxuICAgKiAgIGRvIG5vdGhpbmdcbiAgICovXG4gIF9oYW5kbGVGYWlsZWRMb2dpbkF0dGVtcHQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2luaXRGYWlsZWRMb2dpbkNvdW50KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZXRMb2Nrb3V0RXhwaXJhdGlvbigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogaGFuZGxlIGxvZ2luIGF0dGVtcHQgaWYgdGhlIEFjY291bnQgTG9ja291dCBQb2xpY3kgaXMgZW5hYmxlZFxuICAgKi9cbiAgaGFuZGxlTG9naW5BdHRlbXB0KGxvZ2luU3VjY2Vzc2Z1bCkge1xuICAgIGlmICghdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9ub3RMb2NrZWQoKS50aGVuKCgpID0+IHtcbiAgICAgIGlmIChsb2dpblN1Y2Nlc3NmdWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldEZhaWxlZExvZ2luQ291bnQoMCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5faGFuZGxlRmFpbGVkTG9naW5BdHRlbXB0KCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyB0aGUgYWNjb3VudCBsb2Nrb3V0LlxuICAgKi9cbiAgdW5sb2NrQWNjb3VudCgpIHtcbiAgICBpZiAoIXRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dCB8fCAhdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICdfVXNlcicsXG4gICAgICB7IHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lIH0sXG4gICAgICB7XG4gICAgICAgIF9mYWlsZWRfbG9naW5fY291bnQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgICAgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0OiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBY2NvdW50TG9ja291dDtcbiJdfQ==
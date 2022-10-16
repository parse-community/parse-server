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
      if (err && err.code && err.message && err.code === _node.default.Error.OBJECT_NOT_FOUND && err.message === 'Object not found.') {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BY2NvdW50TG9ja291dC5qcyJdLCJuYW1lcyI6WyJBY2NvdW50TG9ja291dCIsImNvbnN0cnVjdG9yIiwidXNlciIsImNvbmZpZyIsIl91c2VyIiwiX2NvbmZpZyIsIl9zZXRGYWlsZWRMb2dpbkNvdW50IiwidmFsdWUiLCJxdWVyeSIsInVzZXJuYW1lIiwidXBkYXRlRmllbGRzIiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsImRhdGFiYXNlIiwidXBkYXRlIiwiX2lzRmFpbGVkTG9naW5Db3VudFNldCIsIiRleGlzdHMiLCJmaW5kIiwidGhlbiIsInVzZXJzIiwiQXJyYXkiLCJpc0FycmF5IiwibGVuZ3RoIiwiX2luaXRGYWlsZWRMb2dpbkNvdW50IiwiZmFpbGVkTG9naW5Db3VudElzU2V0IiwiX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQiLCJfX29wIiwiYW1vdW50IiwiX3NldExvY2tvdXRFeHBpcmF0aW9uIiwiJGd0ZSIsImFjY291bnRMb2Nrb3V0IiwidGhyZXNob2xkIiwibm93IiwiRGF0ZSIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdldFRpbWUiLCJkdXJhdGlvbiIsImNhdGNoIiwiZXJyIiwiY29kZSIsIm1lc3NhZ2UiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJfbm90TG9ja2VkIiwiJGd0IiwiX2hhbmRsZUZhaWxlZExvZ2luQXR0ZW1wdCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImxvZ2luU3VjY2Vzc2Z1bCIsIlByb21pc2UiLCJyZXNvbHZlIiwidW5sb2NrQWNjb3VudCIsInVubG9ja09uUGFzc3dvcmRSZXNldCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOzs7O0FBREE7QUFHTyxNQUFNQSxjQUFOLENBQXFCO0FBQzFCQyxFQUFBQSxXQUFXLENBQUNDLElBQUQsRUFBT0MsTUFBUCxFQUFlO0FBQ3hCLFNBQUtDLEtBQUwsR0FBYUYsSUFBYjtBQUNBLFNBQUtHLE9BQUws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TGJ6QixjIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHRoZSBBY2NvdW50IExvY2tvdXQgUG9saWN5IHNldHRpbmdzLlxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5leHBvcnQgY2xhc3MgQWNjb3VudExvY2tvdXQge1xuICBjb25zdHJ1Y3Rvcih1c2VyLCBjb25maWcpIHtcbiAgICB0aGlzLl91c2VyID0gdXNlcjtcbiAgICB0aGlzLl9jb25maWcgPSBjb25maWc7XG4gIH1cblxuICAvKipcbiAgICogc2V0IF9mYWlsZWRfbG9naW5fY291bnQgdG8gdmFsdWVcbiAgICovXG4gIF9zZXRGYWlsZWRMb2dpbkNvdW50KHZhbHVlKSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICB1c2VybmFtZTogdGhpcy5fdXNlci51c2VybmFtZSxcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlRmllbGRzID0ge1xuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogdmFsdWUsXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIGNoZWNrIGlmIHRoZSBfZmFpbGVkX2xvZ2luX2NvdW50IGZpZWxkIGhhcyBiZWVuIHNldFxuICAgKi9cbiAgX2lzRmFpbGVkTG9naW5Db3VudFNldCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZXhpc3RzOiB0cnVlIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCBxdWVyeSkudGhlbih1c2VycyA9PiB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh1c2VycykgJiYgdXNlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpZiBfZmFpbGVkX2xvZ2luX2NvdW50IGlzIE5PVCBzZXQgdGhlbiBzZXQgaXQgdG8gMFxuICAgKiBlbHNlIGRvIG5vdGhpbmdcbiAgICovXG4gIF9pbml0RmFpbGVkTG9naW5Db3VudCgpIHtcbiAgICByZXR1cm4gdGhpcy5faXNGYWlsZWRMb2dpbkNvdW50U2V0KCkudGhlbihmYWlsZWRMb2dpbkNvdW50SXNTZXQgPT4ge1xuICAgICAgaWYgKCFmYWlsZWRMb2dpbkNvdW50SXNTZXQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldEZhaWxlZExvZ2luQ291bnQoMCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogaW5jcmVtZW50IF9mYWlsZWRfbG9naW5fY291bnQgYnkgMVxuICAgKi9cbiAgX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQoKSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICB1c2VybmFtZTogdGhpcy5fdXNlci51c2VybmFtZSxcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlRmllbGRzID0ge1xuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyBfX29wOiAnSW5jcmVtZW50JywgYW1vdW50OiAxIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIGlmIHRoZSBmYWlsZWQgbG9naW4gY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSB0aHJlc2hvbGRcbiAgICogdGhlbiBzZXRzIGxvY2tvdXQgZXhwaXJhdGlvbiB0byAnY3VycmVudHRpbWUgKyBhY2NvdW50UG9saWN5LmR1cmF0aW9uJywgaS5lLiwgYWNjb3VudCBpcyBsb2NrZWQgb3V0IGZvciB0aGUgbmV4dCAnYWNjb3VudFBvbGljeS5kdXJhdGlvbicgbWludXRlc1xuICAgKiBlbHNlIGRvIG5vdGhpbmdcbiAgICovXG4gIF9zZXRMb2Nrb3V0RXhwaXJhdGlvbigpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZ3RlOiB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQudGhyZXNob2xkIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG5cbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ6IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQuZHVyYXRpb24gKiA2MCAqIDEwMDApXG4gICAgICApLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCBxdWVyeSwgdXBkYXRlRmllbGRzKS5jYXRjaChlcnIgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnIgJiZcbiAgICAgICAgZXJyLmNvZGUgJiZcbiAgICAgICAgZXJyLm1lc3NhZ2UgJiZcbiAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQgJiZcbiAgICAgICAgZXJyLm1lc3NhZ2UgPT09ICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICkge1xuICAgICAgICByZXR1cm47IC8vIG5vdGhpbmcgdG8gdXBkYXRlIHNvIHdlIGFyZSBnb29kXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnI7IC8vIHVua25vd24gZXJyb3JcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpZiBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPiBjdXJyZW50X3RpbWUgYW5kIF9mYWlsZWRfbG9naW5fY291bnQgPiB0aHJlc2hvbGRcbiAgICogICByZWplY3Qgd2l0aCBhY2NvdW50IGxvY2tlZCBlcnJvclxuICAgKiBlbHNlXG4gICAqICAgcmVzb2x2ZVxuICAgKi9cbiAgX25vdExvY2tlZCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0OiB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9LFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZ3RlOiB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQudGhyZXNob2xkIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCBxdWVyeSkudGhlbih1c2VycyA9PiB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh1c2VycykgJiYgdXNlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnWW91ciBhY2NvdW50IGlzIGxvY2tlZCBkdWUgdG8gbXVsdGlwbGUgZmFpbGVkIGxvZ2luIGF0dGVtcHRzLiBQbGVhc2UgdHJ5IGFnYWluIGFmdGVyICcgK1xuICAgICAgICAgICAgdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LmR1cmF0aW9uICtcbiAgICAgICAgICAgICcgbWludXRlKHMpJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIHNldCBhbmQvb3IgaW5jcmVtZW50IF9mYWlsZWRfbG9naW5fY291bnRcbiAgICogaWYgX2ZhaWxlZF9sb2dpbl9jb3VudCA+IHRocmVzaG9sZFxuICAgKiAgIHNldCB0aGUgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0IHRvIGN1cnJlbnRfdGltZSArIGFjY291bnRQb2xpY3kuZHVyYXRpb25cbiAgICogZWxzZVxuICAgKiAgIGRvIG5vdGhpbmdcbiAgICovXG4gIF9oYW5kbGVGYWlsZWRMb2dpbkF0dGVtcHQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2luaXRGYWlsZWRMb2dpbkNvdW50KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZXRMb2Nrb3V0RXhwaXJhdGlvbigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogaGFuZGxlIGxvZ2luIGF0dGVtcHQgaWYgdGhlIEFjY291bnQgTG9ja291dCBQb2xpY3kgaXMgZW5hYmxlZFxuICAgKi9cbiAgaGFuZGxlTG9naW5BdHRlbXB0KGxvZ2luU3VjY2Vzc2Z1bCkge1xuICAgIGlmICghdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9ub3RMb2NrZWQoKS50aGVuKCgpID0+IHtcbiAgICAgIGlmIChsb2dpblN1Y2Nlc3NmdWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldEZhaWxlZExvZ2luQ291bnQoMCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5faGFuZGxlRmFpbGVkTG9naW5BdHRlbXB0KCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyB0aGUgYWNjb3VudCBsb2Nrb3V0LlxuICAgKi9cbiAgdW5sb2NrQWNjb3VudCgpIHtcbiAgICBpZiAoIXRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dCB8fCAhdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICdfVXNlcicsXG4gICAgICB7IHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lIH0sXG4gICAgICB7XG4gICAgICAgIF9mYWlsZWRfbG9naW5fY291bnQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgICAgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0OiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBY2NvdW50TG9ja291dDtcbiJdfQ==
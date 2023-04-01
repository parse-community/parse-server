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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBY2NvdW50TG9ja291dCIsImNvbnN0cnVjdG9yIiwidXNlciIsImNvbmZpZyIsIl91c2VyIiwiX2NvbmZpZyIsIl9zZXRGYWlsZWRMb2dpbkNvdW50IiwidmFsdWUiLCJxdWVyeSIsInVzZXJuYW1lIiwidXBkYXRlRmllbGRzIiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsImRhdGFiYXNlIiwidXBkYXRlIiwiX2lzRmFpbGVkTG9naW5Db3VudFNldCIsIiRleGlzdHMiLCJmaW5kIiwidGhlbiIsInVzZXJzIiwiQXJyYXkiLCJpc0FycmF5IiwibGVuZ3RoIiwiX2luaXRGYWlsZWRMb2dpbkNvdW50IiwiZmFpbGVkTG9naW5Db3VudElzU2V0IiwiX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQiLCJfX29wIiwiYW1vdW50IiwiX3NldExvY2tvdXRFeHBpcmF0aW9uIiwiJGd0ZSIsImFjY291bnRMb2Nrb3V0IiwidGhyZXNob2xkIiwibm93IiwiRGF0ZSIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdldFRpbWUiLCJkdXJhdGlvbiIsImNhdGNoIiwiZXJyIiwiY29kZSIsIm1lc3NhZ2UiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJfbm90TG9ja2VkIiwiJGd0IiwiX2hhbmRsZUZhaWxlZExvZ2luQXR0ZW1wdCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImxvZ2luU3VjY2Vzc2Z1bCIsIlByb21pc2UiLCJyZXNvbHZlIiwidW5sb2NrQWNjb3VudCIsInVubG9ja09uUGFzc3dvcmRSZXNldCJdLCJzb3VyY2VzIjpbIi4uL3NyYy9BY2NvdW50TG9ja291dC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGlzIGNsYXNzIGhhbmRsZXMgdGhlIEFjY291bnQgTG9ja291dCBQb2xpY3kgc2V0dGluZ3MuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmV4cG9ydCBjbGFzcyBBY2NvdW50TG9ja291dCB7XG4gIGNvbnN0cnVjdG9yKHVzZXIsIGNvbmZpZykge1xuICAgIHRoaXMuX3VzZXIgPSB1c2VyO1xuICAgIHRoaXMuX2NvbmZpZyA9IGNvbmZpZztcbiAgfVxuXG4gIC8qKlxuICAgKiBzZXQgX2ZhaWxlZF9sb2dpbl9jb3VudCB0byB2YWx1ZVxuICAgKi9cbiAgX3NldEZhaWxlZExvZ2luQ291bnQodmFsdWUpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgIH07XG5cbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB2YWx1ZSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS51cGRhdGUoJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcyk7XG4gIH1cblxuICAvKipcbiAgICogY2hlY2sgaWYgdGhlIF9mYWlsZWRfbG9naW5fY291bnQgZmllbGQgaGFzIGJlZW4gc2V0XG4gICAqL1xuICBfaXNGYWlsZWRMb2dpbkNvdW50U2V0KCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUsXG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB7ICRleGlzdHM6IHRydWUgfSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHF1ZXJ5KS50aGVuKHVzZXJzID0+IHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHVzZXJzKSAmJiB1c2Vycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIGlmIF9mYWlsZWRfbG9naW5fY291bnQgaXMgTk9UIHNldCB0aGVuIHNldCBpdCB0byAwXG4gICAqIGVsc2UgZG8gbm90aGluZ1xuICAgKi9cbiAgX2luaXRGYWlsZWRMb2dpbkNvdW50KCkge1xuICAgIHJldHVybiB0aGlzLl9pc0ZhaWxlZExvZ2luQ291bnRTZXQoKS50aGVuKGZhaWxlZExvZ2luQ291bnRJc1NldCA9PiB7XG4gICAgICBpZiAoIWZhaWxlZExvZ2luQ291bnRJc1NldCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2V0RmFpbGVkTG9naW5Db3VudCgwKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpbmNyZW1lbnQgX2ZhaWxlZF9sb2dpbl9jb3VudCBieSAxXG4gICAqL1xuICBfaW5jcmVtZW50RmFpbGVkTG9naW5Db3VudCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgIH07XG5cbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB7IF9fb3A6ICdJbmNyZW1lbnQnLCBhbW91bnQ6IDEgfSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS51cGRhdGUoJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcyk7XG4gIH1cblxuICAvKipcbiAgICogaWYgdGhlIGZhaWxlZCBsb2dpbiBjb3VudCBpcyBncmVhdGVyIHRoYW4gdGhlIHRocmVzaG9sZFxuICAgKiB0aGVuIHNldHMgbG9ja291dCBleHBpcmF0aW9uIHRvICdjdXJyZW50dGltZSArIGFjY291bnRQb2xpY3kuZHVyYXRpb24nLCBpLmUuLCBhY2NvdW50IGlzIGxvY2tlZCBvdXQgZm9yIHRoZSBuZXh0ICdhY2NvdW50UG9saWN5LmR1cmF0aW9uJyBtaW51dGVzXG4gICAqIGVsc2UgZG8gbm90aGluZ1xuICAgKi9cbiAgX3NldExvY2tvdXRFeHBpcmF0aW9uKCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUsXG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB7ICRndGU6IHRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dC50aHJlc2hvbGQgfSxcbiAgICB9O1xuXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcblxuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIF9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdDogUGFyc2UuX2VuY29kZShcbiAgICAgICAgbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dC5kdXJhdGlvbiAqIDYwICogMTAwMClcbiAgICAgICksXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpLmNhdGNoKGVyciA9PiB7XG4gICAgICBpZiAoXG4gICAgICAgIGVyciAmJlxuICAgICAgICBlcnIuY29kZSAmJlxuICAgICAgICBlcnIubWVzc2FnZSAmJlxuICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCAmJlxuICAgICAgICBlcnIubWVzc2FnZSA9PT0gJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybjsgLy8gbm90aGluZyB0byB1cGRhdGUgc28gd2UgYXJlIGdvb2RcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycjsgLy8gdW5rbm93biBlcnJvclxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIGlmIF9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA+IGN1cnJlbnRfdGltZSBhbmQgX2ZhaWxlZF9sb2dpbl9jb3VudCA+IHRocmVzaG9sZFxuICAgKiAgIHJlamVjdCB3aXRoIGFjY291bnQgbG9ja2VkIGVycm9yXG4gICAqIGVsc2VcbiAgICogICByZXNvbHZlXG4gICAqL1xuICBfbm90TG9ja2VkKCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUsXG4gICAgICBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ6IHsgJGd0OiBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpIH0sXG4gICAgICBfZmFpbGVkX2xvZ2luX2NvdW50OiB7ICRndGU6IHRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dC50aHJlc2hvbGQgfSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHF1ZXJ5KS50aGVuKHVzZXJzID0+IHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHVzZXJzKSAmJiB1c2Vycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdZb3VyIGFjY291bnQgaXMgbG9ja2VkIGR1ZSB0byBtdWx0aXBsZSBmYWlsZWQgbG9naW4gYXR0ZW1wdHMuIFBsZWFzZSB0cnkgYWdhaW4gYWZ0ZXIgJyArXG4gICAgICAgICAgICB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQuZHVyYXRpb24gK1xuICAgICAgICAgICAgJyBtaW51dGUocyknXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogc2V0IGFuZC9vciBpbmNyZW1lbnQgX2ZhaWxlZF9sb2dpbl9jb3VudFxuICAgKiBpZiBfZmFpbGVkX2xvZ2luX2NvdW50ID4gdGhyZXNob2xkXG4gICAqICAgc2V0IHRoZSBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgdG8gY3VycmVudF90aW1lICsgYWNjb3VudFBvbGljeS5kdXJhdGlvblxuICAgKiBlbHNlXG4gICAqICAgZG8gbm90aGluZ1xuICAgKi9cbiAgX2hhbmRsZUZhaWxlZExvZ2luQXR0ZW1wdCgpIHtcbiAgICByZXR1cm4gdGhpcy5faW5pdEZhaWxlZExvZ2luQ291bnQoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5faW5jcmVtZW50RmFpbGVkTG9naW5Db3VudCgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldExvY2tvdXRFeHBpcmF0aW9uKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBoYW5kbGUgbG9naW4gYXR0ZW1wdCBpZiB0aGUgQWNjb3VudCBMb2Nrb3V0IFBvbGljeSBpcyBlbmFibGVkXG4gICAqL1xuICBoYW5kbGVMb2dpbkF0dGVtcHQobG9naW5TdWNjZXNzZnVsKSB7XG4gICAgaWYgKCF0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX25vdExvY2tlZCgpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKGxvZ2luU3VjY2Vzc2Z1bCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2V0RmFpbGVkTG9naW5Db3VudCgwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9oYW5kbGVGYWlsZWRMb2dpbkF0dGVtcHQoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIHRoZSBhY2NvdW50IGxvY2tvdXQuXG4gICAqL1xuICB1bmxvY2tBY2NvdW50KCkge1xuICAgIGlmICghdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0IHx8ICF0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgdXNlcm5hbWU6IHRoaXMuX3VzZXIudXNlcm5hbWUgfSxcbiAgICAgIHtcbiAgICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgICBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIH1cbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEFjY291bnRMb2Nrb3V0O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQTtBQUErQjtBQUQvQjs7QUFHTyxNQUFNQSxjQUFjLENBQUM7RUFDMUJDLFdBQVcsQ0FBQ0MsSUFBSSxFQUFFQyxNQUFNLEVBQUU7SUFDeEIsSUFBSSxDQUFDQyxLQUFLLEdBQUdGLElBQUk7SUFDakIsSUFBSSxDQUFDRyxPQUFPLEdBQUdGLE1BQU07RUFDdkI7O0VBRUE7QUFDRjtBQUNBO0VBQ0VHLG9CQUFvQixDQUFDQyxLQUFLLEVBQUU7SUFDMUIsTUFBTUMsS0FBSyxHQUFHO01BQ1pDLFFBQVEsRUFBRSxJQUFJLENBQUNMLEtBQUssQ0FBQ0s7SUFDdkIsQ0FBQztJQUVELE1BQU1DLFlBQVksR0FBRztNQUNuQkMsbUJBQW1CLEVBQUVKO0lBQ3ZCLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQ0YsT0FBTyxDQUFDTyxRQUFRLENBQUNDLE1BQU0sQ0FBQyxPQUFPLEVBQUVMLEtBQUssRUFBRUUsWUFBWSxDQUFDO0VBQ25FOztFQUVBO0FBQ0Y7QUFDQTtFQUNFSSxzQkFBc0IsR0FBRztJQUN2QixNQUFNTixLQUFLLEdBQUc7TUFDWkMsUUFBUSxFQUFFLElBQUksQ0FBQ0wsS0FBSyxDQUFDSyxRQUFRO01BQzdCRSxtQkFBbUIsRUFBRTtRQUFFSSxPQUFPLEVBQUU7TUFBSztJQUN2QyxDQUFDO0lBRUQsT0FBTyxJQUFJLENBQUNWLE9BQU8sQ0FBQ08sUUFBUSxDQUFDSSxJQUFJLENBQUMsT0FBTyxFQUFFUixLQUFLLENBQUMsQ0FBQ1MsSUFBSSxDQUFDQyxLQUFLLElBQUk7TUFDOUQsSUFBSUMsS0FBSyxDQUFDQyxPQUFPLENBQUNGLEtB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
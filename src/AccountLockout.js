// This class handles the Account Lockout Policy settings.
import Parse from 'parse/node';

export class AccountLockout {
  constructor(user, config) {
    this._user = user;
    this._config = config;
  }

  /**
   * set _failed_login_count to value
   */
  _setFailedLoginCount(value) {
    const query = {
      username: this._user.username,
    };

    const updateFields = {
      _failed_login_count: value,
    };

    return this._config.database.update('_User', query, updateFields);
  }

  /**
   * increment _failed_login_count by 1 and return the updated document
   */
  _incrementFailedLoginCount() {
    const query = {
      username: this._user.username,
    };

    const updateFields = {
      _failed_login_count: { __op: 'Increment', amount: 1 },
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
      _failed_login_count: { $gte: this._config.accountLockout.threshold },
    };

    const now = new Date();

    const updateFields = {
      _account_lockout_expires_at: Parse._encode(
        new Date(now.getTime() + this._config.accountLockout.duration * 60 * 1000)
      ),
    };

    return this._config.database.update('_User', query, updateFields).catch(err => {
      if (
        err &&
        err.code &&
        err.message &&
        err.code === Parse.Error.OBJECT_NOT_FOUND &&
        err.message === 'Object not found.'
      ) {
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
      _account_lockout_expires_at: { $gt: Parse._encode(new Date()) },
      _failed_login_count: { $gte: this._config.accountLockout.threshold },
    };

    return this._config.database.find('_User', query).then(users => {
      if (Array.isArray(users) && users.length > 0) {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Your account is locked due to multiple failed login attempts. Please try again after ' +
            this._config.accountLockout.duration +
            ' minute(s)'
        );
      }
    });
  }

  /**
   * Atomically increment _failed_login_count and enforce lockout threshold.
   * Uses the atomic increment result to determine the exact post-increment
   * count, eliminating the TOCTOU race between checking and updating.
   */
  _handleFailedLoginAttempt() {
    return this._incrementFailedLoginCount().then(result => {
      const count = result._failed_login_count;
      if (count >= this._config.accountLockout.threshold) {
        return this._setLockoutExpiration().then(() => {
          if (count > this._config.accountLockout.threshold) {
            throw new Parse.Error(
              Parse.Error.OBJECT_NOT_FOUND,
              'Your account is locked due to multiple failed login attempts. Please try again after ' +
                this._config.accountLockout.duration +
                ' minute(s)'
            );
          }
        });
      }
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
    return this._config.database.update(
      '_User',
      { username: this._user.username },
      {
        _failed_login_count: { __op: 'Delete' },
        _account_lockout_expires_at: { __op: 'Delete' },
      }
    );
  }
}

export default AccountLockout;

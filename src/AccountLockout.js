// This class handles the Account Lockout Policy settings.

import Config         from './Config';

export class AccountLockout {
  constructor(user, config) {
    this._user = user;
    this._config = config;
  }

  /**
   * set _failed_login_count to value
   */
  _setFailedLoginCount(value) {
    let query = {
      username: this._user.username,
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
    return new Promise((resolve, reject) => {
      const query = {
        username: this._user.username,
        _failed_login_count: { $exists: true }
      };

      this._config.database.find('_User', query)
      .then(users => {
        if (Array.isArray(users) && users.length > 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .catch(err => {
        reject(err);
      });
    });
  }

  /**
   * if _failed_login_count is NOT set then set it to 0
   * else do nothing
   */
  _initFailedLoginCount() {
    return new Promise((resolve, reject) => {

      this._isFailedLoginCountSet()
      .then(failedLoginCountIsSet => {
        if (!failedLoginCountIsSet) {
          return this._setFailedLoginCount(0);
        } else {
          return Promise.resolve();
        }
      })
      .then(() => {
        resolve();
      })
      .catch(err => {
        reject(err);
      });
    });
  }

  /**
   * increment _failed_login_count by 1
   */
  _incrementFailedLoginCount() {
    const query = {
      username: this._user.username,
    };

    const updateFields = {_failed_login_count: {__op: 'Increment', amount: 1}};

    return this._config.database.update('_User', query, updateFields);
  }

  /**
   * if the failed login count is greater than the threshold 
   * then sets lockout expiration to 'currenttime + accountPolicy.duration', i.e., account is locked out for the next 'accountPolicy.duration' minutes 
   * else do nothing
   */
  _setLockoutExpiration() {
    return new Promise((resolve, reject) => {
      const query = {
        username: this._user.username,
        _failed_login_count: { $gte: this._config.accountLockout.threshold },
      };

      const now = new Date();

      const updateFields = {
        _account_lockout_expires_at: Parse._encode(new Date(now.getTime() + this._config.accountLockout.duration*60*1000))
      };

      this._config.database.update('_User', query, updateFields)
      .then(() => {
        resolve();
      })
      .catch(err => {
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
  _notLocked() {
    return new Promise((resolve, reject) => {
      const query = {
        username: this._user.username,
        _account_lockout_expires_at: { $gt: Parse._encode(new Date()) },
        _failed_login_count: {$gte: this._config.accountLockout.threshold}
      };

      this._config.database.find('_User', query)
      .then(users => {
        if (Array.isArray(users) && users.length > 0) {
          reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Your account is locked due to multiple failed login attempts. Please try again after ' + this._config.accountLockout.duration + ' minute(s)'));
        } else {
          resolve();
        }
      })
      .catch(err => {
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
  _handleFailedLoginAttempt() {
    return new Promise((resolve, reject) => {
      this._initFailedLoginCount()
      .then(() => {
        return this._incrementFailedLoginCount();
      })
      .then(() => {
        return this._setLockoutExpiration();
      })
      .then(() => {
        resolve();
      })
      .catch(err => {
        reject(err);
      });
    });
  }

  /**
   * handle login attempt if the Account Lockout Policy is enabled
   */
  handleLoginAttempt(loginSuccessful) {
    if (!this._config.accountLockout) {
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      this._notLocked()
      .then(() => {
        if (loginSuccessful) {
          return this._setFailedLoginCount(0);
        } else {
          return this._handleFailedLoginAttempt();
        }
      })
      .then(() => {
        resolve();
      })
      .catch(err => {
        reject(err);
      });
    });
  }

}

export default AccountLockout;

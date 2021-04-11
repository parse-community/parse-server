export var __esModule: boolean;
export default _default;
export class AccountLockout {
    constructor(user: any, config: any);
    _user: any;
    _config: any;
    /**
     * set _failed_login_count to value
     */
    _setFailedLoginCount(value: any): any;
    /**
     * check if the _failed_login_count field has been set
     */
    _isFailedLoginCountSet(): any;
    /**
     * if _failed_login_count is NOT set then set it to 0
     * else do nothing
     */
    _initFailedLoginCount(): any;
    /**
     * increment _failed_login_count by 1
     */
    _incrementFailedLoginCount(): any;
    /**
     * if the failed login count is greater than the threshold
     * then sets lockout expiration to 'currenttime + accountPolicy.duration', i.e., account is locked out for the next 'accountPolicy.duration' minutes
     * else do nothing
     */
    _setLockoutExpiration(): any;
    /**
     * if _account_lockout_expires_at > current_time and _failed_login_count > threshold
     *   reject with account locked error
     * else
     *   resolve
     */
    _notLocked(): any;
    /**
     * set and/or increment _failed_login_count
     * if _failed_login_count > threshold
     *   set the _account_lockout_expires_at to current_time + accountPolicy.duration
     * else
     *   do nothing
     */
    _handleFailedLoginAttempt(): any;
    /**
     * handle login attempt if the Account Lockout Policy is enabled
     */
    handleLoginAttempt(loginSuccessful: any): any;
    /**
     * Removes the account lockout.
     */
    unlockAccount(): any;
}
declare var _default: typeof AccountLockout;

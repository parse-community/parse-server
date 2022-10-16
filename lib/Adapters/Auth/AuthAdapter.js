"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AuthAdapter = void 0;

/*eslint no-unused-vars: "off"*/

/**
 * @interface ParseAuthResponse
 * @property {Boolean} [doNotSave] If true, Parse Server will not save provided authData.
 * @property {Object} [response] If set, Parse Server will send the provided response to the client under authDataResponse
 * @property {Object} [save] If set, Parse Server will save the object provided into this key, instead of client provided authData
 */

/**
 * AuthPolicy
 * default: can be combined with ONE additional auth provider if additional configured on user
 * additional: could be only used with a default policy auth provider
 * solo: Will ignore ALL additional providers if additional configured on user
 * @typedef {"default" | "additional" | "solo"} AuthPolicy
 */
class AuthAdapter {
  constructor() {
    /**
     * Usage policy
     * @type {AuthPolicy}
     */
    this.policy = 'default';
  }
  /**
   * @param appIds The specified app IDs in the configuration
   * @param {Object} authData The client provided authData
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {(Promise<undefined|void>|void|undefined)} resolves or returns if the applicationId is valid
   */


  validateAppId(appIds, authData) {
    return Promise.resolve({});
  }
  /**
   * Legacy usage, if provided it will be triggered when authData related to this provider is touched (signup/update/login)
   * otherwise you should implement validateSetup, validateLogin and validateUpdate
   * @param {Object} authData The client provided authData
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */


  validateAuthData(authData, request) {
    return Promise.resolve({});
  }
  /**
   * Triggered when user provide for the first time this auth provider
   * could be a register or the user adding a new auth service
   * @param {Object} authData The client provided authData
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */


  validateSetUp(authData, req) {
    return Promise.resolve({});
  }
  /**
   * Triggered when user provide authData related to this provider
   * The user is not logged in and has already set this provider before
   * @param {Object} authData The client provided authData
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */


  validateLogin(authData, req) {
    return Promise.resolve({});
  }
  /**
   * Triggered when user provide authData related to this provider
   * the user is logged in and has already set this provider before
   * @param {Object} authData The client provided authData
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */


  validateUpdate(authData, req) {
    return Promise.resolve({});
  }
  /**
   * Triggered in pre authentication process if needed (like webauthn, SMS OTP)
   * @param {Object} challengeData Data provided by the client
   * @param {(Object|undefined)} authData Auth data provided by the client, can be used for validation
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<Object>} A promise that resolves, resolved value will be added to challenge response under challenge key
   */


  challenge(challengeData, authData, req) {
    return Promise.resolve({});
  }

}

exports.AuthAdapter = AuthAdapter;
var _default = AuthAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL0F1dGhBZGFwdGVyLmpzIl0sIm5hbWVzIjpbIkF1dGhBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJwb2xpY3kiLCJ2YWxpZGF0ZUFwcElkIiwiYXBwSWRzIiwiYXV0aERhdGEiLCJQcm9taXNlIiwicmVzb2x2ZSIsInZhbGlkYXRlQXV0aERhdGEiLCJyZXF1ZXN0IiwidmFsaWRhdGVTZXRVcCIsInJlcSIsInZhbGlkYXRlTG9naW4iLCJ2YWxpZGF0ZVVwZGF0ZSIsImNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFTyxNQUFNQSxXQUFOLENBQWtCO0FBQ3ZCQyxFQUFBQSxXQUFXLEdBQUc7QUFDWjtBQUNKO0FBQ0E7QUFDQTtBQUNJLFNBQUtDLE1BQUwsR0FBYyxTQUFkO0FBQ0Q7QUFDRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFQyxFQUFBQSxhQUFhLENBQUNDLE1BQUQsRUFBU0MsUUFBVCxFQUFtQjtBQUM5QixXQUFPQyxPQUFPLENBQUNDLE9BQVIsQ0FBZ0IsRUFBaEIsQ0FBUDtBQUNEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFQyxFQUFBQSxnQkFBZ0IsQ0FBQ0gsUUFBRCxFQUFXSSxPQUFYLEVBQW9CO0FBQ2xDLFdBQU9ILE9BQU8sQ0FBQ0MsT0FBUixDQUFnQixFQUFoQixDQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VHLEVBQUFBLGFBQWEsQ0FBQ0wsUUFBRCxFQUFXTSxHQUFYLEVBQWdCO0FBQzNCLFdBQU9MLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQixFQUFoQixDQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VLLEVBQUFBLGFBQWEsQ0FBQ1AsUUFBRCxFQUFXTSxHQUFYLEVBQWdCO0FBQzNCLFdBQU9MLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQixFQUFoQixDQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VNLEVBQUFBLGNBQWMsQ0FBQ1IsUUFBRCxFQUFXTSxHQUFYLEVBQWdCO0FBQzVCLFdBQU9MLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQixFQUFoQixDQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VPLEVBQUFBLFNBQVMsQ0FBQ0MsYUFBRCxFQUFnQlYsUUFBaEIsRUFBMEJNLEdBQTFCLEVBQStCO0FBQ3RDLFdBQU9MLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQixFQUFoQixDQUFQO0FBQ0Q7O0FBdkVzQjs7O2VBMEVWUCxXIiwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2VBdXRoUmVzcG9uc2VcbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gW2RvTm90U2F2ZV0gSWYgdHJ1ZSwgUGFyc2UgU2VydmVyIHdpbGwgbm90IHNhdmUgcHJvdmlkZWQgYXV0aERhdGEuXG4gKiBAcHJvcGVydHkge09iamVjdH0gW3Jlc3BvbnNlXSBJZiBzZXQsIFBhcnNlIFNlcnZlciB3aWxsIHNlbmQgdGhlIHByb3ZpZGVkIHJlc3BvbnNlIHRvIHRoZSBjbGllbnQgdW5kZXIgYXV0aERhdGFSZXNwb25zZVxuICogQHByb3BlcnR5IHtPYmplY3R9IFtzYXZlXSBJZiBzZXQsIFBhcnNlIFNlcnZlciB3aWxsIHNhdmUgdGhlIG9iamVjdCBwcm92aWRlZCBpbnRvIHRoaXMga2V5LCBpbnN0ZWFkIG9mIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICovXG5cbi8qKlxuICogQXV0aFBvbGljeVxuICogZGVmYXVsdDogY2FuIGJlIGNvbWJpbmVkIHdpdGggT05FIGFkZGl0aW9uYWwgYXV0aCBwcm92aWRlciBpZiBhZGRpdGlvbmFsIGNvbmZpZ3VyZWQgb24gdXNlclxuICogYWRkaXRpb25hbDogY291bGQgYmUgb25seSB1c2VkIHdpdGggYSBkZWZhdWx0IHBvbGljeSBhdXRoIHByb3ZpZGVyXG4gKiBzb2xvOiBXaWxsIGlnbm9yZSBBTEwgYWRkaXRpb25hbCBwcm92aWRlcnMgaWYgYWRkaXRpb25hbCBjb25maWd1cmVkIG9uIHVzZXJcbiAqIEB0eXBlZGVmIHtcImRlZmF1bHRcIiB8IFwiYWRkaXRpb25hbFwiIHwgXCJzb2xvXCJ9IEF1dGhQb2xpY3lcbiAqL1xuXG5leHBvcnQgY2xhc3MgQXV0aEFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvKipcbiAgICAgKiBVc2FnZSBwb2xpY3lcbiAgICAgKiBAdHlwZSB7QXV0aFBvbGljeX1cbiAgICAgKi9cbiAgICB0aGlzLnBvbGljeSA9ICdkZWZhdWx0JztcbiAgfVxuICAvKipcbiAgICogQHBhcmFtIGFwcElkcyBUaGUgc3BlY2lmaWVkIGFwcCBJRHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7KFByb21pc2U8dW5kZWZpbmVkfHZvaWQ+fHZvaWR8dW5kZWZpbmVkKX0gcmVzb2x2ZXMgb3IgcmV0dXJucyBpZiB0aGUgYXBwbGljYXRpb25JZCBpcyB2YWxpZFxuICAgKi9cbiAgdmFsaWRhdGVBcHBJZChhcHBJZHMsIGF1dGhEYXRhKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogTGVnYWN5IHVzYWdlLCBpZiBwcm92aWRlZCBpdCB3aWxsIGJlIHRyaWdnZXJlZCB3aGVuIGF1dGhEYXRhIHJlbGF0ZWQgdG8gdGhpcyBwcm92aWRlciBpcyB0b3VjaGVkIChzaWdudXAvdXBkYXRlL2xvZ2luKVxuICAgKiBvdGhlcndpc2UgeW91IHNob3VsZCBpbXBsZW1lbnQgdmFsaWRhdGVTZXR1cCwgdmFsaWRhdGVMb2dpbiBhbmQgdmFsaWRhdGVVcGRhdGVcbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUF1dGhSZXNwb25zZXx2b2lkfHVuZGVmaW5lZD59XG4gICAqL1xuICB2YWxpZGF0ZUF1dGhEYXRhKGF1dGhEYXRhLCByZXF1ZXN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIHdoZW4gdXNlciBwcm92aWRlIGZvciB0aGUgZmlyc3QgdGltZSB0aGlzIGF1dGggcHJvdmlkZXJcbiAgICogY291bGQgYmUgYSByZWdpc3RlciBvciB0aGUgdXNlciBhZGRpbmcgYSBuZXcgYXV0aCBzZXJ2aWNlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVTZXRVcChhdXRoRGF0YSwgcmVxKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIHdoZW4gdXNlciBwcm92aWRlIGF1dGhEYXRhIHJlbGF0ZWQgdG8gdGhpcyBwcm92aWRlclxuICAgKiBUaGUgdXNlciBpcyBub3QgbG9nZ2VkIGluIGFuZCBoYXMgYWxyZWFkeSBzZXQgdGhpcyBwcm92aWRlciBiZWZvcmVcbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUF1dGhSZXNwb25zZXx2b2lkfHVuZGVmaW5lZD59XG4gICAqL1xuICB2YWxpZGF0ZUxvZ2luKGF1dGhEYXRhLCByZXEpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgd2hlbiB1c2VyIHByb3ZpZGUgYXV0aERhdGEgcmVsYXRlZCB0byB0aGlzIHByb3ZpZGVyXG4gICAqIHRoZSB1c2VyIGlzIGxvZ2dlZCBpbiBhbmQgaGFzIGFscmVhZHkgc2V0IHRoaXMgcHJvdmlkZXIgYmVmb3JlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVVcGRhdGUoYXV0aERhdGEsIHJlcSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCBpbiBwcmUgYXV0aGVudGljYXRpb24gcHJvY2VzcyBpZiBuZWVkZWQgKGxpa2Ugd2ViYXV0aG4sIFNNUyBPVFApXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjaGFsbGVuZ2VEYXRhIERhdGEgcHJvdmlkZWQgYnkgdGhlIGNsaWVudFxuICAgKiBAcGFyYW0geyhPYmplY3R8dW5kZWZpbmVkKX0gYXV0aERhdGEgQXV0aCBkYXRhIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnQsIGNhbiBiZSB1c2VkIGZvciB2YWxpZGF0aW9uXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMsIHJlc29sdmVkIHZhbHVlIHdpbGwgYmUgYWRkZWQgdG8gY2hhbGxlbmdlIHJlc3BvbnNlIHVuZGVyIGNoYWxsZW5nZSBrZXlcbiAgICovXG4gIGNoYWxsZW5nZShjaGFsbGVuZ2VEYXRhLCBhdXRoRGF0YSwgcmVxKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQXV0aEFkYXB0ZXI7XG4iXX0=
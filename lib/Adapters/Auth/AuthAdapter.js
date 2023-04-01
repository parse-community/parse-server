"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AuthAdapter = void 0;
/*eslint no-unused-vars: "off"*/

/**
 * @interface ParseAuthResponse
 * @property {Boolean} [doNotSave] If true, Parse Server will do not save provided authData.
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
   * @param {Object} options Additional options
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} config
   * @returns {(Promise<undefined|void>|void|undefined)} resolves or returns if the applicationId is valid
   */
  validateAppId(appIds, authData, options, request) {
    return Promise.resolve({});
  }

  /**
   * Legacy usage, if provided it will be triggered when authData related to this provider is touched (signup/update/login)
   * otherwise you should implement validateSetup, validateLogin and validateUpdate
   * @param {Object} authData The client provided authData
   * @param {Object} options Additional options
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} config Parse Server config object
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateAuthData(authData, options, request, config) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide for the first time this auth provider
   * could be a register or the user adding a new auth service
   * @param {Object} authData The client provided authData
   * @param {Object} options Additional options
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} config Parse Server config object
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateSetUp(authData, options, req, user) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide authData related to this provider
   * The user is not logged in and has already set this provider before
   * @param {Object} authData The client provided authData
   * @param {Object} options Additional options
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} config
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateLogin(authData, options, req, user) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide authData related to this provider
   * the user is logged in and has already set this provider before
   * @param {Object} authData The client provided authData
   * @param {Object} options Additional options
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} config
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateUpdate(authData, options, req, user) {
    return Promise.resolve({});
  }

  /**
   * Triggered in pre authentication process if needed (like webauthn, SMS OTP)
   * @param {Object} challengeData Data provided by the client
   * @param {(Object|undefined)} authData Auth data provided by the client, can be used for validation
   * @param {Object} options Additional options
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} config Parse Server config object
   * @returns {Promise<Object>} A promise that resolves, resolved value will be added to challenge response under challenge key
   */
  challenge(challengeData, authData, options, req, user) {
    return Promise.resolve({});
  }
}
exports.AuthAdapter = AuthAdapter;
var _default = AuthAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBdXRoQWRhcHRlciIsImNvbnN0cnVjdG9yIiwicG9saWN5IiwidmFsaWRhdGVBcHBJZCIsImFwcElkcyIsImF1dGhEYXRhIiwib3B0aW9ucyIsInJlcXVlc3QiLCJQcm9taXNlIiwicmVzb2x2ZSIsInZhbGlkYXRlQXV0aERhdGEiLCJjb25maWciLCJ2YWxpZGF0ZVNldFVwIiwicmVxIiwidXNlciIsInZhbGlkYXRlTG9naW4iLCJ2YWxpZGF0ZVVwZGF0ZSIsImNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJleHBvcnRzIiwiX2RlZmF1bHQiLCJkZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0F1dGgvQXV0aEFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2VBdXRoUmVzcG9uc2VcbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gW2RvTm90U2F2ZV0gSWYgdHJ1ZSwgUGFyc2UgU2VydmVyIHdpbGwgZG8gbm90IHNhdmUgcHJvdmlkZWQgYXV0aERhdGEuXG4gKiBAcHJvcGVydHkge09iamVjdH0gW3Jlc3BvbnNlXSBJZiBzZXQsIFBhcnNlIFNlcnZlciB3aWxsIHNlbmQgdGhlIHByb3ZpZGVkIHJlc3BvbnNlIHRvIHRoZSBjbGllbnQgdW5kZXIgYXV0aERhdGFSZXNwb25zZVxuICogQHByb3BlcnR5IHtPYmplY3R9IFtzYXZlXSBJZiBzZXQsIFBhcnNlIFNlcnZlciB3aWxsIHNhdmUgdGhlIG9iamVjdCBwcm92aWRlZCBpbnRvIHRoaXMga2V5LCBpbnN0ZWFkIG9mIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICovXG5cbi8qKlxuICogQXV0aFBvbGljeVxuICogZGVmYXVsdDogY2FuIGJlIGNvbWJpbmVkIHdpdGggT05FIGFkZGl0aW9uYWwgYXV0aCBwcm92aWRlciBpZiBhZGRpdGlvbmFsIGNvbmZpZ3VyZWQgb24gdXNlclxuICogYWRkaXRpb25hbDogY291bGQgYmUgb25seSB1c2VkIHdpdGggYSBkZWZhdWx0IHBvbGljeSBhdXRoIHByb3ZpZGVyXG4gKiBzb2xvOiBXaWxsIGlnbm9yZSBBTEwgYWRkaXRpb25hbCBwcm92aWRlcnMgaWYgYWRkaXRpb25hbCBjb25maWd1cmVkIG9uIHVzZXJcbiAqIEB0eXBlZGVmIHtcImRlZmF1bHRcIiB8IFwiYWRkaXRpb25hbFwiIHwgXCJzb2xvXCJ9IEF1dGhQb2xpY3lcbiAqL1xuXG5leHBvcnQgY2xhc3MgQXV0aEFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvKipcbiAgICAgKiBVc2FnZSBwb2xpY3lcbiAgICAgKiBAdHlwZSB7QXV0aFBvbGljeX1cbiAgICAgKi9cbiAgICB0aGlzLnBvbGljeSA9ICdkZWZhdWx0JztcbiAgfVxuICAvKipcbiAgICogQHBhcmFtIGFwcElkcyBUaGUgc3BlY2lmaWVkIGFwcCBJRHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQWRkaXRpb25hbCBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZ1xuICAgKiBAcmV0dXJucyB7KFByb21pc2U8dW5kZWZpbmVkfHZvaWQ+fHZvaWR8dW5kZWZpbmVkKX0gcmVzb2x2ZXMgb3IgcmV0dXJucyBpZiB0aGUgYXBwbGljYXRpb25JZCBpcyB2YWxpZFxuICAgKi9cbiAgdmFsaWRhdGVBcHBJZChhcHBJZHMsIGF1dGhEYXRhLCBvcHRpb25zLCByZXF1ZXN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogTGVnYWN5IHVzYWdlLCBpZiBwcm92aWRlZCBpdCB3aWxsIGJlIHRyaWdnZXJlZCB3aGVuIGF1dGhEYXRhIHJlbGF0ZWQgdG8gdGhpcyBwcm92aWRlciBpcyB0b3VjaGVkIChzaWdudXAvdXBkYXRlL2xvZ2luKVxuICAgKiBvdGhlcndpc2UgeW91IHNob3VsZCBpbXBsZW1lbnQgdmFsaWRhdGVTZXR1cCwgdmFsaWRhdGVMb2dpbiBhbmQgdmFsaWRhdGVVcGRhdGVcbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQWRkaXRpb25hbCBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyBQYXJzZSBTZXJ2ZXIgY29uZmlnIG9iamVjdFxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUF1dGhSZXNwb25zZXx2b2lkfHVuZGVmaW5lZD59XG4gICAqL1xuICB2YWxpZGF0ZUF1dGhEYXRhKGF1dGhEYXRhLCBvcHRpb25zLCByZXF1ZXN0LCBjb25maWcpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgd2hlbiB1c2VyIHByb3ZpZGUgZm9yIHRoZSBmaXJzdCB0aW1lIHRoaXMgYXV0aCBwcm92aWRlclxuICAgKiBjb3VsZCBiZSBhIHJlZ2lzdGVyIG9yIHRoZSB1c2VyIGFkZGluZyBhIG5ldyBhdXRoIHNlcnZpY2VcbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQWRkaXRpb25hbCBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyBQYXJzZSBTZXJ2ZXIgY29uZmlnIG9iamVjdFxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUF1dGhSZXNwb25zZXx2b2lkfHVuZGVmaW5lZD59XG4gICAqL1xuICB2YWxpZGF0ZVNldFVwKGF1dGhEYXRhLCBvcHRpb25zLCByZXEsIHVzZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgd2hlbiB1c2VyIHByb3ZpZGUgYXV0aERhdGEgcmVsYXRlZCB0byB0aGlzIHByb3ZpZGVyXG4gICAqIFRoZSB1c2VyIGlzIG5vdCBsb2dnZWQgaW4gYW5kIGhhcyBhbHJlYWR5IHNldCB0aGlzIHByb3ZpZGVyIGJlZm9yZVxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBBZGRpdGlvbmFsIG9wdGlvbnNcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlQXV0aFJlc3BvbnNlfHZvaWR8dW5kZWZpbmVkPn1cbiAgICovXG4gIHZhbGlkYXRlTG9naW4oYXV0aERhdGEsIG9wdGlvbnMsIHJlcSwgdXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIHVzZXIgcHJvdmlkZSBhdXRoRGF0YSByZWxhdGVkIHRvIHRoaXMgcHJvdmlkZXJcbiAgICogdGhlIHVzZXIgaXMgbG9nZ2VkIGluIGFuZCBoYXMgYWxyZWFkeSBzZXQgdGhpcyBwcm92aWRlciBiZWZvcmVcbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQWRkaXRpb25hbCBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZ1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUF1dGhSZXNwb25zZXx2b2lkfHVuZGVmaW5lZD59XG4gICAqL1xuICB2YWxpZGF0ZVVwZGF0ZShhdXRoRGF0YSwgb3B0aW9ucywgcmVxLCB1c2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIGluIHByZSBhdXRoZW50aWNhdGlvbiBwcm9jZXNzIGlmIG5lZWRlZCAobGlrZSB3ZWJhdXRobiwgU01TIE9UUClcbiAgICogQHBhcmFtIHtPYmplY3R9IGNoYWxsZW5nZURhdGEgRGF0YSBwcm92aWRlZCBieSB0aGUgY2xpZW50XG4gICAqIEBwYXJhbSB7KE9iamVjdHx1bmRlZmluZWQpfSBhdXRoRGF0YSBBdXRoIGRhdGEgcHJvdmlkZWQgYnkgdGhlIGNsaWVudCwgY2FuIGJlIHVzZWQgZm9yIHZhbGlkYXRpb25cbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQWRkaXRpb25hbCBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyBQYXJzZSBTZXJ2ZXIgY29uZmlnIG9iamVjdFxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBBIHByb21pc2UgdGhhdCByZXNvbHZlcywgcmVzb2x2ZWQgdmFsdWUgd2lsbCBiZSBhZGRlZCB0byBjaGFsbGVuZ2UgcmVzcG9uc2UgdW5kZXIgY2hhbGxlbmdlIGtleVxuICAgKi9cbiAgY2hhbGxlbmdlKGNoYWxsZW5nZURhdGEsIGF1dGhEYXRhLCBvcHRpb25zLCByZXEsIHVzZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBdXRoQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVPLE1BQU1BLFdBQVcsQ0FBQztFQUN2QkMsV0FBV0EsQ0FBQSxFQUFHO0lBQ1o7QUFDSjtBQUNBO0FBQ0E7SUFDSSxJQUFJLENBQUNDLE1BQU0sR0FBRyxTQUFTO0VBQ3pCO0VBQ0E7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxhQUFhQSxDQUFDQyxNQUFNLEVBQUVDLFFBQVEsRUFBRUMsT0FBTyxFQUFFQyxPQUFPLEVBQUU7SUFDaEQsT0FBT0MsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDNUI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLGdCQUFnQkEsQ0FBQ0wsUUFBUSxFQUFFQyxPQUFPLEVBQUVDLE9BQU8sRUFBRUksTUFBTSxFQUFFO0lBQ25ELE9BQU9ILE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFRyxhQUFhQSxDQUFDUCxRQUFRLEVBQUVDLE9BQU8sRUFBRU8sR0FBRyxFQUFFQyxJQUFJLEVBQUU7SUFDMUMsT0FBT04sT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDNUI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VNLGFBQWFBLENBQUNWLFFBQVEsRUFBRUMsT0FBTyxFQUFFTyxHQUFHLEVBQUVDLElBQUksRUFBRTtJQUMxQyxPQUFPTixPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1Qjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRU8sY0FBY0EsQ0FBQ1gsUUFBUSxFQUFFQyxPQUFPLEVBQUVPLEdBQUcsRUFBRUMsSUFBSSxFQUFFO0lBQzNDLE9BQU9OLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFUSxTQUFTQSxDQUFDQyxhQUFhLEVBQUViLFFBQVEsRUFBRUMsT0FBTyxFQUFFTyxHQUFHLEVBQUVDLElBQUksRUFBRTtJQUNyRCxPQUFPTixPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1QjtBQUNGO0FBQUNVLE9BQUEsQ0FBQW5CLFdBQUEsR0FBQUEsV0FBQTtBQUFBLElBQUFvQixRQUFBLEdBRWNwQixXQUFXO0FBQUFtQixPQUFBLENBQUFFLE9BQUEsR0FBQUQsUUFBQSJ9
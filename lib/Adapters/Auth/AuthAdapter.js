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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL0F1dGhBZGFwdGVyLmpzIl0sIm5hbWVzIjpbIkF1dGhBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJwb2xpY3kiLCJ2YWxpZGF0ZUFwcElkIiwiYXBwSWRzIiwiYXV0aERhdGEiLCJvcHRpb25zIiwicmVxdWVzdCIsIlByb21pc2UiLCJyZXNvbHZlIiwidmFsaWRhdGVBdXRoRGF0YSIsImNvbmZpZyIsInZhbGlkYXRlU2V0VXAiLCJyZXEiLCJ1c2VyIiwidmFsaWRhdGVMb2dpbiIsInZhbGlkYXRlVXBkYXRlIiwiY2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVPLE1BQU1BLFdBQU4sQ0FBa0I7QUFDdkJDLEVBQUFBLFdBQVcsR0FBRztBQUNaO0FBQ0o7QUFDQTtBQUNBO0FBQ0ksU0FBS0MsTUFBTCxHQUFjLFNBQWQ7QUFDRDtBQUNEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFQyxFQUFBQSxhQUFhLENBQUNDLE1BQUQsRUFBU0MsUUFBVCxFQUFtQkMsT0FBbkIsRUFBNEJDLE9BQTVCLEVBQXFDO0FBQ2hELFdBQU9DLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQixFQUFoQixDQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFQyxFQUFBQSxnQkFBZ0IsQ0FBQ0wsUUFBRCxFQUFXQyxPQUFYLEVBQW9CQyxPQUFwQixFQUE2QkksTUFBN0IsRUFBcUM7QUFDbkQsV0FBT0gsT0FBTyxDQUFDQyxPQUFSLENBQWdCLEVBQWhCLENBQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VHLEVBQUFBLGFBQWEsQ0FBQ1AsUUFBRCxFQUFXQyxPQUFYLEVBQW9CTyxHQUFwQixFQUF5QkMsSUFBekIsRUFBK0I7QUFDMUMsV0FBT04sT0FBTyxDQUFDQyxPQUFSLENBQWdCLEVBQWhCLENBQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VNLEVBQUFBLGFBQWEsQ0FBQ1YsUUFBRCxFQUFXQyxPQUFYLEVBQW9CTyxHQUFwQixFQUF5QkMsSUFBekIsRUFBK0I7QUFDMUMsV0FBT04sT0FBTyxDQUFDQyxPQUFSLENBQWdCLEVBQWhCLENBQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VPLEVBQUFBLGNBQWMsQ0FBQ1gsUUFBRCxFQUFXQyxPQUFYLEVBQW9CTyxHQUFwQixFQUF5QkMsSUFBekIsRUFBK0I7QUFDM0MsV0FBT04sT0FBTyxDQUFDQyxPQUFSLENBQWdCLEVBQWhCLENBQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VRLEVBQUFBLFNBQVMsQ0FBQ0MsYUFBRCxFQUFnQmIsUUFBaEIsRUFBMEJDLE9BQTFCLEVBQW1DTyxHQUFuQyxFQUF3Q0MsSUFBeEMsRUFBOEM7QUFDckQsV0FBT04sT0FBTyxDQUFDQyxPQUFSLENBQWdCLEVBQWhCLENBQVA7QUFDRDs7QUFuRnNCOzs7ZUFzRlZULFciLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZUF1dGhSZXNwb25zZVxuICogQHByb3BlcnR5IHtCb29sZWFufSBbZG9Ob3RTYXZlXSBJZiB0cnVlLCBQYXJzZSBTZXJ2ZXIgd2lsbCBkbyBub3Qgc2F2ZSBwcm92aWRlZCBhdXRoRGF0YS5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBbcmVzcG9uc2VdIElmIHNldCwgUGFyc2UgU2VydmVyIHdpbGwgc2VuZCB0aGUgcHJvdmlkZWQgcmVzcG9uc2UgdG8gdGhlIGNsaWVudCB1bmRlciBhdXRoRGF0YVJlc3BvbnNlXG4gKiBAcHJvcGVydHkge09iamVjdH0gW3NhdmVdIElmIHNldCwgUGFyc2UgU2VydmVyIHdpbGwgc2F2ZSB0aGUgb2JqZWN0IHByb3ZpZGVkIGludG8gdGhpcyBrZXksIGluc3RlYWQgb2YgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gKi9cblxuLyoqXG4gKiBBdXRoUG9saWN5XG4gKiBkZWZhdWx0OiBjYW4gYmUgY29tYmluZWQgd2l0aCBPTkUgYWRkaXRpb25hbCBhdXRoIHByb3ZpZGVyIGlmIGFkZGl0aW9uYWwgY29uZmlndXJlZCBvbiB1c2VyXG4gKiBhZGRpdGlvbmFsOiBjb3VsZCBiZSBvbmx5IHVzZWQgd2l0aCBhIGRlZmF1bHQgcG9saWN5IGF1dGggcHJvdmlkZXJcbiAqIHNvbG86IFdpbGwgaWdub3JlIEFMTCBhZGRpdGlvbmFsIHByb3ZpZGVycyBpZiBhZGRpdGlvbmFsIGNvbmZpZ3VyZWQgb24gdXNlclxuICogQHR5cGVkZWYge1wiZGVmYXVsdFwiIHwgXCJhZGRpdGlvbmFsXCIgfCBcInNvbG9cIn0gQXV0aFBvbGljeVxuICovXG5cbmV4cG9ydCBjbGFzcyBBdXRoQWRhcHRlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8qKlxuICAgICAqIFVzYWdlIHBvbGljeVxuICAgICAqIEB0eXBlIHtBdXRoUG9saWN5fVxuICAgICAqL1xuICAgIHRoaXMucG9saWN5ID0gJ2RlZmF1bHQnO1xuICB9XG4gIC8qKlxuICAgKiBAcGFyYW0gYXBwSWRzIFRoZSBzcGVjaWZpZWQgYXBwIElEcyBpbiB0aGUgY29uZmlndXJhdGlvblxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBBZGRpdGlvbmFsIG9wdGlvbnNcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnXG4gICAqIEByZXR1cm5zIHsoUHJvbWlzZTx1bmRlZmluZWR8dm9pZD58dm9pZHx1bmRlZmluZWQpfSByZXNvbHZlcyBvciByZXR1cm5zIGlmIHRoZSBhcHBsaWNhdGlvbklkIGlzIHZhbGlkXG4gICAqL1xuICB2YWxpZGF0ZUFwcElkKGFwcElkcywgYXV0aERhdGEsIG9wdGlvbnMsIHJlcXVlc3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMZWdhY3kgdXNhZ2UsIGlmIHByb3ZpZGVkIGl0IHdpbGwgYmUgdHJpZ2dlcmVkIHdoZW4gYXV0aERhdGEgcmVsYXRlZCB0byB0aGlzIHByb3ZpZGVyIGlzIHRvdWNoZWQgKHNpZ251cC91cGRhdGUvbG9naW4pXG4gICAqIG90aGVyd2lzZSB5b3Ugc2hvdWxkIGltcGxlbWVudCB2YWxpZGF0ZVNldHVwLCB2YWxpZGF0ZUxvZ2luIGFuZCB2YWxpZGF0ZVVwZGF0ZVxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBBZGRpdGlvbmFsIG9wdGlvbnNcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIFBhcnNlIFNlcnZlciBjb25maWcgb2JqZWN0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlQXV0aFJlc3BvbnNlfHZvaWR8dW5kZWZpbmVkPn1cbiAgICovXG4gIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGEsIG9wdGlvbnMsIHJlcXVlc3QsIGNvbmZpZykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIHVzZXIgcHJvdmlkZSBmb3IgdGhlIGZpcnN0IHRpbWUgdGhpcyBhdXRoIHByb3ZpZGVyXG4gICAqIGNvdWxkIGJlIGEgcmVnaXN0ZXIgb3IgdGhlIHVzZXIgYWRkaW5nIGEgbmV3IGF1dGggc2VydmljZVxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBBZGRpdGlvbmFsIG9wdGlvbnNcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIFBhcnNlIFNlcnZlciBjb25maWcgb2JqZWN0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlQXV0aFJlc3BvbnNlfHZvaWR8dW5kZWZpbmVkPn1cbiAgICovXG4gIHZhbGlkYXRlU2V0VXAoYXV0aERhdGEsIG9wdGlvbnMsIHJlcSwgdXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIHVzZXIgcHJvdmlkZSBhdXRoRGF0YSByZWxhdGVkIHRvIHRoaXMgcHJvdmlkZXJcbiAgICogVGhlIHVzZXIgaXMgbm90IGxvZ2dlZCBpbiBhbmQgaGFzIGFscmVhZHkgc2V0IHRoaXMgcHJvdmlkZXIgYmVmb3JlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIEFkZGl0aW9uYWwgb3B0aW9uc1xuICAgKiBAcGFyYW0ge1BhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSByZXF1ZXN0XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjb25maWdcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVMb2dpbihhdXRoRGF0YSwgb3B0aW9ucywgcmVxLCB1c2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIHdoZW4gdXNlciBwcm92aWRlIGF1dGhEYXRhIHJlbGF0ZWQgdG8gdGhpcyBwcm92aWRlclxuICAgKiB0aGUgdXNlciBpcyBsb2dnZWQgaW4gYW5kIGhhcyBhbHJlYWR5IHNldCB0aGlzIHByb3ZpZGVyIGJlZm9yZVxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBBZGRpdGlvbmFsIG9wdGlvbnNcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlQXV0aFJlc3BvbnNlfHZvaWR8dW5kZWZpbmVkPn1cbiAgICovXG4gIHZhbGlkYXRlVXBkYXRlKGF1dGhEYXRhLCBvcHRpb25zLCByZXEsIHVzZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgaW4gcHJlIGF1dGhlbnRpY2F0aW9uIHByb2Nlc3MgaWYgbmVlZGVkIChsaWtlIHdlYmF1dGhuLCBTTVMgT1RQKVxuICAgKiBAcGFyYW0ge09iamVjdH0gY2hhbGxlbmdlRGF0YSBEYXRhIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnRcbiAgICogQHBhcmFtIHsoT2JqZWN0fHVuZGVmaW5lZCl9IGF1dGhEYXRhIEF1dGggZGF0YSBwcm92aWRlZCBieSB0aGUgY2xpZW50LCBjYW4gYmUgdXNlZCBmb3IgdmFsaWRhdGlvblxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBBZGRpdGlvbmFsIG9wdGlvbnNcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIFBhcnNlIFNlcnZlciBjb25maWcgb2JqZWN0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzLCByZXNvbHZlZCB2YWx1ZSB3aWxsIGJlIGFkZGVkIHRvIGNoYWxsZW5nZSByZXNwb25zZSB1bmRlciBjaGFsbGVuZ2Uga2V5XG4gICAqL1xuICBjaGFsbGVuZ2UoY2hhbGxlbmdlRGF0YSwgYXV0aERhdGEsIG9wdGlvbnMsIHJlcSwgdXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEF1dGhBZGFwdGVyO1xuIl19
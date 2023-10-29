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
    if (!this.policy) {
      this.policy = 'default';
    }
  }
  /**
   * @param appIds The specified app IDs in the configuration
   * @param {Object} authData The client provided authData
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {(Promise<undefined|void>|void|undefined)} resolves or returns if the applicationId is valid
   */
  validateAppId(appIds, authData, options, request) {
    return Promise.resolve({});
  }

  /**
   * Legacy usage, if provided it will be triggered when authData related to this provider is touched (signup/update/login)
   * otherwise you should implement validateSetup, validateLogin and validateUpdate
   * @param {Object} authData The client provided authData
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} options additional adapter options
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateAuthData(authData, request, options) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide for the first time this auth provider
   * could be a register or the user adding a new auth service
   * @param {Object} authData The client provided authData
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} options additional adapter options
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateSetUp(authData, req, options) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide authData related to this provider
   * The user is not logged in and has already set this provider before
   * @param {Object} authData The client provided authData
   * @param {Parse.Cloud.TriggerRequest} request
   * @param {Object} options additional adapter options
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateLogin(authData, req, options) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide authData related to this provider
   * the user is logged in and has already set this provider before
   * @param {Object} authData The client provided authData
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateUpdate(authData, req, options) {
    return Promise.resolve({});
  }

  /**
   * Triggered in pre authentication process if needed (like webauthn, SMS OTP)
   * @param {Object} challengeData Data provided by the client
   * @param {(Object|undefined)} authData Auth data provided by the client, can be used for validation
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<Object>} A promise that resolves, resolved value will be added to challenge response under challenge key
   */
  challenge(challengeData, authData, options, request) {
    return Promise.resolve({});
  }

  /**
   * Triggered when auth data is fetched
   * @param {Object} authData authData
   * @param {Object} options additional adapter options
   * @returns {Promise<Object>} Any overrides required to authData
   */
  afterFind(authData, options) {
    return Promise.resolve({});
  }

  /**
   * Triggered when the adapter is first attached to Parse Server
   * @param {Object} options Adapter Options
   */
  validateOptions(options) {
    /* */
  }
}
exports.AuthAdapter = AuthAdapter;
var _default = AuthAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBdXRoQWRhcHRlciIsImNvbnN0cnVjdG9yIiwicG9saWN5IiwidmFsaWRhdGVBcHBJZCIsImFwcElkcyIsImF1dGhEYXRhIiwib3B0aW9ucyIsInJlcXVlc3QiLCJQcm9taXNlIiwicmVzb2x2ZSIsInZhbGlkYXRlQXV0aERhdGEiLCJ2YWxpZGF0ZVNldFVwIiwicmVxIiwidmFsaWRhdGVMb2dpbiIsInZhbGlkYXRlVXBkYXRlIiwiY2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsImFmdGVyRmluZCIsInZhbGlkYXRlT3B0aW9ucyIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvQXV0aC9BdXRoQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZUF1dGhSZXNwb25zZVxuICogQHByb3BlcnR5IHtCb29sZWFufSBbZG9Ob3RTYXZlXSBJZiB0cnVlLCBQYXJzZSBTZXJ2ZXIgd2lsbCBub3Qgc2F2ZSBwcm92aWRlZCBhdXRoRGF0YS5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBbcmVzcG9uc2VdIElmIHNldCwgUGFyc2UgU2VydmVyIHdpbGwgc2VuZCB0aGUgcHJvdmlkZWQgcmVzcG9uc2UgdG8gdGhlIGNsaWVudCB1bmRlciBhdXRoRGF0YVJlc3BvbnNlXG4gKiBAcHJvcGVydHkge09iamVjdH0gW3NhdmVdIElmIHNldCwgUGFyc2UgU2VydmVyIHdpbGwgc2F2ZSB0aGUgb2JqZWN0IHByb3ZpZGVkIGludG8gdGhpcyBrZXksIGluc3RlYWQgb2YgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gKi9cblxuLyoqXG4gKiBBdXRoUG9saWN5XG4gKiBkZWZhdWx0OiBjYW4gYmUgY29tYmluZWQgd2l0aCBPTkUgYWRkaXRpb25hbCBhdXRoIHByb3ZpZGVyIGlmIGFkZGl0aW9uYWwgY29uZmlndXJlZCBvbiB1c2VyXG4gKiBhZGRpdGlvbmFsOiBjb3VsZCBiZSBvbmx5IHVzZWQgd2l0aCBhIGRlZmF1bHQgcG9saWN5IGF1dGggcHJvdmlkZXJcbiAqIHNvbG86IFdpbGwgaWdub3JlIEFMTCBhZGRpdGlvbmFsIHByb3ZpZGVycyBpZiBhZGRpdGlvbmFsIGNvbmZpZ3VyZWQgb24gdXNlclxuICogQHR5cGVkZWYge1wiZGVmYXVsdFwiIHwgXCJhZGRpdGlvbmFsXCIgfCBcInNvbG9cIn0gQXV0aFBvbGljeVxuICovXG5cbmV4cG9ydCBjbGFzcyBBdXRoQWRhcHRlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8qKlxuICAgICAqIFVzYWdlIHBvbGljeVxuICAgICAqIEB0eXBlIHtBdXRoUG9saWN5fVxuICAgICAqL1xuICAgIGlmICghdGhpcy5wb2xpY3kpIHtcbiAgICAgIHRoaXMucG9saWN5ID0gJ2RlZmF1bHQnO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogQHBhcmFtIGFwcElkcyBUaGUgc3BlY2lmaWVkIGFwcCBJRHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgYWRkaXRpb25hbCBhZGFwdGVyIG9wdGlvbnNcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7KFByb21pc2U8dW5kZWZpbmVkfHZvaWQ+fHZvaWR8dW5kZWZpbmVkKX0gcmVzb2x2ZXMgb3IgcmV0dXJucyBpZiB0aGUgYXBwbGljYXRpb25JZCBpcyB2YWxpZFxuICAgKi9cbiAgdmFsaWRhdGVBcHBJZChhcHBJZHMsIGF1dGhEYXRhLCBvcHRpb25zLCByZXF1ZXN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogTGVnYWN5IHVzYWdlLCBpZiBwcm92aWRlZCBpdCB3aWxsIGJlIHRyaWdnZXJlZCB3aGVuIGF1dGhEYXRhIHJlbGF0ZWQgdG8gdGhpcyBwcm92aWRlciBpcyB0b3VjaGVkIChzaWdudXAvdXBkYXRlL2xvZ2luKVxuICAgKiBvdGhlcndpc2UgeW91IHNob3VsZCBpbXBsZW1lbnQgdmFsaWRhdGVTZXR1cCwgdmFsaWRhdGVMb2dpbiBhbmQgdmFsaWRhdGVVcGRhdGVcbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBhZGRpdGlvbmFsIGFkYXB0ZXIgb3B0aW9uc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUF1dGhSZXNwb25zZXx2b2lkfHVuZGVmaW5lZD59XG4gICAqL1xuICB2YWxpZGF0ZUF1dGhEYXRhKGF1dGhEYXRhLCByZXF1ZXN0LCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIHdoZW4gdXNlciBwcm92aWRlIGZvciB0aGUgZmlyc3QgdGltZSB0aGlzIGF1dGggcHJvdmlkZXJcbiAgICogY291bGQgYmUgYSByZWdpc3RlciBvciB0aGUgdXNlciBhZGRpbmcgYSBuZXcgYXV0aCBzZXJ2aWNlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgYWRkaXRpb25hbCBhZGFwdGVyIG9wdGlvbnNcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVTZXRVcChhdXRoRGF0YSwgcmVxLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIHdoZW4gdXNlciBwcm92aWRlIGF1dGhEYXRhIHJlbGF0ZWQgdG8gdGhpcyBwcm92aWRlclxuICAgKiBUaGUgdXNlciBpcyBub3QgbG9nZ2VkIGluIGFuZCBoYXMgYWxyZWFkeSBzZXQgdGhpcyBwcm92aWRlciBiZWZvcmVcbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICogQHBhcmFtIHtQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0gcmVxdWVzdFxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBhZGRpdGlvbmFsIGFkYXB0ZXIgb3B0aW9uc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUF1dGhSZXNwb25zZXx2b2lkfHVuZGVmaW5lZD59XG4gICAqL1xuICB2YWxpZGF0ZUxvZ2luKGF1dGhEYXRhLCByZXEsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgd2hlbiB1c2VyIHByb3ZpZGUgYXV0aERhdGEgcmVsYXRlZCB0byB0aGlzIHByb3ZpZGVyXG4gICAqIHRoZSB1c2VyIGlzIGxvZ2dlZCBpbiBhbmQgaGFzIGFscmVhZHkgc2V0IHRoaXMgcHJvdmlkZXIgYmVmb3JlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGFkZGl0aW9uYWwgYWRhcHRlciBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVVcGRhdGUoYXV0aERhdGEsIHJlcSwgb3B0aW9ucykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCBpbiBwcmUgYXV0aGVudGljYXRpb24gcHJvY2VzcyBpZiBuZWVkZWQgKGxpa2Ugd2ViYXV0aG4sIFNNUyBPVFApXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjaGFsbGVuZ2VEYXRhIERhdGEgcHJvdmlkZWQgYnkgdGhlIGNsaWVudFxuICAgKiBAcGFyYW0geyhPYmplY3R8dW5kZWZpbmVkKX0gYXV0aERhdGEgQXV0aCBkYXRhIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnQsIGNhbiBiZSB1c2VkIGZvciB2YWxpZGF0aW9uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGFkZGl0aW9uYWwgYWRhcHRlciBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMsIHJlc29sdmVkIHZhbHVlIHdpbGwgYmUgYWRkZWQgdG8gY2hhbGxlbmdlIHJlc3BvbnNlIHVuZGVyIGNoYWxsZW5nZSBrZXlcbiAgICovXG4gIGNoYWxsZW5nZShjaGFsbGVuZ2VEYXRhLCBhdXRoRGF0YSwgb3B0aW9ucywgcmVxdWVzdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIGF1dGggZGF0YSBpcyBmZXRjaGVkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBhZGRpdGlvbmFsIGFkYXB0ZXIgb3B0aW9uc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBBbnkgb3ZlcnJpZGVzIHJlcXVpcmVkIHRvIGF1dGhEYXRhXG4gICAqL1xuICBhZnRlckZpbmQoYXV0aERhdGEsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgd2hlbiB0aGUgYWRhcHRlciBpcyBmaXJzdCBhdHRhY2hlZCB0byBQYXJzZSBTZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQWRhcHRlciBPcHRpb25zXG4gICAqL1xuICB2YWxpZGF0ZU9wdGlvbnMob3B0aW9ucykge1xuICAgIC8qICovXG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQXV0aEFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFTyxNQUFNQSxXQUFXLENBQUM7RUFDdkJDLFdBQVdBLENBQUEsRUFBRztJQUNaO0FBQ0o7QUFDQTtBQUNBO0lBQ0ksSUFBSSxDQUFDLElBQUksQ0FBQ0MsTUFBTSxFQUFFO01BQ2hCLElBQUksQ0FBQ0EsTUFBTSxHQUFHLFNBQVM7SUFDekI7RUFDRjtFQUNBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLGFBQWFBLENBQUNDLE1BQU0sRUFBRUMsUUFBUSxFQUFFQyxPQUFPLEVBQUVDLE9BQU8sRUFBRTtJQUNoRCxPQUFPQyxPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1Qjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLGdCQUFnQkEsQ0FBQ0wsUUFBUSxFQUFFRSxPQUFPLEVBQUVELE9BQU8sRUFBRTtJQUMzQyxPQUFPRSxPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1Qjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VFLGFBQWFBLENBQUNOLFFBQVEsRUFBRU8sR0FBRyxFQUFFTixPQUFPLEVBQUU7SUFDcEMsT0FBT0UsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDNUI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFSSxhQUFhQSxDQUFDUixRQUFRLEVBQUVPLEdBQUcsRUFBRU4sT0FBTyxFQUFFO0lBQ3BDLE9BQU9FLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUssY0FBY0EsQ0FBQ1QsUUFBUSxFQUFFTyxHQUFHLEVBQUVOLE9BQU8sRUFBRTtJQUNyQyxPQUFPRSxPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1Qjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VNLFNBQVNBLENBQUNDLGFBQWEsRUFBRVgsUUFBUSxFQUFFQyxPQUFPLEVBQUVDLE9BQU8sRUFBRTtJQUNuRCxPQUFPQyxPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1Qjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRVEsU0FBU0EsQ0FBQ1osUUFBUSxFQUFFQyxPQUFPLEVBQUU7SUFDM0IsT0FBT0UsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDNUI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7RUFDRVMsZUFBZUEsQ0FBQ1osT0FBTyxFQUFFO0lBQ3ZCO0VBQUE7QUFFSjtBQUFDYSxPQUFBLENBQUFuQixXQUFBLEdBQUFBLFdBQUE7QUFBQSxJQUFBb0IsUUFBQSxHQUVjcEIsV0FBVztBQUFBbUIsT0FBQSxDQUFBRSxPQUFBLEdBQUFELFFBQUEifQ==
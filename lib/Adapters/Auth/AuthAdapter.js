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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBdXRoQWRhcHRlciIsImNvbnN0cnVjdG9yIiwicG9saWN5IiwidmFsaWRhdGVBcHBJZCIsImFwcElkcyIsImF1dGhEYXRhIiwib3B0aW9ucyIsInJlcXVlc3QiLCJQcm9taXNlIiwicmVzb2x2ZSIsInZhbGlkYXRlQXV0aERhdGEiLCJ2YWxpZGF0ZVNldFVwIiwicmVxIiwidmFsaWRhdGVMb2dpbiIsInZhbGlkYXRlVXBkYXRlIiwiY2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsImFmdGVyRmluZCIsInZhbGlkYXRlT3B0aW9ucyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL0F1dGhBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlQXV0aFJlc3BvbnNlXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IFtkb05vdFNhdmVdIElmIHRydWUsIFBhcnNlIFNlcnZlciB3aWxsIG5vdCBzYXZlIHByb3ZpZGVkIGF1dGhEYXRhLlxuICogQHByb3BlcnR5IHtPYmplY3R9IFtyZXNwb25zZV0gSWYgc2V0LCBQYXJzZSBTZXJ2ZXIgd2lsbCBzZW5kIHRoZSBwcm92aWRlZCByZXNwb25zZSB0byB0aGUgY2xpZW50IHVuZGVyIGF1dGhEYXRhUmVzcG9uc2VcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBbc2F2ZV0gSWYgc2V0LCBQYXJzZSBTZXJ2ZXIgd2lsbCBzYXZlIHRoZSBvYmplY3QgcHJvdmlkZWQgaW50byB0aGlzIGtleSwgaW5zdGVhZCBvZiBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAqL1xuXG4vKipcbiAqIEF1dGhQb2xpY3lcbiAqIGRlZmF1bHQ6IGNhbiBiZSBjb21iaW5lZCB3aXRoIE9ORSBhZGRpdGlvbmFsIGF1dGggcHJvdmlkZXIgaWYgYWRkaXRpb25hbCBjb25maWd1cmVkIG9uIHVzZXJcbiAqIGFkZGl0aW9uYWw6IGNvdWxkIGJlIG9ubHkgdXNlZCB3aXRoIGEgZGVmYXVsdCBwb2xpY3kgYXV0aCBwcm92aWRlclxuICogc29sbzogV2lsbCBpZ25vcmUgQUxMIGFkZGl0aW9uYWwgcHJvdmlkZXJzIGlmIGFkZGl0aW9uYWwgY29uZmlndXJlZCBvbiB1c2VyXG4gKiBAdHlwZWRlZiB7XCJkZWZhdWx0XCIgfCBcImFkZGl0aW9uYWxcIiB8IFwic29sb1wifSBBdXRoUG9saWN5XG4gKi9cblxuZXhwb3J0IGNsYXNzIEF1dGhBZGFwdGVyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgLyoqXG4gICAgICogVXNhZ2UgcG9saWN5XG4gICAgICogQHR5cGUge0F1dGhQb2xpY3l9XG4gICAgICovXG4gICAgdGhpcy5wb2xpY3kgPSAnZGVmYXVsdCc7XG4gIH1cbiAgLyoqXG4gICAqIEBwYXJhbSBhcHBJZHMgVGhlIHNwZWNpZmllZCBhcHAgSURzIGluIHRoZSBjb25maWd1cmF0aW9uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGFkZGl0aW9uYWwgYWRhcHRlciBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMgeyhQcm9taXNlPHVuZGVmaW5lZHx2b2lkPnx2b2lkfHVuZGVmaW5lZCl9IHJlc29sdmVzIG9yIHJldHVybnMgaWYgdGhlIGFwcGxpY2F0aW9uSWQgaXMgdmFsaWRcbiAgICovXG4gIHZhbGlkYXRlQXBwSWQoYXBwSWRzLCBhdXRoRGF0YSwgb3B0aW9ucywgcmVxdWVzdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIExlZ2FjeSB1c2FnZSwgaWYgcHJvdmlkZWQgaXQgd2lsbCBiZSB0cmlnZ2VyZWQgd2hlbiBhdXRoRGF0YSByZWxhdGVkIHRvIHRoaXMgcHJvdmlkZXIgaXMgdG91Y2hlZCAoc2lnbnVwL3VwZGF0ZS9sb2dpbilcbiAgICogb3RoZXJ3aXNlIHlvdSBzaG91bGQgaW1wbGVtZW50IHZhbGlkYXRlU2V0dXAsIHZhbGlkYXRlTG9naW4gYW5kIHZhbGlkYXRlVXBkYXRlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgYWRkaXRpb25hbCBhZGFwdGVyIG9wdGlvbnNcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVBdXRoRGF0YShhdXRoRGF0YSwgcmVxdWVzdCwgb3B0aW9ucykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIHVzZXIgcHJvdmlkZSBmb3IgdGhlIGZpcnN0IHRpbWUgdGhpcyBhdXRoIHByb3ZpZGVyXG4gICAqIGNvdWxkIGJlIGEgcmVnaXN0ZXIgb3IgdGhlIHVzZXIgYWRkaW5nIGEgbmV3IGF1dGggc2VydmljZVxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge1BhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSByZXF1ZXN0XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGFkZGl0aW9uYWwgYWRhcHRlciBvcHRpb25zXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlQXV0aFJlc3BvbnNlfHZvaWR8dW5kZWZpbmVkPn1cbiAgICovXG4gIHZhbGlkYXRlU2V0VXAoYXV0aERhdGEsIHJlcSwgb3B0aW9ucykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIHVzZXIgcHJvdmlkZSBhdXRoRGF0YSByZWxhdGVkIHRvIHRoaXMgcHJvdmlkZXJcbiAgICogVGhlIHVzZXIgaXMgbm90IGxvZ2dlZCBpbiBhbmQgaGFzIGFscmVhZHkgc2V0IHRoaXMgcHJvdmlkZXIgYmVmb3JlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgYWRkaXRpb25hbCBhZGFwdGVyIG9wdGlvbnNcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVMb2dpbihhdXRoRGF0YSwgcmVxLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIHdoZW4gdXNlciBwcm92aWRlIGF1dGhEYXRhIHJlbGF0ZWQgdG8gdGhpcyBwcm92aWRlclxuICAgKiB0aGUgdXNlciBpcyBsb2dnZWQgaW4gYW5kIGhhcyBhbHJlYWR5IHNldCB0aGlzIHByb3ZpZGVyIGJlZm9yZVxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBhZGRpdGlvbmFsIGFkYXB0ZXIgb3B0aW9uc1xuICAgKiBAcGFyYW0ge1BhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlQXV0aFJlc3BvbnNlfHZvaWR8dW5kZWZpbmVkPn1cbiAgICovXG4gIHZhbGlkYXRlVXBkYXRlKGF1dGhEYXRhLCByZXEsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgaW4gcHJlIGF1dGhlbnRpY2F0aW9uIHByb2Nlc3MgaWYgbmVlZGVkIChsaWtlIHdlYmF1dGhuLCBTTVMgT1RQKVxuICAgKiBAcGFyYW0ge09iamVjdH0gY2hhbGxlbmdlRGF0YSBEYXRhIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnRcbiAgICogQHBhcmFtIHsoT2JqZWN0fHVuZGVmaW5lZCl9IGF1dGhEYXRhIEF1dGggZGF0YSBwcm92aWRlZCBieSB0aGUgY2xpZW50LCBjYW4gYmUgdXNlZCBmb3IgdmFsaWRhdGlvblxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBhZGRpdGlvbmFsIGFkYXB0ZXIgb3B0aW9uc1xuICAgKiBAcGFyYW0ge1BhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzLCByZXNvbHZlZCB2YWx1ZSB3aWxsIGJlIGFkZGVkIHRvIGNoYWxsZW5nZSByZXNwb25zZSB1bmRlciBjaGFsbGVuZ2Uga2V5XG4gICAqL1xuICBjaGFsbGVuZ2UoY2hhbGxlbmdlRGF0YSwgYXV0aERhdGEsIG9wdGlvbnMsIHJlcXVlc3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgd2hlbiBhdXRoIGRhdGEgaXMgZmV0Y2hlZFxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgYXV0aERhdGFcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgYWRkaXRpb25hbCBhZGFwdGVyIG9wdGlvbnNcbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gQW55IG92ZXJyaWRlcyByZXF1aXJlZCB0byBhdXRoRGF0YVxuICAgKi9cbiAgYWZ0ZXJGaW5kKGF1dGhEYXRhLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIHdoZW4gdGhlIGFkYXB0ZXIgaXMgZmlyc3QgYXR0YWNoZWQgdG8gUGFyc2UgU2VydmVyXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIEFkYXB0ZXIgT3B0aW9uc1xuICAgKi9cbiAgdmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpIHtcbiAgICAvKiAqL1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEF1dGhBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRU8sTUFBTUEsV0FBVyxDQUFDO0VBQ3ZCQyxXQUFXLEdBQUc7SUFDWjtBQUNKO0FBQ0E7QUFDQTtJQUNJLElBQUksQ0FBQ0MsTUFBTSxHQUFHLFNBQVM7RUFDekI7RUFDQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxhQUFhLENBQUNDLE1BQU0sRUFBRUMsUUFBUSxFQUFFQyxPQUFPLEVBQUVDLE9BQU8sRUFBRTtJQUNoRCxPQUFPQyxPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1Qjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLGdCQUFnQixDQUFDTCxRQUFRLEVBQUVFLE9BQU8sRUFBRUQsT0FBTyxFQUFFO0lBQzNDLE9BQU9FLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUUsYUFBYSxDQUFDTixRQUFRLEVBQUVPLEdBQUcsRUFBRU4sT0FBTyxFQUFFO0lBQ3BDLE9BQU9FLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUksYUFBYSxDQUFDUixRQUFRLEVBQUVPLEdBQUcsRUFBRU4sT0FBTyxFQUFFO0lBQ3BDLE9BQU9FLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUssY0FBYyxDQUFDVCxRQUFRLEVBQUVPLEdBQUcsRUFBRU4sT0FBTyxFQUFFO0lBQ3JDLE9BQU9FLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRU0sU0FBUyxDQUFDQyxhQUFhLEVBQUVYLFFBQVEsRUFBRUMsT0FBTyxFQUFFQyxPQUFPLEVBQUU7SUFDbkQsT0FBT0MsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDNUI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VRLFNBQVMsQ0FBQ1osUUFBUSxFQUFFQyxPQUFPLEVBQUU7SUFDM0IsT0FBT0UsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDNUI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7RUFDRVMsZUFBZSxDQUFDWixPQUFPLEVBQUU7SUFDdkI7RUFBQTtBQUVKO0FBQUM7QUFBQSxlQUVjTixXQUFXO0FBQUEifQ==
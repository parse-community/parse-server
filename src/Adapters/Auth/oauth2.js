/**
 * Parse Server authentication adapter for OAuth2 Token Introspection.
 *
 * @class OAuth2Adapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.tokenIntrospectionEndpointUrl - The URL of the token introspection endpoint. Required.
 * @param {boolean} options.oauth2 - Indicates that the request should be handled by the OAuth2 adapter. Required.
 * @param {string} [options.useridField] - The field in the introspection response that contains the user ID. Optional.
 * @param {string} [options.appidField] - The field in the introspection response that contains the app ID. Optional.
 * @param {string[]} [options.appIds] - List of allowed app IDs. Required if `appidField` is defined.
 * @param {string} [options.authorizationHeader] - The Authorization header value for the introspection request. Optional.
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for OAuth2 Token Introspection, use the following structure:
 * ```json
 * {
 *   "auth": {
 *     "oauth2Provider": {
 *       "tokenIntrospectionEndpointUrl": "https://provider.com/introspect",
 *       "useridField": "sub",
 *       "appidField": "aud",
 *       "appIds": ["my-app-id"],
 *       "authorizationHeader": "Basic dXNlcm5hbWU6cGFzc3dvcmQ=",
 *       "oauth2": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - `id`: The user ID provided by the client.
 * - `access_token`: The access token provided by the client.
 *
 * ## Auth Payload
 * ### Example Auth Payload
 * ```json
 * {
 *   "oauth2": {
 *     "id": "user-id",
 *     "access_token": "access-token"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `tokenIntrospectionEndpointUrl` is mandatory and should point to a valid OAuth2 provider's introspection endpoint.
 * - If `appidField` is defined, `appIds` must also be specified to validate the app ID in the introspection response.
 * - `authorizationHeader` can be used to authenticate requests to the token introspection endpoint.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc7662 OAuth 2.0 Token Introspection Specification}
 */


import AuthAdapter from './AuthAdapter';

class OAuth2Adapter extends AuthAdapter {
  validateOptions(options) {
    super.validateOptions(options);

    if (!options.tokenIntrospectionEndpointUrl) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 token introspection endpoint URL is missing.');
    }
    if (options.appidField && !options.appIds?.length) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 configuration is missing app IDs.');
    }

    this.tokenIntrospectionEndpointUrl = options.tokenIntrospectionEndpointUrl;
    this.useridField = options.useridField;
    this.appidField = options.appidField;
    this.appIds = options.appIds;
    this.authorizationHeader = options.authorizationHeader;
  }

  async validateAppId(authData) {
    if (!this.appidField) {
      return;
    }

    const response = await this.requestTokenInfo(authData.access_token);

    const appIdFieldValue = response[this.appidField];
    const isValidAppId = Array.isArray(appIdFieldValue)
      ? appIdFieldValue.some(appId => this.appIds.includes(appId))
      : this.appIds.includes(appIdFieldValue);

    if (!isValidAppId) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2: Invalid app ID.');
    }
  }

  async validateAuthData(authData) {
    const response = await this.requestTokenInfo(authData.access_token);

    if (!response.active || (this.useridField && authData.id !== response[this.useridField])) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 access token is invalid for this user.');
    }

    return {};
  }

  async requestTokenInfo(accessToken) {
    const response = await fetch(this.tokenIntrospectionEndpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(this.authorizationHeader && { Authorization: this.authorizationHeader })
      },
      body: new URLSearchParams({ token: accessToken })
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 token introspection request failed.');
    }

    return response.json();
  }
}

export default new OAuth2Adapter();


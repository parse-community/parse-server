/**
 * Parse Server authentication adapter for Keycloak.
 *
 * @class KeycloakAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {Object} options.config - The Keycloak configuration object, typically loaded from a JSON file.
 * @param {String} options.config['auth-server-url'] - The Keycloak authentication server URL.
 * @param {String} options.config.realm - The Keycloak realm name.
 * @param {String} options.config['client-id'] - The Keycloak client ID.
 *
 * @param {Object} authData - The authentication data provided by the client.
 * @param {String} authData.access_token - The Keycloak access token retrieved during client authentication.
 * @param {String} authData.id - The user ID retrieved from Keycloak during client authentication.
 * @param {Array} [authData.roles] - The roles assigned to the user in Keycloak (optional).
 * @param {Array} [authData.groups] - The groups assigned to the user in Keycloak (optional).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Keycloak authentication, use the following structure:
 * ```javascript
 * {
 *   "auth": {
 *     "keycloak": {
 *       "config": {
 *         "auth-server-url": "https://sso.asap.dsna.fr/auth",
 *         "realm": "iet"
 *       },
 *       "enabled": true
 *     }
 *   }
 * }
 * ```
 * or
 * ```javascript
 * {
 *   "auth": {
 *     "keycloak": {
 *       "config": require('./auth/keycloak.json')
 *     }
 *   }
 * }
 * ```
 * Ensure the `keycloak.json` configuration file is generated from Keycloak's setup guide and includes:
 * - `auth-server-url`: The Keycloak authentication server URL.
 * - `realm`: The Keycloak realm name.
 *
 * ## Auth Data
 * The adapter requires the following `authData` fields:
 * - `access_token`: The Keycloak access token retrieved during client authentication.
 * - `id`: The user ID retrieved from Keycloak during client authentication.
 * - `roles` (optional): The roles assigned to the user in Keycloak.
 * - `groups` (optional): The groups assigned to the user in Keycloak.
 *
 * ## Auth Payload Example
 * ### Example Auth Data
 * ```json
 * {
 *   "keycloak": {
 *     "access_token": "an authorized Keycloak access token for the user",
 *     "id": "user's Keycloak ID as a string",
 *     "roles": ["admin", "user"],
 *     "groups": ["group1", "group2"]
 *   }
 * }
 * ```
 *
 * ## Notes
 * - Parse Server validates the provided `authData` by making a `userinfo` call to Keycloak and ensures the attributes match those returned by Keycloak.
 *
 * ## Keycloak Configuration
 * To configure Keycloak, copy the JSON configuration file generated from Keycloak's setup guide:
 * - [Keycloak Securing Apps Documentation](https://www.keycloak.org/docs/latest/securing_apps/index.html#_javascript_adapter)
 *
 * Place the configuration file on your server, for example:
 * - `auth/keycloak.json`
 *
 * For more information on Keycloak authentication, see:
 * - [Securing Apps Documentation](https://www.keycloak.org/docs/latest/securing_apps/)
 * - [Server Administration Documentation](https://www.keycloak.org/docs/latest/server_admin/)
 */

import AuthAdapter from './AuthAdapter';

const arraysEqual = (_arr1, _arr2) => {
  if (
    !Array.isArray(_arr1) ||
    !Array.isArray(_arr2) ||
    _arr1.length !== _arr2.length
  ) {
    return false;
  }
  var arr1 = _arr1.concat().sort();
  var arr2 = _arr2.concat().sort();
  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
};

class KeycloakAdapter extends AuthAdapter {
  validateOptions(options) {
    super.validateOptions(options);
    if (!options["auth-server-url"]) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak host URL is missing.');
    }
    if (!options.realm) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak realm is missing.');
    }
    this.authServerUrl = options["auth-server-url"];
    this.realm = options.realm;
  }
  async validateAppId() {
    return Promise.resolve();
  }
  async validateAuthData(authData) {
    const response = await this.requestTokenInfo(authData.access_token);
    if (
      authData.id !== response.sub ||
      (authData.roles !== undefined && !arraysEqual(response.roles, authData.roles)) ||
      (authData.groups !== undefined && !arraysEqual(response.roles, authData.groups))
    ) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak access token is invalid for this user.');
    }
    return {};
  }
  async requestTokenInfo(accessToken) {
    const response = await fetch(
      `${this.authServerUrl}/realms/${this.realm}/protocol/openid-connect/userinfo`,
      {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
        }
      }
    );
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Keycloak token validation failed.');
    }
    return response.json();
  }
}

export default new KeycloakAdapter();

/**
 * Parse Server authentication adapter for Keycloak.
 *
 * @class KeycloakAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {Object} options.config - The Keycloak configuration object, typically loaded from a JSON file.
 * @param {String} options.config.auth-server-url - The Keycloak authentication server URL.
 * @param {String} options.config.realm - The Keycloak realm name.
 * @param {String} options.config.client-id - The Keycloak client ID.
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
 *       "config": require('./auth/keycloak.json')
 *     }
 *   }
 * }
 * ```
 * Ensure the `keycloak.json` configuration file is generated from Keycloak's setup guide and includes:
 * - `auth-server-url`: The Keycloak authentication server URL.
 * - `realm`: The Keycloak realm name.
 * - `client-id`: The Keycloak client ID.
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

const { Parse } = require('parse/node');
const httpsRequest = require('./httpsRequest');

const arraysEqual = (_arr1, _arr2) => {
  if (!Array.isArray(_arr1) || !Array.isArray(_arr2) || _arr1.length !== _arr2.length) { return false; }

  var arr1 = _arr1.concat().sort();
  var arr2 = _arr2.concat().sort();

  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) { return false; }
  }

  return true;
};

const handleAuth = async ({ access_token, id, roles, groups } = {}, { config } = {}) => {
  if (!(access_token && id)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Missing access token and/or User id');
  }
  if (!config || !(config['auth-server-url'] && config['realm'])) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Missing keycloak configuration');
  }
  try {
    const response = await httpsRequest.get({
      host: config['auth-server-url'],
      path: `/realms/${config['realm']}/protocol/openid-connect/userinfo`,
      headers: {
        Authorization: 'Bearer ' + access_token,
      },
    });
    if (
      response &&
      response.data &&
      response.data.sub == id &&
      arraysEqual(response.data.roles, roles) &&
      arraysEqual(response.data.groups, groups)
    ) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid authentication');
  } catch (e) {
    if (e instanceof Parse.Error) {
      throw e;
    }
    const error = JSON.parse(e.text);
    if (error.error_description) {
      throw new Parse.Error(Parse.Error.HOSTING_ERROR, error.error_description);
    } else {
      throw new Parse.Error(
        Parse.Error.HOSTING_ERROR,
        'Could not connect to the authentication server'
      );
    }
  }
};

/*
  @param {Object} authData: the client provided authData
  @param {string} authData.access_token: the access_token retrieved from client authentication in Keycloak
  @param {string} authData.id: the id retrieved from client authentication in Keycloak
  @param {Array}  authData.roles: the roles retrieved from client authentication in Keycloak
  @param {Array}  authData.groups: the groups retrieved from client authentication in Keycloak
  @param {Object} options: additional options
  @param {Object} options.config: the config object passed during Parse Server instantiation
*/
function validateAuthData(authData, options = {}) {
  return handleAuth(authData, options);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};

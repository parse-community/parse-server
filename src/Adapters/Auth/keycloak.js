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
const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const authUtils = require('./utils');

const arraysEqual = (_arr1, _arr2) => {
  if (!Array.isArray(_arr1) || !Array.isArray(_arr2) || _arr1.length !== _arr2.length) { return false; }

  var arr1 = _arr1.concat().sort();
  var arr2 = _arr2.concat().sort();

  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) { return false; }
  }

  return true;
};

const getKeycloakKeyByKeyId = async (keyId, jwksUri, cacheMaxEntries, cacheMaxAge) => {
  const client = jwksClient({
    jwksUri,
    cache: true,
    cacheMaxEntries,
    cacheMaxAge,
  });

  let key;
  try {
    key = await authUtils.getSigningKey(client, keyId);
  } catch {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unable to find matching key for Key ID: ${keyId}`
    );
  }
  return key;
};

const verifyAccessToken = async (
  { access_token, id, roles, groups } = {},
  { config, cacheMaxEntries, cacheMaxAge } = {}
) => {
  if (!(access_token && id)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Missing access token and/or User id');
  }
  if (!config || !(config['auth-server-url'] && config['realm'])) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Missing keycloak configuration');
  }
  if (!config['client-id']) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Keycloak auth is not configured. Missing client-id.'
    );
  }

  const expectedIssuer = `${config['auth-server-url']}/realms/${config['realm']}`;
  const jwksUri = `${config['auth-server-url']}/realms/${config['realm']}/protocol/openid-connect/certs`;

  const { kid: keyId } = authUtils.getHeaderFromToken(access_token);
  const ONE_HOUR_IN_MS = 3600000;

  cacheMaxAge = cacheMaxAge || ONE_HOUR_IN_MS;
  cacheMaxEntries = cacheMaxEntries || 5;

  const keycloakKey = await getKeycloakKeyByKeyId(keyId, jwksUri, cacheMaxEntries, cacheMaxAge);
  const signingKey = keycloakKey.publicKey || keycloakKey.rsaPublicKey;

  let jwtClaims;
  try {
    jwtClaims = jwt.verify(access_token, signingKey, {
      algorithms: ['RS256'],
    });
  } catch (exception) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${exception.message}`);
  }

  if (jwtClaims.iss !== expectedIssuer) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `access token not issued by correct provider - expected: ${expectedIssuer} | from: ${jwtClaims.iss}`
    );
  }

  if (jwtClaims.azp !== config['client-id']) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `access token is not authorized for this client - expected: ${config['client-id']} | from: ${jwtClaims.azp}`
    );
  }

  if (jwtClaims.sub !== id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'auth data is invalid for this user.');
  }

  const rolesMatch = jwtClaims.roles === roles || arraysEqual(jwtClaims.roles, roles);
  const groupsMatch = jwtClaims.groups === groups || arraysEqual(jwtClaims.groups, groups);

  if (!rolesMatch || !groupsMatch) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid authentication');
  }

  return jwtClaims;
};

function validateAuthData(authData, options = {}) {
  return verifyAccessToken(authData, options);
}

function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};

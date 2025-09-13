/**
 * Parse Server authentication adapter for Facebook.
 *
 * @class FacebookAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.appSecret - Your Facebook App Secret. Required for secure authentication.
 * @param {string[]} options.appIds - An array of Facebook App IDs. Required for validating the app.
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Facebook authentication, use the following structure:
 * ```json
 * {
 *   "auth": {
 *     "facebook": {
 *       "appSecret": "your-app-secret",
 *       "appIds": ["your-app-id"]
 *     }
 *   }
 * }
 * ```
 *
 * The adapter supports the following authentication methods:
 * - **Standard Login**: Requires `id` and `access_token`.
 * - **Limited Login**: Requires `id` and `token`.
 *
 * ## Auth Payloads
 * ### Standard Login Payload
 * ```json
 * {
 *   "facebook": {
 *     "id": "1234567",
 *     "access_token": "abc123def456ghi789"
 *   }
 * }
 * ```
 *
 * ### Limited Login Payload
 * ```json
 * {
 *   "facebook": {
 *     "id": "1234567",
 *     "token": "xxxxx.yyyyy.zzzzz"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - **Standard Login**: Use `id` and `access_token` for full functionality.
 * - **Limited Login**: Use `id` and `token` (JWT) when tracking is opted out (e.g., via Apple's App Tracking Transparency).
 * - Supported Parse Server versions:
 *   - `>= 6.5.6 < 7`
 *   - `>= 7.0.1`
 *
 * Secure authentication is recommended to ensure proper data protection and compliance with Facebook's guidelines.
 *
 * @see {@link https://developers.facebook.com/docs/facebook-login/limited-login/ Facebook Limited Login}
 * @see {@link https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/ Facebook Login for Business}
 */

// Helper functions for accessing the Facebook Graph API.
const Parse = require('parse/node').Parse;
const crypto = require('crypto');
const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const httpsRequest = require('./httpsRequest');
const authUtils = require('./utils');

const TOKEN_ISSUER = 'https://www.facebook.com';

function getAppSecretPath(authData, options = {}) {
  const appSecret = options.appSecret;
  if (!appSecret) {
    return '';
  }
  const appsecret_proof = crypto
    .createHmac('sha256', appSecret)
    .update(authData.access_token)
    .digest('hex');

  return `&appsecret_proof=${appsecret_proof}`;
}

function validateGraphToken(authData, options) {
  return graphRequest(
    'me?fields=id&access_token=' + authData.access_token + getAppSecretPath(authData, options)
  ).then(data => {
    if ((data && data.id == authData.id) || (process.env.TESTING && authData.id === 'test')) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is invalid for this user.');
  });
}

async function validateGraphAppId(appIds, authData, options) {
  var access_token = authData.access_token;
  if (process.env.TESTING && access_token === 'test') {
    return;
  }
  if (!Array.isArray(appIds)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'appIds must be an array.');
  }
  if (!appIds.length) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is not configured.');
  }
  const data = await graphRequest(
    `app?access_token=${access_token}${getAppSecretPath(authData, options)}`
  );
  if (!data || !appIds.includes(data.id)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is invalid for this user.');
  }
}

const getFacebookKeyByKeyId = async (keyId, cacheMaxEntries, cacheMaxAge) => {
  const client = jwksClient({
    jwksUri: `${TOKEN_ISSUER}/.well-known/oauth/openid/jwks/`,
    cache: true,
    cacheMaxEntries,
    cacheMaxAge,
  });

  let key;
  try {
    key = await authUtils.getSigningKey(client, keyId);
  } catch (error) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unable to find matching key for Key ID: ${keyId}`
    );
  }
  return key;
};

const verifyIdToken = async ({ token, id }, { clientId, cacheMaxEntries, cacheMaxAge }) => {
  if (!token) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'id token is invalid for this user.');
  }

  const { kid: keyId, alg: algorithm } = authUtils.getHeaderFromToken(token);
  const ONE_HOUR_IN_MS = 3600000;
  let jwtClaims;

  cacheMaxAge = cacheMaxAge || ONE_HOUR_IN_MS;
  cacheMaxEntries = cacheMaxEntries || 5;

  const facebookKey = await getFacebookKeyByKeyId(keyId, cacheMaxEntries, cacheMaxAge);
  const signingKey = facebookKey.publicKey || facebookKey.rsaPublicKey;

  try {
    jwtClaims = jwt.verify(token, signingKey, {
      algorithms: algorithm,
      // the audience can be checked against a string, a regular expression or a list of strings and/or regular expressions.
      audience: clientId,
    });
  } catch (exception) {
    const message = exception.message;

    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
  }

  if (jwtClaims.iss !== TOKEN_ISSUER) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `id token not issued by correct OpenID provider - expected: ${TOKEN_ISSUER} | from: ${jwtClaims.iss}`
    );
  }

  if (jwtClaims.sub !== id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'auth data is invalid for this user.');
  }
  return jwtClaims;
};

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, options) {
  if (authData.token) {
    return verifyIdToken(authData, options);
  } else {
    return validateGraphToken(authData, options);
  }
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId(appIds, authData, options) {
  if (authData.token) {
    return Promise.resolve();
  } else {
    return validateGraphAppId(appIds, authData, options);
  }
}

// A promisey wrapper for FB graph requests.
function graphRequest(path) {
  return httpsRequest.get('https://graph.facebook.com/' + path);
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};

/**
 * Parse Server authentication adapter for Google.
 *
 * @class GoogleAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Google application Client ID.
 * @param {number} [options.cacheMaxEntries] - Maximum number of JWKS cache entries. Default: 5.
 * @param {number} [options.cacheMaxAge] - Maximum age of JWKS cache entries in ms. Default: 3600000 (1 hour).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Google authentication, use the following structure:
 * ```json
 * {
 *   "auth": {
 *     "google": {
 *       "clientId": "your-client-id"
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **id**: The Google user ID.
 * - **id_token**: The Google ID token.
 *
 * ## Auth Payload
 * ### Example Auth Data Payload
 * ```json
 * {
 *   "google": {
 *     "id": "1234567",
 *     "id_token": "xxxxx.yyyyy.zzzzz"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - Ensure your Google Client ID is configured properly in the Parse Server configuration.
 * - The `id_token` is validated against Google's authentication services.
 *
 * @see {@link https://developers.google.com/identity/sign-in/web/backend-auth Google Authentication Documentation}
 */

'use strict';

var Parse = require('parse/node').Parse;

const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const authUtils = require('./utils');

const TOKEN_ISSUER = 'accounts.google.com';
const HTTPS_TOKEN_ISSUER = 'https://accounts.google.com';

const getGoogleKeyByKeyId = async (keyId, cacheMaxEntries, cacheMaxAge) => {
  const client = jwksClient({
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
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

async function verifyIdToken({ id_token: token, id }, { clientId, cacheMaxEntries, cacheMaxAge }) {
  if (!clientId) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Google auth is not configured.'
    );
  }

  if (!token) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `id token is invalid for this user.`);
  }

  const { kid: keyId } = authUtils.getHeaderFromToken(token);
  const ONE_HOUR_IN_MS = 3600000;
  let jwtClaims;

  cacheMaxAge = cacheMaxAge || ONE_HOUR_IN_MS;
  cacheMaxEntries = cacheMaxEntries || 5;

  const googleKey = await getGoogleKeyByKeyId(keyId, cacheMaxEntries, cacheMaxAge);
  const signingKey = googleKey.publicKey || googleKey.rsaPublicKey;

  try {
    jwtClaims = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      audience: clientId,
    });
  } catch (exception) {
    const message = exception.message;
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
  }

  if (jwtClaims.iss !== TOKEN_ISSUER && jwtClaims.iss !== HTTPS_TOKEN_ISSUER) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `id token not issued by correct provider - expected: ${TOKEN_ISSUER} or ${HTTPS_TOKEN_ISSUER} | from: ${jwtClaims.iss}`
    );
  }

  if (jwtClaims.sub !== id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `auth data is invalid for this user.`);
  }

  return jwtClaims;
}

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData, options = {}) {
  return verifyIdToken(authData, options);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};

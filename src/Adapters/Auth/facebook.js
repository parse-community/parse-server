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
    console.error(`Invalid Facebook auth for user with ID: ${authData.id}`);
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Unauthorized');
  });
}

async function validateGraphAppId(appIds, authData, options) {
  var access_token = authData.access_token;
  if (process.env.TESTING && access_token === 'test') {
    return;
  }
  if (!Array.isArray(appIds)) {
    console.error('appIds must be an array.'); 
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Unauthorized');
  }
  if (!appIds.length) {
    console.error('Authentication is not configured.')
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Unauthorized');
  }
  const data = await graphRequest(
    `app?access_token=${access_token}${getAppSecretPath(authData, options)}`
  );
  if (!data || !appIds.includes(data.id)) {
    console.error('Invalid authentication data.')
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Unauthorized');
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
    console.error(`Unable to find matching key for Key ID: ${keyId}. Error: ${error.message}`);
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unable to validate authentication key.`
    );
  }
  return key;
};

const verifyIdToken = async ({ token, id }, { clientId, cacheMaxEntries, cacheMaxAge }) => {
  if (!token) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'invalid token.');
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
    console.error(`JWT verification failed. Error: ${message}`);

    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Unauthorized access.`);
  }

  if (jwtClaims.iss !== TOKEN_ISSUER) {
    console.error(`id token not issued by correct OpenID provider - expected: ${TOKEN_ISSUER} | from: ${jwtClaims.iss}`);
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unauthorized access.`
    );
  }

  if (jwtClaims.sub !== id) {
    console.error(`Token subject mismatch for user ID: ${id}.`);
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid authentication data.');
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

// Apple SignIn Auth
// https://developer.apple.com/documentation/signinwithapplerestapi

const Parse = require('parse/node').Parse;
const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const authUtils = require('./utils');

const TOKEN_ISSUER = 'https://appleid.apple.com';

const getAppleKeyByKeyId = async (keyId, cacheMaxEntries, cacheMaxAge) => {
  const client = jwksClient({
    jwksUri: `${TOKEN_ISSUER}/auth/keys`,
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
      `Unauthorized`
    );
  }
  return key;
};

const verifyIdToken = async ({ token, id }, { clientId, cacheMaxEntries, cacheMaxAge }) => {
  if (!token) {
    console.error('Invalid token'); 
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Unauthorized`);
  }

  const { kid: keyId, alg: algorithm } = authUtils.getHeaderFromToken(token);
  const ONE_HOUR_IN_MS = 3600000;
  let jwtClaims;

  cacheMaxAge = cacheMaxAge || ONE_HOUR_IN_MS;
  cacheMaxEntries = cacheMaxEntries || 5;

  const appleKey = await getAppleKeyByKeyId(keyId, cacheMaxEntries, cacheMaxAge);
  const signingKey = appleKey.publicKey || appleKey.rsaPublicKey;

  try {
    jwtClaims = jwt.verify(token, signingKey, {
      algorithms: algorithm,
      // the audience can be checked against a string, a regular expression or a list of strings and/or regular expressions.
      audience: clientId,
    });
  } catch (exception) {
    const message = exception.message;
    console.error(`JWT verification failed. Error: ${message}`);
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Unauthorized`);
  }

  if (jwtClaims.iss !== TOKEN_ISSUER) {
    console.error(`Token issuer mismatch. Expected: ${TOKEN_ISSUER}, Received: ${jwtClaims.iss}`);
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unauthorized`
    );
  }

  if (jwtClaims.sub !== id) {
    console.error(`Token subject mismatch for user ID: ${id}.`);
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Unauthorized`);
  }
  return jwtClaims;
};

// Returns a promise that fulfills if this id token is valid
function validateAuthData(authData, options = {}) {
  return verifyIdToken(authData, options);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};

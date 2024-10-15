'use strict';

// tenantId: the auth0 tenant, e.g. example.eu.auth0.com (NO HTTP / HTTPS)
// clientId: the auth0 client id, can be found in the auth0 console.

var Parse = require('parse/node').Parse;
const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const util = require('util');

const getAuth0KeyByKeyId = async (keyId, cacheMaxEntries, cacheMaxAge, tenantId) => {
  const client = jwksClient({
    jwksUri: `https://${tenantId}/.well-known/jwks.json`,
    cache: true,
    cacheMaxEntries,
    cacheMaxAge,
  });

  const asyncGetSigningKeyFunction = util.promisify(client.getSigningKey);

  let key;
  try {
    key = await asyncGetSigningKeyFunction(keyId);
  } catch (error) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unable to find matching key for Key ID: ${keyId} for auth0 tenantId ${tenantId}.`
    );
  }
  return key;
};

function getHeaderFromToken(token) {
  const decodedToken = jwt.decode(token, { complete: true });

  if (!decodedToken) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `provided token does not decode as JWT`);
  }

  return decodedToken.header;
}

async function verifyIdToken(
  { id_token: token, id },
  { tenantId, clientId, cacheMaxEntries, cacheMaxAge }
) {
  if (!token) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `id token is invalid for this user.`);
  }
  if (!clientId) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `client id is invalid.`);
  }
  if (!tenantId) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `tenant id is invalid.`);
  }

  const { kid: keyId, alg: algorithm } = getHeaderFromToken(token);
  let jwtClaims;
  const ONE_HOUR_IN_MS = 3600000;
  cacheMaxAge = cacheMaxAge || ONE_HOUR_IN_MS;
  cacheMaxEntries = cacheMaxEntries || 5;

  const auth0Key = await getAuth0KeyByKeyId(keyId, cacheMaxEntries, cacheMaxAge, tenantId);
  const signingKey = auth0Key.publicKey || auth0Key.rsaPublicKey;

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

  const tokenIssuer = `https://${tenantId}/`;

  if (jwtClaims.iss !== tokenIssuer) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `id token not issued by correct OpenID provider - expected: ${tokenIssuer} | from: ${jwtClaims.iss}`
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

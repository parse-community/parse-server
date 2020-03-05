// Apple SignIn Auth
// https://developer.apple.com/documentation/signinwithapplerestapi

const Parse = require('parse/node').Parse;
const jwksClient = require('jwks-rsa');
const util = require('util');
const jwt = require('jsonwebtoken');

const TOKEN_ISSUER = 'https://appleid.apple.com';

let currentKey;

const getAppleKeyByKeyId = async keyId => {
  if (currentKey && currentKey.kid === keyId) {
    return currentKey;
  }
  const ONE_HOUR_IN_MS = 3600000;

  const client = jwksClient({
    jwksUri: `${TOKEN_ISSUER}/auth/keys`,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: ONE_HOUR_IN_MS,
  });

  const asyncGetSigningKeyFunction = util.promisify(client.getSigningKey);

  let key;
  try {
    key = await asyncGetSigningKeyFunction(keyId);
  } catch (error) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unable to find matching key for Key ID: ${keyId}`
    );
  }
  currentKey = key;
  return key;
};

const getHeaderFromToken = token => {
  const decodedToken = jwt.decode(token, { complete: true });
  if (!decodedToken) {
    throw Error('provided token does not decode as JWT');
  }
  return decodedToken.header;
};

const verifyIdToken = async ({ token, id }, clientID) => {
  if (!token) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'id token is invalid for this user.'
    );
  }

  const header = getHeaderFromToken(token);
  const appleKey = await getAppleKeyByKeyId(header.kid);
  const signingKey = appleKey.publicKey || appleKey.rsaPublicKey;
  const jwtClaims = jwt.verify(token, signingKey, {
    algorithms: header.alg,
  });

  if (jwtClaims.iss !== TOKEN_ISSUER) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `id token not issued by correct OpenID provider - expected: ${TOKEN_ISSUER} | from: ${jwtClaims.iss}`
    );
  }
  if (jwtClaims.sub !== id) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `auth data is invalid for this user.`
    );
  }
  if (clientID !== undefined && jwtClaims.aud !== clientID) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `jwt aud parameter does not include this client - is: ${jwtClaims.aud} | expected: ${clientID}`
    );
  }
  return jwtClaims;
};

// Returns a promise that fulfills if this id token is valid
function validateAuthData(authData, options = {}) {
  return verifyIdToken(authData, options.client_id);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};

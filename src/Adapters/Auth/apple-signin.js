const Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');
const NodeRSA = require('node-rsa');
const jwt = require('jsonwebtoken');

const TOKEN_ISSUER = 'https://appleid.apple.com';

const getApplePublicKey = async () => {
  const data = await httpsRequest.get('https://appleid.apple.com/auth/keys');
  const key = data.keys[0];

  const pubKey = new NodeRSA();
  pubKey.importKey(
    { n: Buffer.from(key.n, 'base64'), e: Buffer.from(key.e, 'base64') },
    'components-public'
  );
  return pubKey.exportKey(['public']);
};

const verifyIdToken = async (token, clientID) => {
  if (!token) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'id_token is invalid for this user.'
    );
  }
  const applePublicKey = await getApplePublicKey();
  const jwtClaims = jwt.verify(token, applePublicKey, { algorithms: 'RS256' });

  if (jwtClaims.iss !== TOKEN_ISSUER) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `id_token not issued by correct OpenID provider - expected: ${TOKEN_ISSUER} | from: ${jwtClaims.iss}`
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

// Returns a promise that fulfills if this id_token is valid
function validateAuthData(authData, options = {}) {
  return verifyIdToken(authData.id_token, options.client_id);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};

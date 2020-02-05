'use strict';

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

// Apple SignIn Auth
// https://developer.apple.com/documentation/signinwithapplerestapi

const Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');
const NodeRSA = require('node-rsa');
const jwt = require('jsonwebtoken');

const TOKEN_ISSUER = 'https://appleid.apple.com';

let currentKey;

const getApplePublicKey = (() => {
  var _ref = _asyncToGenerator(function* () {
    let data;
    try {
      data = yield httpsRequest.get('https://appleid.apple.com/auth/keys');
    } catch (e) {
      if (currentKey) {
        return currentKey;
      }
      throw e;
    }

    const key = data.keys[0];

    const pubKey = new NodeRSA();
    pubKey.importKey({ n: Buffer.from(key.n, 'base64'), e: Buffer.from(key.e, 'base64') }, 'components-public');
    currentKey = pubKey.exportKey(['public']);
    return currentKey;
  });

  return function getApplePublicKey() {
    return _ref.apply(this, arguments);
  };
})();

const verifyIdToken = (() => {
  var _ref2 = _asyncToGenerator(function* ({ token, id }, clientID) {
    if (!token) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'id token is invalid for this user.');
    }
    const applePublicKey = yield getApplePublicKey();
    const jwtClaims = jwt.verify(token, applePublicKey, { algorithms: 'RS256' });

    if (jwtClaims.iss !== TOKEN_ISSUER) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `id token not issued by correct OpenID provider - expected: ${TOKEN_ISSUER} | from: ${jwtClaims.iss}`);
    }
    if (jwtClaims.sub !== id) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `auth data is invalid for this user.`);
    }
    if (clientID !== undefined && jwtClaims.aud !== clientID) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `jwt aud parameter does not include this client - is: ${jwtClaims.aud} | expected: ${clientID}`);
    }
    return jwtClaims;
  });

  return function verifyIdToken(_x, _x2) {
    return _ref2.apply(this, arguments);
  };
})();

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
  validateAuthData
};
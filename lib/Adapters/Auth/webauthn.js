"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validateUpdate = exports.validateSetUp = exports.validateLogin = exports.policy = exports.getOrigin = exports.challenge = void 0;
var _server = require("@simplewebauthn/server");
var _node = _interopRequireDefault(require("parse/node"));
var _jsonwebtoken = require("jsonwebtoken");
var _crypto = _interopRequireDefault(require("crypto"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /**
                                                                                                                                                                                                                                                                                                                                                                                           * WebAuthn Adapter can be used as an alternative way to login
                                                                                                                                                                                                                                                                                                                                                                                           * Since we cannot support currently signup with webauthn will throw an error (due to lack of reset process)
                                                                                                                                                                                                                                                                                                                                                                                           * User need to be logged in to setup the webauthn provider
                                                                                                                                                                                                                                                                                                                                                                                           */
const toUserFriendlyRpName = url => {
  const domain = getDomainWithoutWww(url);
  const baseDomain = getBaseDomain(domain).split('.')[0];
  const words = baseDomain.split('-');
  return words.reduce((acc, word) => `${acc} ${word.charAt(0).toUpperCase() + word.slice(1)}`, '').trim();
};
const getJwtSecret = config => {
  const hash = _crypto.default.createHash('sha512');
  hash.update(config.masterKey, 'utf-8');
  // Security:
  // sha512 return 128 chars, we can keep only 64 chars since it represent 6,61E98 combinations
  // using the hash allow to reduce risk of compromising the master key
  // if brute force is attempted on the JWT
  return hash.digest().toString('hex').slice(64);
};

// Example here: https://regex101.com/r/wN6cZ7/365
const getDomainWithoutWww = url => /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)/g.exec(url)[1];
const getBaseDomain = domain => {
  const splittedDomain = domain.split('.');
  // Handle localhost
  if (splittedDomain.length === 1) return domain.trim();
  // Classic domains
  return `${splittedDomain[splittedDomain.length - 2]}.${splittedDomain[splittedDomain.length - 1]}`.trim();
};
const getOrigin = config => getBaseDomain(getDomainWithoutWww(config.publicServerURL || config.serverURL));
exports.getOrigin = getOrigin;
const extractSignedChallenge = (signedChallenge, config) => {
  if (!signedChallenge) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'signedChallenge is required.');
  let expectedChallenge;
  try {
    expectedChallenge = (0, _jsonwebtoken.verify)(signedChallenge, getJwtSecret(config)).challenge;
    if (!expectedChallenge) throw new Error();
    return expectedChallenge;
  } catch (e) {
    throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Invalid signedChallenge');
  }
};

// Return credentials options to the client
// for register public key process
const registerOptions = (user, options = {}, config) => {
  const registrationOptions = (0, _server.generateRegistrationOptions)({
    rpName: options && options.rpName || toUserFriendlyRpName(config.publicServerURL || config.serverURL),
    rpID: options.rpId || getOrigin(config),
    // here userId is only used as an identifier and this is never
    // retrieved by the user device
    // this has not real value for parse
    userID: user.id,
    // Could be an email or a firstname lastname depending of
    // the developer usage
    userDisplayName: typeof options.getUserDisplayName === 'function' ? options.getUserDisplayName(user) : user.get('email') || user.get('username'),
    userName: typeof options.getUsername === 'function' ? options.getUsername(user) : user.get('username'),
    timeout: 60000,
    attestationType: options.attestationType || 'indirect',
    authenticatorSelection: {
      // Use required to avoid silent sign up
      userVerification: options.userVerification || 'required',
      residentKey: options.residentKey || 'preferred'
    }
  });
  return {
    // Use jwt signed challenge to avoid storing challenge in DB
    // Master key is considered safe here to sign the challenge
    // Add additional 20sec for a bad network latency
    signedChallenge: (0, _jsonwebtoken.sign)({
      challenge: registrationOptions.challenge
    }, getJwtSecret(config), {
      expiresIn: registrationOptions.timeout + 20000
    }),
    options: registrationOptions
  };
};

// Verify the registration provided by the client
const verifyRegister = async ({
  signedChallenge,
  registration
}, options = {}, config) => {
  if (!registration) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'registration is required.');
  const expectedChallenge = extractSignedChallenge(signedChallenge, config);
  try {
    const {
      verified,
      registrationInfo
    } = await (0, _server.verifyRegistrationResponse)({
      response: registration,
      expectedChallenge,
      requireUserVerification: options.userVerification === 'required' || !options.userVerification ? true : false,
      expectedOrigin: options.origin || getOrigin(config),
      expectedRPID: options.rpId || getOrigin(config)
    });
    if (verified) {
      return {
        counter: registrationInfo.counter,
        publicKey: registrationInfo.credentialPublicKey.toString('base64'),
        id: registration.id
      };
    }
    /* istanbul ignore next: fail safe */
    throw new Error();
  } catch (e) {
    throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Invalid webauthn registration');
  }
};
const loginOptions = config => {
  const options = (0, _server.generateAuthenticationOptions)();
  return {
    options,
    signedChallenge: (0, _jsonwebtoken.sign)({
      challenge: options.challenge
    }, getJwtSecret(config), {
      expiresIn: options.timeout + 20000
    })
  };
};
const verifyLogin = async ({
  authentication,
  signedChallenge
}, options = {}, config, user) => {
  const dbAuthData = user && user.get('authData') && user.get('authData').webauthn;
  if (!authentication) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'authentication is required.');
  const expectedChallenge = extractSignedChallenge(signedChallenge, config);
  try {
    const {
      verified,
      authenticationInfo
    } = await (0, _server.verifyAuthenticationResponse)({
      response: authentication,
      requireUserVerification: options.userVerification === 'required' || !options.userVerification ? true : false,
      expectedChallenge,
      expectedOrigin: options.origin || getOrigin(config),
      expectedRPID: options.rpId || getOrigin(config),
      authenticator: {
        credentialID: Buffer.from(dbAuthData.id, 'base64'),
        counter: dbAuthData.counter,
        credentialPublicKey: Buffer.from(dbAuthData.publicKey, 'base64')
      }
    });
    if (verified) {
      return _objectSpread(_objectSpread({}, dbAuthData), {}, {
        counter: authenticationInfo.newCounter
      });
    }
    /* istanbul ignore next: fail safe */
    throw new Error();
  } catch (e) {
    throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Invalid webauthn authentication');
  }
};
const challenge = async (challengeData, authData, adapterConfig = {}, request) => {
  // Allow logged user to update/setUp webauthn
  if (request.user && request.user.id) {
    return registerOptions(request.user, adapterConfig.options, request.config);
  }
  return loginOptions(request.config);
};
exports.challenge = challenge;
const validateSetUp = async (authData, adapterConfig = {}, request) => {
  if (!request.user && !request.master) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Webauthn can only be configured on an already logged in user.');
  return {
    save: await verifyRegister(authData, adapterConfig.options, request.config)
  };
};
exports.validateSetUp = validateSetUp;
const validateUpdate = validateSetUp;
exports.validateUpdate = validateUpdate;
const validateLogin = async (authData, adapterConfig = {}, request) => {
  if (!request.original) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found for webauthn login.');
  // Will save updated counter of the credential
  // and avoid cloned/bugged authenticators
  return {
    save: await verifyLogin(authData, adapterConfig.options, request.config, request.original)
  };
};
exports.validateLogin = validateLogin;
const policy = 'solo';
exports.policy = policy;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfc2VydmVyIiwicmVxdWlyZSIsIl9ub2RlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9qc29ud2VidG9rZW4iLCJfY3J5cHRvIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsInRvVXNlckZyaWVuZGx5UnBOYW1lIiwidXJsIiwiZG9tYWluIiwiZ2V0RG9tYWluV2l0aG91dFd3dyIsImJhc2VEb21haW4iLCJnZXRCYXNlRG9tYWluIiwic3BsaXQiLCJ3b3JkcyIsInJlZHVjZSIsImFjYyIsIndvcmQiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwidHJpbSIsImdldEp3dFNlY3JldCIsImNvbmZpZyIsImhhc2giLCJjcnlwdG8iLCJjcmVhdGVIYXNoIiwidXBkYXRlIiwibWFzdGVyS2V5IiwiZGlnZXN0IiwidG9TdHJpbmciLCJleGVjIiwic3BsaXR0ZWREb21haW4iLCJnZXRPcmlnaW4iLCJwdWJsaWNTZXJ2ZXJVUkwiLCJzZXJ2ZXJVUkwiLCJleHBvcnRzIiwiZXh0cmFjdFNpZ25lZENoYWxsZW5nZSIsInNpZ25lZENoYWxsZW5nZSIsIlBhcnNlIiwiRXJyb3IiLCJPVEhFUl9DQVVTRSIsImV4cGVjdGVkQ2hhbGxlbmdlIiwidmVyaWZ5IiwiY2hhbGxlbmdlIiwiZSIsInJlZ2lzdGVyT3B0aW9ucyIsInVzZXIiLCJvcHRpb25zIiwicmVnaXN0cmF0aW9uT3B0aW9ucyIsImdlbmVyYXRlUmVnaXN0cmF0aW9uT3B0aW9ucyIsInJwTmFtZSIsInJwSUQiLCJycElkIiwidXNlcklEIiwiaWQiLCJ1c2VyRGlzcGxheU5hbWUiLCJnZXRVc2VyRGlzcGxheU5hbWUiLCJnZXQiLCJ1c2VyTmFtZSIsImdldFVzZXJuYW1lIiwidGltZW91dCIsImF0dGVzdGF0aW9uVHlwZSIsImF1dGhlbnRpY2F0b3JTZWxlY3Rpb24iLCJ1c2VyVmVyaWZpY2F0aW9uIiwicmVzaWRlbnRLZXkiLCJzaWduIiwiZXhwaXJlc0luIiwidmVyaWZ5UmVnaXN0ZXIiLCJyZWdpc3RyYXRpb24iLCJ2ZXJpZmllZCIsInJlZ2lzdHJhdGlvbkluZm8iLCJ2ZXJpZnlSZWdpc3RyYXRpb25SZXNwb25zZSIsInJlc3BvbnNlIiwicmVxdWlyZVVzZXJWZXJpZmljYXRpb24iLCJleHBlY3RlZE9yaWdpbiIsIm9yaWdpbiIsImV4cGVjdGVkUlBJRCIsImNvdW50ZXIiLCJwdWJsaWNLZXkiLCJjcmVkZW50aWFsUHVibGljS2V5IiwibG9naW5PcHRpb25zIiwiZ2VuZXJhdGVBdXRoZW50aWNhdGlvbk9wdGlvbnMiLCJ2ZXJpZnlMb2dpbiIsImF1dGhlbnRpY2F0aW9uIiwiZGJBdXRoRGF0YSIsIndlYmF1dGhuIiwiYXV0aGVudGljYXRpb25JbmZvIiwidmVyaWZ5QXV0aGVudGljYXRpb25SZXNwb25zZSIsImF1dGhlbnRpY2F0b3IiLCJjcmVkZW50aWFsSUQiLCJCdWZmZXIiLCJmcm9tIiwibmV3Q291bnRlciIsImNoYWxsZW5nZURhdGEiLCJhdXRoRGF0YSIsImFkYXB0ZXJDb25maWciLCJyZXF1ZXN0IiwidmFsaWRhdGVTZXRVcCIsIm1hc3RlciIsInNhdmUiLCJ2YWxpZGF0ZVVwZGF0ZSIsInZhbGlkYXRlTG9naW4iLCJvcmlnaW5hbCIsInBvbGljeSJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL3dlYmF1dGhuLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogV2ViQXV0aG4gQWRhcHRlciBjYW4gYmUgdXNlZCBhcyBhbiBhbHRlcm5hdGl2ZSB3YXkgdG8gbG9naW5cbiAqIFNpbmNlIHdlIGNhbm5vdCBzdXBwb3J0IGN1cnJlbnRseSBzaWdudXAgd2l0aCB3ZWJhdXRobiB3aWxsIHRocm93IGFuIGVycm9yIChkdWUgdG8gbGFjayBvZiByZXNldCBwcm9jZXNzKVxuICogVXNlciBuZWVkIHRvIGJlIGxvZ2dlZCBpbiB0byBzZXR1cCB0aGUgd2ViYXV0aG4gcHJvdmlkZXJcbiAqL1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVSZWdpc3RyYXRpb25PcHRpb25zLFxuICB2ZXJpZnlSZWdpc3RyYXRpb25SZXNwb25zZSxcbiAgZ2VuZXJhdGVBdXRoZW50aWNhdGlvbk9wdGlvbnMsXG4gIHZlcmlmeUF1dGhlbnRpY2F0aW9uUmVzcG9uc2UsXG59IGZyb20gJ0BzaW1wbGV3ZWJhdXRobi9zZXJ2ZXInO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgc2lnbiwgdmVyaWZ5IH0gZnJvbSAnanNvbndlYnRva2VuJztcbmltcG9ydCBjcnlwdG8gZnJvbSAnY3J5cHRvJztcblxuY29uc3QgdG9Vc2VyRnJpZW5kbHlScE5hbWUgPSB1cmwgPT4ge1xuICBjb25zdCBkb21haW4gPSBnZXREb21haW5XaXRob3V0V3d3KHVybCk7XG4gIGNvbnN0IGJhc2VEb21haW4gPSBnZXRCYXNlRG9tYWluKGRvbWFpbikuc3BsaXQoJy4nKVswXTtcbiAgY29uc3Qgd29yZHMgPSBiYXNlRG9tYWluLnNwbGl0KCctJyk7XG4gIHJldHVybiB3b3Jkc1xuICAgIC5yZWR1Y2UoKGFjYywgd29yZCkgPT4gYCR7YWNjfSAke3dvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpfWAsICcnKVxuICAgIC50cmltKCk7XG59O1xuXG5jb25zdCBnZXRKd3RTZWNyZXQgPSBjb25maWcgPT4ge1xuICBjb25zdCBoYXNoID0gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTUxMicpO1xuICBoYXNoLnVwZGF0ZShjb25maWcubWFzdGVyS2V5LCAndXRmLTgnKTtcbiAgLy8gU2VjdXJpdHk6XG4gIC8vIHNoYTUxMiByZXR1cm4gMTI4IGNoYXJzLCB3ZSBjYW4ga2VlcCBvbmx5IDY0IGNoYXJzIHNpbmNlIGl0IHJlcHJlc2VudCA2LDYxRTk4IGNvbWJpbmF0aW9uc1xuICAvLyB1c2luZyB0aGUgaGFzaCBhbGxvdyB0byByZWR1Y2UgcmlzayBvZiBjb21wcm9taXNpbmcgdGhlIG1hc3RlciBrZXlcbiAgLy8gaWYgYnJ1dGUgZm9yY2UgaXMgYXR0ZW1wdGVkIG9uIHRoZSBKV1RcbiAgcmV0dXJuIGhhc2guZGlnZXN0KCkudG9TdHJpbmcoJ2hleCcpLnNsaWNlKDY0KTtcbn07XG5cbi8vIEV4YW1wbGUgaGVyZTogaHR0cHM6Ly9yZWdleDEwMS5jb20vci93TjZjWjcvMzY1XG5jb25zdCBnZXREb21haW5XaXRob3V0V3d3ID0gdXJsID0+XG4gIC9eKD86aHR0cHM/OlxcL1xcLyk/KD86W15AXFwvXFxuXStAKT8oPzp3d3dcXC4pPyhbXjpcXC8/XFxuXSspL2cuZXhlYyh1cmwpWzFdO1xuXG5jb25zdCBnZXRCYXNlRG9tYWluID0gZG9tYWluID0+IHtcbiAgY29uc3Qgc3BsaXR0ZWREb21haW4gPSBkb21haW4uc3BsaXQoJy4nKTtcbiAgLy8gSGFuZGxlIGxvY2FsaG9zdFxuICBpZiAoc3BsaXR0ZWREb21haW4ubGVuZ3RoID09PSAxKSByZXR1cm4gZG9tYWluLnRyaW0oKTtcbiAgLy8gQ2xhc3NpYyBkb21haW5zXG4gIHJldHVybiBgJHtzcGxpdHRlZERvbWFpbltzcGxpdHRlZERvbWFpbi5sZW5ndGggLSAyXX0uJHtcbiAgICBzcGxpdHRlZERvbWFpbltzcGxpdHRlZERvbWFpbi5sZW5ndGggLSAxXVxuICB9YC50cmltKCk7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0T3JpZ2luID0gY29uZmlnID0+XG4gIGdldEJhc2VEb21haW4oZ2V0RG9tYWluV2l0aG91dFd3dyhjb25maWcucHVibGljU2VydmVyVVJMIHx8IGNvbmZpZy5zZXJ2ZXJVUkwpKTtcblxuY29uc3QgZXh0cmFjdFNpZ25lZENoYWxsZW5nZSA9IChzaWduZWRDaGFsbGVuZ2UsIGNvbmZpZykgPT4ge1xuICBpZiAoIXNpZ25lZENoYWxsZW5nZSlcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdzaWduZWRDaGFsbGVuZ2UgaXMgcmVxdWlyZWQuJyk7XG4gIGxldCBleHBlY3RlZENoYWxsZW5nZTtcbiAgdHJ5IHtcbiAgICBleHBlY3RlZENoYWxsZW5nZSA9IHZlcmlmeShzaWduZWRDaGFsbGVuZ2UsIGdldEp3dFNlY3JldChjb25maWcpKS5jaGFsbGVuZ2U7XG4gICAgaWYgKCFleHBlY3RlZENoYWxsZW5nZSkgdGhyb3cgbmV3IEVycm9yKCk7XG4gICAgcmV0dXJuIGV4cGVjdGVkQ2hhbGxlbmdlO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnSW52YWxpZCBzaWduZWRDaGFsbGVuZ2UnKTtcbiAgfVxufTtcblxuLy8gUmV0dXJuIGNyZWRlbnRpYWxzIG9wdGlvbnMgdG8gdGhlIGNsaWVudFxuLy8gZm9yIHJlZ2lzdGVyIHB1YmxpYyBrZXkgcHJvY2Vzc1xuY29uc3QgcmVnaXN0ZXJPcHRpb25zID0gKHVzZXIsIG9wdGlvbnMgPSB7fSwgY29uZmlnKSA9PiB7XG4gIGNvbnN0IHJlZ2lzdHJhdGlvbk9wdGlvbnMgPSBnZW5lcmF0ZVJlZ2lzdHJhdGlvbk9wdGlvbnMoe1xuICAgIHJwTmFtZTpcbiAgICAgIChvcHRpb25zICYmIG9wdGlvbnMucnBOYW1lKSB8fFxuICAgICAgdG9Vc2VyRnJpZW5kbHlScE5hbWUoY29uZmlnLnB1YmxpY1NlcnZlclVSTCB8fCBjb25maWcuc2VydmVyVVJMKSxcbiAgICBycElEOiBvcHRpb25zLnJwSWQgfHwgZ2V0T3JpZ2luKGNvbmZpZyksXG4gICAgLy8gaGVyZSB1c2VySWQgaXMgb25seSB1c2VkIGFzIGFuIGlkZW50aWZpZXIgYW5kIHRoaXMgaXMgbmV2ZXJcbiAgICAvLyByZXRyaWV2ZWQgYnkgdGhlIHVzZXIgZGV2aWNlXG4gICAgLy8gdGhpcyBoYXMgbm90IHJlYWwgdmFsdWUgZm9yIHBhcnNlXG4gICAgdXNlcklEOiB1c2VyLmlkLFxuICAgIC8vIENvdWxkIGJlIGFuIGVtYWlsIG9yIGEgZmlyc3RuYW1lIGxhc3RuYW1lIGRlcGVuZGluZyBvZlxuICAgIC8vIHRoZSBkZXZlbG9wZXIgdXNhZ2VcbiAgICB1c2VyRGlzcGxheU5hbWU6XG4gICAgICB0eXBlb2Ygb3B0aW9ucy5nZXRVc2VyRGlzcGxheU5hbWUgPT09ICdmdW5jdGlvbidcbiAgICAgICAgPyBvcHRpb25zLmdldFVzZXJEaXNwbGF5TmFtZSh1c2VyKVxuICAgICAgICA6IHVzZXIuZ2V0KCdlbWFpbCcpIHx8IHVzZXIuZ2V0KCd1c2VybmFtZScpLFxuICAgIHVzZXJOYW1lOlxuICAgICAgdHlwZW9mIG9wdGlvbnMuZ2V0VXNlcm5hbWUgPT09ICdmdW5jdGlvbicgPyBvcHRpb25zLmdldFVzZXJuYW1lKHVzZXIpIDogdXNlci5nZXQoJ3VzZXJuYW1lJyksXG4gICAgdGltZW91dDogNjAwMDAsXG4gICAgYXR0ZXN0YXRpb25UeXBlOiBvcHRpb25zLmF0dGVzdGF0aW9uVHlwZSB8fCAnaW5kaXJlY3QnLFxuICAgIGF1dGhlbnRpY2F0b3JTZWxlY3Rpb246IHtcbiAgICAgIC8vIFVzZSByZXF1aXJlZCB0byBhdm9pZCBzaWxlbnQgc2lnbiB1cFxuICAgICAgdXNlclZlcmlmaWNhdGlvbjogb3B0aW9ucy51c2VyVmVyaWZpY2F0aW9uIHx8ICdyZXF1aXJlZCcsXG4gICAgICByZXNpZGVudEtleTogb3B0aW9ucy5yZXNpZGVudEtleSB8fCAncHJlZmVycmVkJyxcbiAgICB9LFxuICB9KTtcbiAgcmV0dXJuIHtcbiAgICAvLyBVc2Ugand0IHNpZ25lZCBjaGFsbGVuZ2UgdG8gYXZvaWQgc3RvcmluZyBjaGFsbGVuZ2UgaW4gREJcbiAgICAvLyBNYXN0ZXIga2V5IGlzIGNvbnNpZGVyZWQgc2FmZSBoZXJlIHRvIHNpZ24gdGhlIGNoYWxsZW5nZVxuICAgIC8vIEFkZCBhZGRpdGlvbmFsIDIwc2VjIGZvciBhIGJhZCBuZXR3b3JrIGxhdGVuY3lcbiAgICBzaWduZWRDaGFsbGVuZ2U6IHNpZ24oeyBjaGFsbGVuZ2U6IHJlZ2lzdHJhdGlvbk9wdGlvbnMuY2hhbGxlbmdlIH0sIGdldEp3dFNlY3JldChjb25maWcpLCB7XG4gICAgICBleHBpcmVzSW46IHJlZ2lzdHJhdGlvbk9wdGlvbnMudGltZW91dCArIDIwMDAwLFxuICAgIH0pLFxuICAgIG9wdGlvbnM6IHJlZ2lzdHJhdGlvbk9wdGlvbnMsXG4gIH07XG59O1xuXG4vLyBWZXJpZnkgdGhlIHJlZ2lzdHJhdGlvbiBwcm92aWRlZCBieSB0aGUgY2xpZW50XG5jb25zdCB2ZXJpZnlSZWdpc3RlciA9IGFzeW5jICh7IHNpZ25lZENoYWxsZW5nZSwgcmVnaXN0cmF0aW9uIH0sIG9wdGlvbnMgPSB7fSwgY29uZmlnKSA9PiB7XG4gIGlmICghcmVnaXN0cmF0aW9uKSB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdyZWdpc3RyYXRpb24gaXMgcmVxdWlyZWQuJyk7XG4gIGNvbnN0IGV4cGVjdGVkQ2hhbGxlbmdlID0gZXh0cmFjdFNpZ25lZENoYWxsZW5nZShzaWduZWRDaGFsbGVuZ2UsIGNvbmZpZyk7XG4gIHRyeSB7XG4gICAgY29uc3QgeyB2ZXJpZmllZCwgcmVnaXN0cmF0aW9uSW5mbyB9ID0gYXdhaXQgdmVyaWZ5UmVnaXN0cmF0aW9uUmVzcG9uc2Uoe1xuICAgICAgcmVzcG9uc2U6IHJlZ2lzdHJhdGlvbixcbiAgICAgIGV4cGVjdGVkQ2hhbGxlbmdlLFxuICAgICAgcmVxdWlyZVVzZXJWZXJpZmljYXRpb246XG4gICAgICAgIG9wdGlvbnMudXNlclZlcmlmaWNhdGlvbiA9PT0gJ3JlcXVpcmVkJyB8fCAhb3B0aW9ucy51c2VyVmVyaWZpY2F0aW9uID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgZXhwZWN0ZWRPcmlnaW46IG9wdGlvbnMub3JpZ2luIHx8IGdldE9yaWdpbihjb25maWcpLFxuICAgICAgZXhwZWN0ZWRSUElEOiBvcHRpb25zLnJwSWQgfHwgZ2V0T3JpZ2luKGNvbmZpZyksXG4gICAgfSk7XG4gICAgaWYgKHZlcmlmaWVkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb3VudGVyOiByZWdpc3RyYXRpb25JbmZvLmNvdW50ZXIsXG4gICAgICAgIHB1YmxpY0tleTogcmVnaXN0cmF0aW9uSW5mby5jcmVkZW50aWFsUHVibGljS2V5LnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgaWQ6IHJlZ2lzdHJhdGlvbi5pZCxcbiAgICAgIH07XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBmYWlsIHNhZmUgKi9cbiAgICB0aHJvdyBuZXcgRXJyb3IoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ0ludmFsaWQgd2ViYXV0aG4gcmVnaXN0cmF0aW9uJyk7XG4gIH1cbn07XG5cbmNvbnN0IGxvZ2luT3B0aW9ucyA9IGNvbmZpZyA9PiB7XG4gIGNvbnN0IG9wdGlvbnMgPSBnZW5lcmF0ZUF1dGhlbnRpY2F0aW9uT3B0aW9ucygpO1xuICByZXR1cm4ge1xuICAgIG9wdGlvbnMsXG4gICAgc2lnbmVkQ2hhbGxlbmdlOiBzaWduKHsgY2hhbGxlbmdlOiBvcHRpb25zLmNoYWxsZW5nZSB9LCBnZXRKd3RTZWNyZXQoY29uZmlnKSwge1xuICAgICAgZXhwaXJlc0luOiBvcHRpb25zLnRpbWVvdXQgKyAyMDAwMCxcbiAgICB9KSxcbiAgfTtcbn07XG5cbmNvbnN0IHZlcmlmeUxvZ2luID0gYXN5bmMgKHsgYXV0aGVudGljYXRpb24sIHNpZ25lZENoYWxsZW5nZSB9LCBvcHRpb25zID0ge30sIGNvbmZpZywgdXNlcikgPT4ge1xuICBjb25zdCBkYkF1dGhEYXRhID0gdXNlciAmJiB1c2VyLmdldCgnYXV0aERhdGEnKSAmJiB1c2VyLmdldCgnYXV0aERhdGEnKS53ZWJhdXRobjtcbiAgaWYgKCFhdXRoZW50aWNhdGlvbilcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZC4nKTtcbiAgY29uc3QgZXhwZWN0ZWRDaGFsbGVuZ2UgPSBleHRyYWN0U2lnbmVkQ2hhbGxlbmdlKHNpZ25lZENoYWxsZW5nZSwgY29uZmlnKTtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHZlcmlmaWVkLCBhdXRoZW50aWNhdGlvbkluZm8gfSA9IGF3YWl0IHZlcmlmeUF1dGhlbnRpY2F0aW9uUmVzcG9uc2Uoe1xuICAgICAgcmVzcG9uc2U6IGF1dGhlbnRpY2F0aW9uLFxuICAgICAgcmVxdWlyZVVzZXJWZXJpZmljYXRpb246XG4gICAgICAgIG9wdGlvbnMudXNlclZlcmlmaWNhdGlvbiA9PT0gJ3JlcXVpcmVkJyB8fCAhb3B0aW9ucy51c2VyVmVyaWZpY2F0aW9uID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgZXhwZWN0ZWRDaGFsbGVuZ2UsXG4gICAgICBleHBlY3RlZE9yaWdpbjogb3B0aW9ucy5vcmlnaW4gfHwgZ2V0T3JpZ2luKGNvbmZpZyksXG4gICAgICBleHBlY3RlZFJQSUQ6IG9wdGlvbnMucnBJZCB8fCBnZXRPcmlnaW4oY29uZmlnKSxcbiAgICAgIGF1dGhlbnRpY2F0b3I6IHtcbiAgICAgICAgY3JlZGVudGlhbElEOiBCdWZmZXIuZnJvbShkYkF1dGhEYXRhLmlkLCAnYmFzZTY0JyksXG4gICAgICAgIGNvdW50ZXI6IGRiQXV0aERhdGEuY291bnRlcixcbiAgICAgICAgY3JlZGVudGlhbFB1YmxpY0tleTogQnVmZmVyLmZyb20oZGJBdXRoRGF0YS5wdWJsaWNLZXksICdiYXNlNjQnKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKHZlcmlmaWVkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5kYkF1dGhEYXRhLFxuICAgICAgICBjb3VudGVyOiBhdXRoZW50aWNhdGlvbkluZm8ubmV3Q291bnRlcixcbiAgICAgIH07XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBmYWlsIHNhZmUgKi9cbiAgICB0aHJvdyBuZXcgRXJyb3IoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ0ludmFsaWQgd2ViYXV0aG4gYXV0aGVudGljYXRpb24nKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGNoYWxsZW5nZSA9IGFzeW5jIChjaGFsbGVuZ2VEYXRhLCBhdXRoRGF0YSwgYWRhcHRlckNvbmZpZyA9IHt9LCByZXF1ZXN0KSA9PiB7XG4gIC8vIEFsbG93IGxvZ2dlZCB1c2VyIHRvIHVwZGF0ZS9zZXRVcCB3ZWJhdXRoblxuICBpZiAocmVxdWVzdC51c2VyICYmIHJlcXVlc3QudXNlci5pZCkge1xuICAgIHJldHVybiByZWdpc3Rlck9wdGlvbnMocmVxdWVzdC51c2VyLCBhZGFwdGVyQ29uZmlnLm9wdGlvbnMsIHJlcXVlc3QuY29uZmlnKTtcbiAgfVxuXG4gIHJldHVybiBsb2dpbk9wdGlvbnMocmVxdWVzdC5jb25maWcpO1xufTtcblxuZXhwb3J0IGNvbnN0IHZhbGlkYXRlU2V0VXAgPSBhc3luYyAoYXV0aERhdGEsIGFkYXB0ZXJDb25maWcgPSB7fSwgcmVxdWVzdCkgPT4ge1xuICBpZiAoIXJlcXVlc3QudXNlciAmJiAhcmVxdWVzdC5tYXN0ZXIpXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAnV2ViYXV0aG4gY2FuIG9ubHkgYmUgY29uZmlndXJlZCBvbiBhbiBhbHJlYWR5IGxvZ2dlZCBpbiB1c2VyLidcbiAgICApO1xuICByZXR1cm4geyBzYXZlOiBhd2FpdCB2ZXJpZnlSZWdpc3RlcihhdXRoRGF0YSwgYWRhcHRlckNvbmZpZy5vcHRpb25zLCByZXF1ZXN0LmNvbmZpZykgfTtcbn07XG5cbmV4cG9ydCBjb25zdCB2YWxpZGF0ZVVwZGF0ZSA9IHZhbGlkYXRlU2V0VXA7XG5cbmV4cG9ydCBjb25zdCB2YWxpZGF0ZUxvZ2luID0gYXN5bmMgKGF1dGhEYXRhLCBhZGFwdGVyQ29uZmlnID0ge30sIHJlcXVlc3QpID0+IHtcbiAgaWYgKCFyZXF1ZXN0Lm9yaWdpbmFsKVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ1VzZXIgbm90IGZvdW5kIGZvciB3ZWJhdXRobiBsb2dpbi4nKTtcbiAgLy8gV2lsbCBzYXZlIHVwZGF0ZWQgY291bnRlciBvZiB0aGUgY3JlZGVudGlhbFxuICAvLyBhbmQgYXZvaWQgY2xvbmVkL2J1Z2dlZCBhdXRoZW50aWNhdG9yc1xuICByZXR1cm4ge1xuICAgIHNhdmU6IGF3YWl0IHZlcmlmeUxvZ2luKGF1dGhEYXRhLCBhZGFwdGVyQ29uZmlnLm9wdGlvbnMsIHJlcXVlc3QuY29uZmlnLCByZXF1ZXN0Lm9yaWdpbmFsKSxcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBwb2xpY3kgPSAnc29sbyc7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUtBLElBQUFBLE9BQUEsR0FBQUMsT0FBQTtBQU1BLElBQUFDLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLGFBQUEsR0FBQUgsT0FBQTtBQUNBLElB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
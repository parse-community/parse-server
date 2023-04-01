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
      credential: registration,
      expectedChallenge,
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
const verifyLogin = ({
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
    } = (0, _server.verifyAuthenticationResponse)({
      credential: authentication,
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
const challenge = async (challengeData, authData, adapterConfig = {}, request, config) => {
  // Allow logged user to update/setUp webauthn
  if (request.user && request.user.id) {
    return registerOptions(request.user, adapterConfig.options, config);
  }
  return loginOptions(config);
};
exports.challenge = challenge;
const validateSetUp = async (authData, adapterConfig = {}, request, config) => {
  if (!request.user && !request.master) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Webauthn can only be configured on an already logged in user.');
  return {
    save: await verifyRegister(authData, adapterConfig.options, config)
  };
};
exports.validateSetUp = validateSetUp;
const validateUpdate = validateSetUp;
exports.validateUpdate = validateUpdate;
const validateLogin = async (authData, adapterConfig = {}, request, config) => {
  if (!request.original) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found for webauthn login.');
  // Will save updated counter of the credential
  // and avoid cloned/bugged authenticators
  return {
    save: verifyLogin(authData, adapterConfig.options, config, request.original)
  };
};
exports.validateLogin = validateLogin;
const policy = 'solo';
exports.policy = policy;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfc2VydmVyIiwicmVxdWlyZSIsIl9ub2RlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9qc29ud2VidG9rZW4iLCJfY3J5cHRvIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsInRvVXNlckZyaWVuZGx5UnBOYW1lIiwidXJsIiwiZG9tYWluIiwiZ2V0RG9tYWluV2l0aG91dFd3dyIsImJhc2VEb21haW4iLCJnZXRCYXNlRG9tYWluIiwic3BsaXQiLCJ3b3JkcyIsInJlZHVjZSIsImFjYyIsIndvcmQiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwidHJpbSIsImdldEp3dFNlY3JldCIsImNvbmZpZyIsImhhc2giLCJjcnlwdG8iLCJjcmVhdGVIYXNoIiwidXBkYXRlIiwibWFzdGVyS2V5IiwiZGlnZXN0IiwidG9TdHJpbmciLCJleGVjIiwic3BsaXR0ZWREb21haW4iLCJnZXRPcmlnaW4iLCJwdWJsaWNTZXJ2ZXJVUkwiLCJzZXJ2ZXJVUkwiLCJleHBvcnRzIiwiZXh0cmFjdFNpZ25lZENoYWxsZW5nZSIsInNpZ25lZENoYWxsZW5nZSIsIlBhcnNlIiwiRXJyb3IiLCJPVEhFUl9DQVVTRSIsImV4cGVjdGVkQ2hhbGxlbmdlIiwidmVyaWZ5IiwiY2hhbGxlbmdlIiwiZSIsInJlZ2lzdGVyT3B0aW9ucyIsInVzZXIiLCJvcHRpb25zIiwicmVnaXN0cmF0aW9uT3B0aW9ucyIsImdlbmVyYXRlUmVnaXN0cmF0aW9uT3B0aW9ucyIsInJwTmFtZSIsInJwSUQiLCJycElkIiwidXNlcklEIiwiaWQiLCJ1c2VyRGlzcGxheU5hbWUiLCJnZXRVc2VyRGlzcGxheU5hbWUiLCJnZXQiLCJ1c2VyTmFtZSIsImdldFVzZXJuYW1lIiwidGltZW91dCIsImF0dGVzdGF0aW9uVHlwZSIsImF1dGhlbnRpY2F0b3JTZWxlY3Rpb24iLCJ1c2VyVmVyaWZpY2F0aW9uIiwicmVzaWRlbnRLZXkiLCJzaWduIiwiZXhwaXJlc0luIiwidmVyaWZ5UmVnaXN0ZXIiLCJyZWdpc3RyYXRpb24iLCJ2ZXJpZmllZCIsInJlZ2lzdHJhdGlvbkluZm8iLCJ2ZXJpZnlSZWdpc3RyYXRpb25SZXNwb25zZSIsImNyZWRlbnRpYWwiLCJleHBlY3RlZE9yaWdpbiIsIm9yaWdpbiIsImV4cGVjdGVkUlBJRCIsImNvdW50ZXIiLCJwdWJsaWNLZXkiLCJjcmVkZW50aWFsUHVibGljS2V5IiwibG9naW5PcHRpb25zIiwiZ2VuZXJhdGVBdXRoZW50aWNhdGlvbk9wdGlvbnMiLCJ2ZXJpZnlMb2dpbiIsImF1dGhlbnRpY2F0aW9uIiwiZGJBdXRoRGF0YSIsIndlYmF1dGhuIiwiYXV0aGVudGljYXRpb25JbmZvIiwidmVyaWZ5QXV0aGVudGljYXRpb25SZXNwb25zZSIsImF1dGhlbnRpY2F0b3IiLCJjcmVkZW50aWFsSUQiLCJCdWZmZXIiLCJmcm9tIiwibmV3Q291bnRlciIsImNoYWxsZW5nZURhdGEiLCJhdXRoRGF0YSIsImFkYXB0ZXJDb25maWciLCJyZXF1ZXN0IiwidmFsaWRhdGVTZXRVcCIsIm1hc3RlciIsInNhdmUiLCJ2YWxpZGF0ZVVwZGF0ZSIsInZhbGlkYXRlTG9naW4iLCJvcmlnaW5hbCIsInBvbGljeSJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL3dlYmF1dGhuLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogV2ViQXV0aG4gQWRhcHRlciBjYW4gYmUgdXNlZCBhcyBhbiBhbHRlcm5hdGl2ZSB3YXkgdG8gbG9naW5cbiAqIFNpbmNlIHdlIGNhbm5vdCBzdXBwb3J0IGN1cnJlbnRseSBzaWdudXAgd2l0aCB3ZWJhdXRobiB3aWxsIHRocm93IGFuIGVycm9yIChkdWUgdG8gbGFjayBvZiByZXNldCBwcm9jZXNzKVxuICogVXNlciBuZWVkIHRvIGJlIGxvZ2dlZCBpbiB0byBzZXR1cCB0aGUgd2ViYXV0aG4gcHJvdmlkZXJcbiAqL1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVSZWdpc3RyYXRpb25PcHRpb25zLFxuICB2ZXJpZnlSZWdpc3RyYXRpb25SZXNwb25zZSxcbiAgZ2VuZXJhdGVBdXRoZW50aWNhdGlvbk9wdGlvbnMsXG4gIHZlcmlmeUF1dGhlbnRpY2F0aW9uUmVzcG9uc2UsXG59IGZyb20gJ0BzaW1wbGV3ZWJhdXRobi9zZXJ2ZXInO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgc2lnbiwgdmVyaWZ5IH0gZnJvbSAnanNvbndlYnRva2VuJztcbmltcG9ydCBjcnlwdG8gZnJvbSAnY3J5cHRvJztcblxuY29uc3QgdG9Vc2VyRnJpZW5kbHlScE5hbWUgPSB1cmwgPT4ge1xuICBjb25zdCBkb21haW4gPSBnZXREb21haW5XaXRob3V0V3d3KHVybCk7XG4gIGNvbnN0IGJhc2VEb21haW4gPSBnZXRCYXNlRG9tYWluKGRvbWFpbikuc3BsaXQoJy4nKVswXTtcbiAgY29uc3Qgd29yZHMgPSBiYXNlRG9tYWluLnNwbGl0KCctJyk7XG4gIHJldHVybiB3b3Jkc1xuICAgIC5yZWR1Y2UoKGFjYywgd29yZCkgPT4gYCR7YWNjfSAke3dvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpfWAsICcnKVxuICAgIC50cmltKCk7XG59O1xuXG5jb25zdCBnZXRKd3RTZWNyZXQgPSBjb25maWcgPT4ge1xuICBjb25zdCBoYXNoID0gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTUxMicpO1xuICBoYXNoLnVwZGF0ZShjb25maWcubWFzdGVyS2V5LCAndXRmLTgnKTtcbiAgLy8gU2VjdXJpdHk6XG4gIC8vIHNoYTUxMiByZXR1cm4gMTI4IGNoYXJzLCB3ZSBjYW4ga2VlcCBvbmx5IDY0IGNoYXJzIHNpbmNlIGl0IHJlcHJlc2VudCA2LDYxRTk4IGNvbWJpbmF0aW9uc1xuICAvLyB1c2luZyB0aGUgaGFzaCBhbGxvdyB0byByZWR1Y2UgcmlzayBvZiBjb21wcm9taXNpbmcgdGhlIG1hc3RlciBrZXlcbiAgLy8gaWYgYnJ1dGUgZm9yY2UgaXMgYXR0ZW1wdGVkIG9uIHRoZSBKV1RcbiAgcmV0dXJuIGhhc2guZGlnZXN0KCkudG9TdHJpbmcoJ2hleCcpLnNsaWNlKDY0KTtcbn07XG5cbi8vIEV4YW1wbGUgaGVyZTogaHR0cHM6Ly9yZWdleDEwMS5jb20vci93TjZjWjcvMzY1XG5jb25zdCBnZXREb21haW5XaXRob3V0V3d3ID0gdXJsID0+XG4gIC9eKD86aHR0cHM/OlxcL1xcLyk/KD86W15AXFwvXFxuXStAKT8oPzp3d3dcXC4pPyhbXjpcXC8/XFxuXSspL2cuZXhlYyh1cmwpWzFdO1xuXG5jb25zdCBnZXRCYXNlRG9tYWluID0gZG9tYWluID0+IHtcbiAgY29uc3Qgc3BsaXR0ZWREb21haW4gPSBkb21haW4uc3BsaXQoJy4nKTtcbiAgLy8gSGFuZGxlIGxvY2FsaG9zdFxuICBpZiAoc3BsaXR0ZWREb21haW4ubGVuZ3RoID09PSAxKSByZXR1cm4gZG9tYWluLnRyaW0oKTtcbiAgLy8gQ2xhc3NpYyBkb21haW5zXG4gIHJldHVybiBgJHtzcGxpdHRlZERvbWFpbltzcGxpdHRlZERvbWFpbi5sZW5ndGggLSAyXX0uJHtcbiAgICBzcGxpdHRlZERvbWFpbltzcGxpdHRlZERvbWFpbi5sZW5ndGggLSAxXVxuICB9YC50cmltKCk7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0T3JpZ2luID0gY29uZmlnID0+XG4gIGdldEJhc2VEb21haW4oZ2V0RG9tYWluV2l0aG91dFd3dyhjb25maWcucHVibGljU2VydmVyVVJMIHx8IGNvbmZpZy5zZXJ2ZXJVUkwpKTtcblxuY29uc3QgZXh0cmFjdFNpZ25lZENoYWxsZW5nZSA9IChzaWduZWRDaGFsbGVuZ2UsIGNvbmZpZykgPT4ge1xuICBpZiAoIXNpZ25lZENoYWxsZW5nZSlcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdzaWduZWRDaGFsbGVuZ2UgaXMgcmVxdWlyZWQuJyk7XG4gIGxldCBleHBlY3RlZENoYWxsZW5nZTtcbiAgdHJ5IHtcbiAgICBleHBlY3RlZENoYWxsZW5nZSA9IHZlcmlmeShzaWduZWRDaGFsbGVuZ2UsIGdldEp3dFNlY3JldChjb25maWcpKS5jaGFsbGVuZ2U7XG4gICAgaWYgKCFleHBlY3RlZENoYWxsZW5nZSkgdGhyb3cgbmV3IEVycm9yKCk7XG4gICAgcmV0dXJuIGV4cGVjdGVkQ2hhbGxlbmdlO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnSW52YWxpZCBzaWduZWRDaGFsbGVuZ2UnKTtcbiAgfVxufTtcblxuLy8gUmV0dXJuIGNyZWRlbnRpYWxzIG9wdGlvbnMgdG8gdGhlIGNsaWVudFxuLy8gZm9yIHJlZ2lzdGVyIHB1YmxpYyBrZXkgcHJvY2Vzc1xuY29uc3QgcmVnaXN0ZXJPcHRpb25zID0gKHVzZXIsIG9wdGlvbnMgPSB7fSwgY29uZmlnKSA9PiB7XG4gIGNvbnN0IHJlZ2lzdHJhdGlvbk9wdGlvbnMgPSBnZW5lcmF0ZVJlZ2lzdHJhdGlvbk9wdGlvbnMoe1xuICAgIHJwTmFtZTpcbiAgICAgIChvcHRpb25zICYmIG9wdGlvbnMucnBOYW1lKSB8fFxuICAgICAgdG9Vc2VyRnJpZW5kbHlScE5hbWUoY29uZmlnLnB1YmxpY1NlcnZlclVSTCB8fCBjb25maWcuc2VydmVyVVJMKSxcbiAgICBycElEOiBvcHRpb25zLnJwSWQgfHwgZ2V0T3JpZ2luKGNvbmZpZyksXG4gICAgLy8gaGVyZSB1c2VySWQgaXMgb25seSB1c2VkIGFzIGFuIGlkZW50aWZpZXIgYW5kIHRoaXMgaXMgbmV2ZXJcbiAgICAvLyByZXRyaWV2ZWQgYnkgdGhlIHVzZXIgZGV2aWNlXG4gICAgLy8gdGhpcyBoYXMgbm90IHJlYWwgdmFsdWUgZm9yIHBhcnNlXG4gICAgdXNlcklEOiB1c2VyLmlkLFxuICAgIC8vIENvdWxkIGJlIGFuIGVtYWlsIG9yIGEgZmlyc3RuYW1lIGxhc3RuYW1lIGRlcGVuZGluZyBvZlxuICAgIC8vIHRoZSBkZXZlbG9wZXIgdXNhZ2VcbiAgICB1c2VyRGlzcGxheU5hbWU6XG4gICAgICB0eXBlb2Ygb3B0aW9ucy5nZXRVc2VyRGlzcGxheU5hbWUgPT09ICdmdW5jdGlvbidcbiAgICAgICAgPyBvcHRpb25zLmdldFVzZXJEaXNwbGF5TmFtZSh1c2VyKVxuICAgICAgICA6IHVzZXIuZ2V0KCdlbWFpbCcpIHx8IHVzZXIuZ2V0KCd1c2VybmFtZScpLFxuICAgIHVzZXJOYW1lOlxuICAgICAgdHlwZW9mIG9wdGlvbnMuZ2V0VXNlcm5hbWUgPT09ICdmdW5jdGlvbicgPyBvcHRpb25zLmdldFVzZXJuYW1lKHVzZXIpIDogdXNlci5nZXQoJ3VzZXJuYW1lJyksXG4gICAgdGltZW91dDogNjAwMDAsXG4gICAgYXR0ZXN0YXRpb25UeXBlOiBvcHRpb25zLmF0dGVzdGF0aW9uVHlwZSB8fCAnaW5kaXJlY3QnLFxuICAgIGF1dGhlbnRpY2F0b3JTZWxlY3Rpb246IHtcbiAgICAgIC8vIFVzZSByZXF1aXJlZCB0byBhdm9pZCBzaWxlbnQgc2lnbiB1cFxuICAgICAgdXNlclZlcmlmaWNhdGlvbjogb3B0aW9ucy51c2VyVmVyaWZpY2F0aW9uIHx8ICdyZXF1aXJlZCcsXG4gICAgICByZXNpZGVudEtleTogb3B0aW9ucy5yZXNpZGVudEtleSB8fCAncHJlZmVycmVkJyxcbiAgICB9LFxuICB9KTtcbiAgcmV0dXJuIHtcbiAgICAvLyBVc2Ugand0IHNpZ25lZCBjaGFsbGVuZ2UgdG8gYXZvaWQgc3RvcmluZyBjaGFsbGVuZ2UgaW4gREJcbiAgICAvLyBNYXN0ZXIga2V5IGlzIGNvbnNpZGVyZWQgc2FmZSBoZXJlIHRvIHNpZ24gdGhlIGNoYWxsZW5nZVxuICAgIC8vIEFkZCBhZGRpdGlvbmFsIDIwc2VjIGZvciBhIGJhZCBuZXR3b3JrIGxhdGVuY3lcbiAgICBzaWduZWRDaGFsbGVuZ2U6IHNpZ24oeyBjaGFsbGVuZ2U6IHJlZ2lzdHJhdGlvbk9wdGlvbnMuY2hhbGxlbmdlIH0sIGdldEp3dFNlY3JldChjb25maWcpLCB7XG4gICAgICBleHBpcmVzSW46IHJlZ2lzdHJhdGlvbk9wdGlvbnMudGltZW91dCArIDIwMDAwLFxuICAgIH0pLFxuICAgIG9wdGlvbnM6IHJlZ2lzdHJhdGlvbk9wdGlvbnMsXG4gIH07XG59O1xuXG4vLyBWZXJpZnkgdGhlIHJlZ2lzdHJhdGlvbiBwcm92aWRlZCBieSB0aGUgY2xpZW50XG5jb25zdCB2ZXJpZnlSZWdpc3RlciA9IGFzeW5jICh7IHNpZ25lZENoYWxsZW5nZSwgcmVnaXN0cmF0aW9uIH0sIG9wdGlvbnMgPSB7fSwgY29uZmlnKSA9PiB7XG4gIGlmICghcmVnaXN0cmF0aW9uKSB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdyZWdpc3RyYXRpb24gaXMgcmVxdWlyZWQuJyk7XG4gIGNvbnN0IGV4cGVjdGVkQ2hhbGxlbmdlID0gZXh0cmFjdFNpZ25lZENoYWxsZW5nZShzaWduZWRDaGFsbGVuZ2UsIGNvbmZpZyk7XG4gIHRyeSB7XG4gICAgY29uc3QgeyB2ZXJpZmllZCwgcmVnaXN0cmF0aW9uSW5mbyB9ID0gYXdhaXQgdmVyaWZ5UmVnaXN0cmF0aW9uUmVzcG9uc2Uoe1xuICAgICAgY3JlZGVudGlhbDogcmVnaXN0cmF0aW9uLFxuICAgICAgZXhwZWN0ZWRDaGFsbGVuZ2UsXG4gICAgICBleHBlY3RlZE9yaWdpbjogb3B0aW9ucy5vcmlnaW4gfHwgZ2V0T3JpZ2luKGNvbmZpZyksXG4gICAgICBleHBlY3RlZFJQSUQ6IG9wdGlvbnMucnBJZCB8fCBnZXRPcmlnaW4oY29uZmlnKSxcbiAgICB9KTtcbiAgICBpZiAodmVyaWZpZWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvdW50ZXI6IHJlZ2lzdHJhdGlvbkluZm8uY291bnRlcixcbiAgICAgICAgcHVibGljS2V5OiByZWdpc3RyYXRpb25JbmZvLmNyZWRlbnRpYWxQdWJsaWNLZXkudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuICAgICAgICBpZDogcmVnaXN0cmF0aW9uLmlkLFxuICAgICAgfTtcbiAgICB9XG4gICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGZhaWwgc2FmZSAqL1xuICAgIHRocm93IG5ldyBFcnJvcigpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnSW52YWxpZCB3ZWJhdXRobiByZWdpc3RyYXRpb24nKTtcbiAgfVxufTtcblxuY29uc3QgbG9naW5PcHRpb25zID0gY29uZmlnID0+IHtcbiAgY29uc3Qgb3B0aW9ucyA9IGdlbmVyYXRlQXV0aGVudGljYXRpb25PcHRpb25zKCk7XG4gIHJldHVybiB7XG4gICAgb3B0aW9ucyxcbiAgICBzaWduZWRDaGFsbGVuZ2U6IHNpZ24oeyBjaGFsbGVuZ2U6IG9wdGlvbnMuY2hhbGxlbmdlIH0sIGdldEp3dFNlY3JldChjb25maWcpLCB7XG4gICAgICBleHBpcmVzSW46IG9wdGlvbnMudGltZW91dCArIDIwMDAwLFxuICAgIH0pLFxuICB9O1xufTtcblxuY29uc3QgdmVyaWZ5TG9naW4gPSAoeyBhdXRoZW50aWNhdGlvbiwgc2lnbmVkQ2hhbGxlbmdlIH0sIG9wdGlvbnMgPSB7fSwgY29uZmlnLCB1c2VyKSA9PiB7XG4gIGNvbnN0IGRiQXV0aERhdGEgPSB1c2VyICYmIHVzZXIuZ2V0KCdhdXRoRGF0YScpICYmIHVzZXIuZ2V0KCdhdXRoRGF0YScpLndlYmF1dGhuO1xuICBpZiAoIWF1dGhlbnRpY2F0aW9uKVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2F1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkLicpO1xuICBjb25zdCBleHBlY3RlZENoYWxsZW5nZSA9IGV4dHJhY3RTaWduZWRDaGFsbGVuZ2Uoc2lnbmVkQ2hhbGxlbmdlLCBjb25maWcpO1xuICB0cnkge1xuICAgIGNvbnN0IHsgdmVyaWZpZWQsIGF1dGhlbnRpY2F0aW9uSW5mbyB9ID0gdmVyaWZ5QXV0aGVudGljYXRpb25SZXNwb25zZSh7XG4gICAgICBjcmVkZW50aWFsOiBhdXRoZW50aWNhdGlvbixcbiAgICAgIGV4cGVjdGVkQ2hhbGxlbmdlLFxuICAgICAgZXhwZWN0ZWRPcmlnaW46IG9wdGlvbnMub3JpZ2luIHx8IGdldE9yaWdpbihjb25maWcpLFxuICAgICAgZXhwZWN0ZWRSUElEOiBvcHRpb25zLnJwSWQgfHwgZ2V0T3JpZ2luKGNvbmZpZyksXG4gICAgICBhdXRoZW50aWNhdG9yOiB7XG4gICAgICAgIGNyZWRlbnRpYWxJRDogQnVmZmVyLmZyb20oZGJBdXRoRGF0YS5pZCwgJ2Jhc2U2NCcpLFxuICAgICAgICBjb3VudGVyOiBkYkF1dGhEYXRhLmNvdW50ZXIsXG4gICAgICAgIGNyZWRlbnRpYWxQdWJsaWNLZXk6IEJ1ZmZlci5mcm9tKGRiQXV0aERhdGEucHVibGljS2V5LCAnYmFzZTY0JyksXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmICh2ZXJpZmllZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgLi4uZGJBdXRoRGF0YSxcbiAgICAgICAgY291bnRlcjogYXV0aGVudGljYXRpb25JbmZvLm5ld0NvdW50ZXIsXG4gICAgICB9O1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogZmFpbCBzYWZlICovXG4gICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdJbnZhbGlkIHdlYmF1dGhuIGF1dGhlbnRpY2F0aW9uJyk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjaGFsbGVuZ2UgPSBhc3luYyAoY2hhbGxlbmdlRGF0YSwgYXV0aERhdGEsIGFkYXB0ZXJDb25maWcgPSB7fSwgcmVxdWVzdCwgY29uZmlnKSA9PiB7XG4gIC8vIEFsbG93IGxvZ2dlZCB1c2VyIHRvIHVwZGF0ZS9zZXRVcCB3ZWJhdXRoblxuICBpZiAocmVxdWVzdC51c2VyICYmIHJlcXVlc3QudXNlci5pZCkge1xuICAgIHJldHVybiByZWdpc3Rlck9wdGlvbnMocmVxdWVzdC51c2VyLCBhZGFwdGVyQ29uZmlnLm9wdGlvbnMsIGNvbmZpZyk7XG4gIH1cblxuICByZXR1cm4gbG9naW5PcHRpb25zKGNvbmZpZyk7XG59O1xuXG5leHBvcnQgY29uc3QgdmFsaWRhdGVTZXRVcCA9IGFzeW5jIChhdXRoRGF0YSwgYWRhcHRlckNvbmZpZyA9IHt9LCByZXF1ZXN0LCBjb25maWcpID0+IHtcbiAgaWYgKCFyZXF1ZXN0LnVzZXIgJiYgIXJlcXVlc3QubWFzdGVyKVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgJ1dlYmF1dGhuIGNhbiBvbmx5IGJlIGNvbmZpZ3VyZWQgb24gYW4gYWxyZWFkeSBsb2dnZWQgaW4gdXNlci4nXG4gICAgKTtcbiAgcmV0dXJuIHsgc2F2ZTogYXdhaXQgdmVyaWZ5UmVnaXN0ZXIoYXV0aERhdGEsIGFkYXB0ZXJDb25maWcub3B0aW9ucywgY29uZmlnKSB9O1xufTtcblxuZXhwb3J0IGNvbnN0IHZhbGlkYXRlVXBkYXRlID0gdmFsaWRhdGVTZXRVcDtcblxuZXhwb3J0IGNvbnN0IHZhbGlkYXRlTG9naW4gPSBhc3luYyAoYXV0aERhdGEsIGFkYXB0ZXJDb25maWcgPSB7fSwgcmVxdWVzdCwgY29uZmlnKSA9PiB7XG4gIGlmICghcmVxdWVzdC5vcmlnaW5hbClcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdVc2VyIG5vdCBmb3VuZCBmb3Igd2ViYXV0aG4gbG9naW4uJyk7XG4gIC8vIFdpbGwgc2F2ZSB1cGRhdGVkIGNvdW50ZXIgb2YgdGhlIGNyZWRlbnRpYWxcbiAgLy8gYW5kIGF2b2lkIGNsb25lZC9idWdnZWQgYXV0aGVudGljYXRvcnNcbiAgcmV0dXJuIHsgc2F2ZTogdmVyaWZ5TG9naW4oYXV0aERhdGEsIGFkYXB0ZXJDb25maWcub3B0aW9ucywgY29uZmlnLCByZXF1ZXN0Lm9yaWdpbmFsKSB9O1xufTtcblxuZXhwb3J0IGNvbnN0IHBvbGljeSA9ICdzb2xvJztcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBS0EsSUFBQUEsT0FBQSxHQUFBQyxPQUFBO0FBTUEsSUFBQUMsS0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsYUFBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQTRCLFNBQUFFLHVCQUFBRyxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcsUUFBQUMsTUFBQSxFQUFBQyxjQUFBLFFBQUFDLElBQUEsR0FBQUMsTUFBQSxDQUFBRCxJQUFBLENBQUFGLE1BQUEsT0FBQUcsTUFBQSxDQUFBQyxxQkFBQSxRQUFBQyxPQUFBLEdBQUFGLE1BQUEsQ0FBQUMscUJBQUEsQ0FBQUosTUFBQSxHQUFBQyxjQUFBLEtBQUFJLE9BQUEsR0FBQUEsT0FBQSxDQUFBQyxN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